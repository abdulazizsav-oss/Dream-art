-- Dream Art CRM
-- Remove equipment availability/stock blocking from order creation.
-- Equipment can be added to any order regardless of who already has it.

DROP INDEX IF EXISTS public.order_items_one_open_equipment_per_order_idx;

UPDATE public.equipment
SET status = 'free'
WHERE status = 'rented';

CREATE OR REPLACE FUNCTION public.check_equipment_availability_tr(
  p_equipment_id uuid,
  p_start_date date,
  p_start_time time,
  p_end_date date,
  p_end_time time,
  p_exclude_order_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT true;
$$;

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_client_id uuid,
  p_start_date date,
  p_end_date date,
  p_start_time text,
  p_end_time text,
  p_deposit_amount numeric,
  p_notes text,
  p_created_by uuid,
  p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_total numeric := 0;
  v_item jsonb;
  v_equipment_id uuid;
  v_start_t time := COALESCE(NULLIF(p_start_time, '')::time, '09:30'::time);
  v_end_t time := COALESCE(NULLIF(p_end_time, '')::time, '23:00'::time);
BEGIN
  v_order_number := generate_order_number();

  SELECT COALESCE(SUM((item->>'subtotal')::numeric), 0) INTO v_total
  FROM jsonb_array_elements(p_items) AS item;

  INSERT INTO orders (
    order_number,
    client_id,
    status,
    start_date,
    end_date,
    start_time,
    end_time,
    total_amount,
    deposit_amount,
    notes,
    created_by
  )
  VALUES (
    v_order_number,
    p_client_id,
    'active',
    p_start_date,
    p_end_date,
    v_start_t::text,
    v_end_t::text,
    v_total,
    p_deposit_amount,
    p_notes,
    p_created_by
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_equipment_id := (v_item->>'equipment_id')::uuid;

    INSERT INTO order_items (
      order_id,
      equipment_id,
      daily_rate,
      days,
      subtotal,
      shift_type,
      rate_source,
      day_rate_snapshot,
      night_rate_snapshot,
      day_units,
      night_units,
      condition_on_issue,
      selected_kit_items
    )
    VALUES (
      v_order_id,
      v_equipment_id,
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
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'selected_kit_items', '[]'::jsonb))),
        '{}'::text[]
      )
    );
  END LOOP;

  RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_order_items_atomic(
  p_order_id uuid,
  p_items jsonb,
  p_added_by uuid
) RETURNS uuid[]
LANGUAGE plpgsql AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_item jsonb;
  v_equipment_id uuid;
  v_inserted_id uuid;
  v_inserted_ids uuid[] := '{}';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден';
  END IF;

  IF v_order.status NOT IN ('active', 'overdue') THEN
    RAISE EXCEPTION 'Дозаказ доступен только для активного заказа';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_equipment_id := (v_item->>'equipment_id')::uuid;

    INSERT INTO order_items (
      order_id,
      equipment_id,
      daily_rate,
      days,
      subtotal,
      shift_type,
      rate_source,
      day_rate_snapshot,
      night_rate_snapshot,
      day_units,
      night_units,
      condition_on_issue,
      selected_kit_items,
      actual_start_at,
      returned
    )
    VALUES (
      p_order_id,
      v_equipment_id,
      COALESCE((v_item->>'daily_rate')::numeric, 0),
      COALESCE((v_item->>'days')::int, 1),
      COALESCE((v_item->>'subtotal')::numeric, 0),
      COALESCE(v_item->>'shift_type', 'day'),
      COALESCE(v_item->>'rate_source', 'auto'),
      COALESCE((v_item->>'day_rate_snapshot')::numeric, COALESCE((v_item->>'daily_rate')::numeric, 0)),
      COALESCE((v_item->>'night_rate_snapshot')::numeric, COALESCE((v_item->>'daily_rate')::numeric, 0)),
      COALESCE((v_item->>'day_units')::int, 1),
      COALESCE((v_item->>'night_units')::int, 0),
      COALESCE(v_item->>'condition_on_issue', 'Хорошее'),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'selected_kit_items', '[]'::jsonb))),
        '{}'::text[]
      ),
      now(),
      false
    )
    RETURNING id INTO v_inserted_id;

    v_inserted_ids := array_append(v_inserted_ids, v_inserted_id);
  END LOOP;

  RETURN v_inserted_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.return_order_items_atomic(
  p_order_id uuid,
  p_items jsonb
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_item jsonb;
  v_order_item_id uuid;
  v_open_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_order_item_id := (v_item->>'order_item_id')::uuid;

    UPDATE order_items
    SET
      condition_on_return = v_item->>'condition_on_return',
      return_photo_urls = COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'return_photo_urls', '[]'::jsonb))),
        '{}'::text[]
      ),
      returned_kit_items = COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'returned_kit_items', '[]'::jsonb))),
        '{}'::text[]
      ),
      missing_kit_items = COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'missing_kit_items', '[]'::jsonb))),
        '{}'::text[]
      ),
      final_subtotal = COALESCE((v_item->>'final_subtotal')::numeric, subtotal),
      final_day_units = COALESCE((v_item->>'final_day_units')::int, day_units),
      final_night_units = COALESCE((v_item->>'final_night_units')::int, night_units),
      subtotal = COALESCE((v_item->>'final_subtotal')::numeric, subtotal),
      day_units = COALESCE((v_item->>'final_day_units')::int, day_units),
      night_units = COALESCE((v_item->>'final_night_units')::int, night_units),
      shift_type = COALESCE(v_item->>'shift_type', shift_type),
      actual_end_at = now(),
      returned = true
    WHERE id = v_order_item_id
      AND order_id = p_order_id
      AND returned = false;
  END LOOP;

  SELECT COUNT(*) INTO v_open_count
  FROM order_items
  WHERE order_id = p_order_id
    AND returned = false;

  UPDATE orders
  SET
    total_amount = COALESCE((
      SELECT SUM(subtotal)
      FROM order_items
      WHERE order_id = p_order_id
    ), 0),
    status = CASE WHEN v_open_count = 0 THEN 'returned' ELSE status END,
    actual_return_date = CASE WHEN v_open_count = 0 THEN CURRENT_DATE ELSE actual_return_date END,
    actual_end_at = CASE WHEN v_open_count = 0 THEN now() ELSE actual_end_at END
  WHERE id = p_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(
  uuid, date, date, text, text, numeric, text, uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(
  uuid, date, date, text, text, numeric, text, uuid, jsonb
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.add_order_items_atomic(
  uuid, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_order_items_atomic(
  uuid, jsonb, uuid
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.return_order_items_atomic(
  uuid, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.return_order_items_atomic(
  uuid, jsonb
) TO service_role;
