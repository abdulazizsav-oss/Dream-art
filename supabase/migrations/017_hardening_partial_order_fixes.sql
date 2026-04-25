-- ============================================================
-- Dream Art CRM — hardening + partial-order catch-up
-- ============================================================

-- Keep migrations aligned with the application/types generated after the
-- partial-return work. Everything is idempotent so it can be applied to the
-- VPS database that already has part of this schema.

CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  logo_url text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_brands" ON brands;
CREATE POLICY "auth_all_brands" ON brands
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE equipment_categories
  ADD COLUMN IF NOT EXISTS photo_url text;

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kit_items text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS day_night text NOT NULL DEFAULT 'both'
    CHECK (day_night IN ('day', 'night', 'both'));

CREATE INDEX IF NOT EXISTS idx_equipment_brand_id ON equipment(brand_id);

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS instagram_username text,
  ADD COLUMN IF NOT EXISTS facebook_username text,
  ADD COLUMN IF NOT EXISTS address_actual text,
  ADD COLUMN IF NOT EXISTS address_registered text,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS trusted_person_name text,
  ADD COLUMN IF NOT EXISTS trusted_person_phone text,
  ADD COLUMN IF NOT EXISTS trusted_person_relation text;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS trusted_person text,
  ADD COLUMN IF NOT EXISTS trusted_person_doc_type text;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS selected_kit_items text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS returned_kit_items text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS missing_kit_items text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS actual_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS actual_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS final_subtotal numeric(10,2),
  ADD COLUMN IF NOT EXISTS final_day_units int,
  ADD COLUMN IF NOT EXISTS final_night_units int,
  ADD COLUMN IF NOT EXISTS returned boolean NOT NULL DEFAULT false;

UPDATE order_items oi
SET
  actual_start_at = COALESCE(oi.actual_start_at, o.actual_start_at, o.created_at),
  actual_end_at = CASE
    WHEN o.status = 'returned' THEN COALESCE(oi.actual_end_at, o.actual_end_at, o.updated_at)
    ELSE oi.actual_end_at
  END,
  final_subtotal = CASE
    WHEN o.status = 'returned' THEN COALESCE(oi.final_subtotal, oi.subtotal)
    ELSE oi.final_subtotal
  END,
  final_day_units = CASE
    WHEN o.status = 'returned' THEN COALESCE(oi.final_day_units, oi.day_units)
    ELSE oi.final_day_units
  END,
  final_night_units = CASE
    WHEN o.status = 'returned' THEN COALESCE(oi.final_night_units, oi.night_units)
    ELSE oi.final_night_units
  END,
  returned = CASE WHEN o.status = 'returned' THEN true ELSE oi.returned END
FROM orders o
WHERE oi.order_id = o.id;

CREATE INDEX IF NOT EXISTS idx_order_items_active_by_order
  ON order_items(order_id)
  WHERE returned = false;

CREATE INDEX IF NOT EXISTS idx_order_items_active_by_equipment
  ON order_items(equipment_id)
  WHERE returned = false;

-- Authenticated users may read profile names/roles for joins, but profile
-- mutation is now only done through service-role API routes.
DROP POLICY IF EXISTS "auth_all_user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "auth_select_user_profiles" ON user_profiles;
CREATE POLICY "auth_select_user_profiles" ON user_profiles
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION return_order_items_atomic(
  p_order_id uuid,
  p_items jsonb
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_item jsonb;
  v_order_item_id uuid;
  v_equipment_id uuid;
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
      AND returned = false
    RETURNING equipment_id INTO v_equipment_id;

    IF v_equipment_id IS NOT NULL THEN
      UPDATE equipment e
      SET status = 'free'
      WHERE e.id = v_equipment_id
        AND NOT EXISTS (
          SELECT 1
          FROM order_items oi
          JOIN orders o ON o.id = oi.order_id
          WHERE oi.equipment_id = v_equipment_id
            AND oi.returned = false
            AND o.status IN ('draft', 'active', 'overdue')
        );
    END IF;
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

CREATE OR REPLACE FUNCTION add_order_items_atomic(
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
  v_start_date date := (now() AT TIME ZONE 'Asia/Tashkent')::date;
  v_start_time time := (now() AT TIME ZONE 'Asia/Tashkent')::time;
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

    IF NOT check_equipment_availability_tr(
      v_equipment_id,
      v_start_date,
      v_start_time,
      GREATEST(v_order.end_date, v_start_date),
      CASE WHEN v_order.end_date < v_start_date THEN '23:59'::time ELSE v_order.end_time END,
      p_order_id
    ) THEN
      RAISE EXCEPTION 'Техника % недоступна для дозаказа', v_equipment_id;
    END IF;

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
    UPDATE equipment SET status = 'rented' WHERE id = v_equipment_id;
  END LOOP;

  RETURN v_inserted_ids;
END;
$$;

CREATE OR REPLACE FUNCTION return_order_atomic(
  p_order_id uuid,
  p_items jsonb,
  p_actual_return_date date DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM return_order_items_atomic(p_order_id, p_items);

  UPDATE orders
  SET actual_return_date = COALESCE(p_actual_return_date, actual_return_date)
  WHERE id = p_order_id
    AND status = 'returned';
END;
$$;

CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM orders WHERE status = 'active') AS active_rentals,
  (SELECT COUNT(*) FROM orders WHERE status = 'overdue') AS overdue_count,
  (SELECT COALESCE(SUM(amount), 0) FROM payments
   WHERE payment_type NOT IN ('deposit', 'deposit_return')
     AND paid_at >= date_trunc('day', now())) AS revenue_today,
  (SELECT COALESCE(SUM(amount), 0) FROM payments
   WHERE payment_type NOT IN ('deposit', 'deposit_return')
     AND paid_at >= date_trunc('month', now())) AS revenue_this_month,
  (SELECT COALESCE(SUM(amount), 0) FROM payments
   WHERE payment_type NOT IN ('deposit', 'deposit_return')
     AND paid_at >= date_trunc('week', now())) AS revenue_this_week,
  (SELECT COUNT(*) FROM equipment WHERE status = 'free') AS equipment_free,
  (SELECT COUNT(*) FROM equipment WHERE status = 'rented') AS equipment_rented,
  (SELECT COUNT(*) FROM equipment WHERE status = 'maintenance') AS equipment_maintenance,
  (SELECT COUNT(*) FROM clients) AS total_clients;
