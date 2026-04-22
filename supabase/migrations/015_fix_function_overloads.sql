-- ============================================================
-- Fix: Drop all old function overloads that cause ambiguity
-- PostgreSQL "CREATE OR REPLACE" with different signatures creates
-- NEW overloads instead of replacing. This migration drops ALL old
-- signatures and re-creates definitive single versions.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. Drop ALL overloads of return_order_atomic
-- ──────────────────────────────────────────────────────────────
-- Old signature from migration 003 (2 args)
DROP FUNCTION IF EXISTS return_order_atomic(uuid, jsonb);
-- Old signature from migration 006 / 013 (3 args with default)
DROP FUNCTION IF EXISTS return_order_atomic(uuid, jsonb, date);

-- Re-create the definitive version (from migration 013, with kit tracking + actual_end_at)
CREATE OR REPLACE FUNCTION return_order_atomic(
  p_order_id uuid,
  p_items jsonb,
  p_actual_return_date date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_item jsonb;
  v_equipment_id uuid;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE order_items
    SET condition_on_return = v_item->>'condition_on_return',
        return_photo_urls   = COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(v_item->'return_photo_urls')),
          '{}'::text[]
        ),
        returned_kit_items  = COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(v_item->'returned_kit_items')),
          '{}'::text[]
        ),
        missing_kit_items   = COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(v_item->'missing_kit_items')),
          '{}'::text[]
        )
    WHERE id = (v_item->>'order_item_id')::uuid
    RETURNING equipment_id INTO v_equipment_id;

    -- Reset equipment status to free
    IF v_equipment_id IS NOT NULL THEN
      UPDATE equipment SET status = 'free' WHERE id = v_equipment_id;
    END IF;
  END LOOP;

  UPDATE orders
  SET status = 'returned',
      actual_return_date = COALESCE(p_actual_return_date, CURRENT_DATE),
      actual_end_at = now()
  WHERE id = p_order_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. Drop ALL overloads of create_order_atomic
-- ──────────────────────────────────────────────────────────────
-- Old signature from migration 003 (7 args)
DROP FUNCTION IF EXISTS create_order_atomic(uuid, date, date, numeric, text, uuid, jsonb);
-- Old signature from migration 006 (9 args: 7 + time, time)
DROP FUNCTION IF EXISTS create_order_atomic(uuid, date, date, numeric, text, uuid, jsonb, time, time);
-- Old signature from migration 014 (9 args: with text times before deposit)
DROP FUNCTION IF EXISTS create_order_atomic(uuid, date, date, text, text, numeric, text, uuid, jsonb);

-- Re-create the definitive version (based on migration 014, with time-aware availability)
CREATE OR REPLACE FUNCTION create_order_atomic(
  p_client_id      uuid,
  p_start_date     date,
  p_end_date       date,
  p_start_time     text,
  p_end_time       text,
  p_deposit_amount numeric,
  p_notes          text,
  p_created_by     uuid,
  p_items          jsonb
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_order_id     uuid;
  v_order_number text;
  v_total        numeric := 0;
  v_item         jsonb;
  v_equipment_id uuid;
  v_eq_name      text;
  v_conflict_no  text;
  v_start_t      time := COALESCE(NULLIF(p_start_time, '')::time, '09:30'::time);
  v_end_t        time := COALESCE(NULLIF(p_end_time,   '')::time, '23:00'::time);
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_equipment_id := (v_item->>'equipment_id')::uuid;
    IF NOT check_equipment_availability_tr(
      v_equipment_id, p_start_date, v_start_t, p_end_date, v_end_t
    ) THEN
      SELECT name INTO v_eq_name FROM equipment WHERE id = v_equipment_id;

      SELECT o.order_number INTO v_conflict_no
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE oi.equipment_id = v_equipment_id
        AND o.status NOT IN ('returned', 'cancelled')
        AND (o.start_date + COALESCE(NULLIF(o.start_time::text, '')::time, '00:00'::time))
            < (p_end_date + v_end_t)
        AND (o.end_date + COALESCE(NULLIF(o.end_time::text, '')::time, '23:59'::time))
            > (p_start_date + v_start_t)
      ORDER BY o.start_date, o.start_time
      LIMIT 1;

      IF v_conflict_no IS NOT NULL THEN
        RAISE EXCEPTION '«%» занят в выбранный период (уже в заказе %)',
          COALESCE(v_eq_name, 'Техника'), v_conflict_no;
      ELSE
        RAISE EXCEPTION '«%» недоступен на выбранные даты',
          COALESCE(v_eq_name, 'Техника');
      END IF;
    END IF;
  END LOOP;

  v_order_number := generate_order_number();

  SELECT COALESCE(SUM((item->>'subtotal')::numeric), 0) INTO v_total
  FROM jsonb_array_elements(p_items) AS item;

  INSERT INTO orders (order_number, client_id, status, start_date, end_date,
                      start_time, end_time,
                      total_amount, deposit_amount, notes, created_by)
  VALUES (v_order_number, p_client_id, 'active', p_start_date, p_end_date,
          v_start_t::text, v_end_t::text,
          v_total, p_deposit_amount, p_notes, p_created_by)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_equipment_id := (v_item->>'equipment_id')::uuid;

    INSERT INTO order_items (
      order_id, equipment_id,
      daily_rate, days, subtotal,
      shift_type, rate_source,
      day_rate_snapshot, night_rate_snapshot,
      day_units, night_units,
      condition_on_issue, selected_kit_items
    )
    VALUES (
      v_order_id, v_equipment_id,
      (v_item->>'daily_rate')::numeric,
      (v_item->>'days')::int,
      (v_item->>'subtotal')::numeric,
      COALESCE(v_item->>'shift_type', 'day'),
      COALESCE(v_item->>'rate_source', 'auto'),
      COALESCE((v_item->>'day_rate_snapshot')::numeric, 0),
      COALESCE((v_item->>'night_rate_snapshot')::numeric, 0),
      COALESCE((v_item->>'day_units')::int, 0),
      COALESCE((v_item->>'night_units')::int, 0),
      COALESCE(v_item->>'condition_on_issue', 'Хорошее'),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(v_item->'selected_kit_items')),
        '{}'::text[]
      )
    );

    UPDATE equipment SET status = 'rented' WHERE id = v_equipment_id;
  END LOOP;

  RETURN v_order_id;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. Drop old check_equipment_availability (date-only version)
-- ──────────────────────────────────────────────────────────────
-- Keep only the time-aware version from migration 014
DROP FUNCTION IF EXISTS check_equipment_availability(uuid, date, date, uuid);

-- ──────────────────────────────────────────────────────────────
-- 4. Fix stuck equipment: reset any 'rented' equipment whose
--    orders are all returned/cancelled back to 'free'
-- ──────────────────────────────────────────────────────────────
UPDATE equipment SET status = 'free'
WHERE status = 'rented'
  AND id NOT IN (
    SELECT DISTINCT oi.equipment_id
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status IN ('active', 'overdue', 'draft')
  );
