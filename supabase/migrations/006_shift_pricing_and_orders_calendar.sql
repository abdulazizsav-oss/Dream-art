-- ============================================================
-- Dream Art CRM — Shift pricing and order-centric bookings
-- ============================================================

ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS day_rate numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_rate numeric(10,2) NOT NULL DEFAULT 0;

UPDATE equipment
SET
  day_rate = COALESCE(NULLIF(day_rate, 0), daily_rate, 0),
  night_rate = COALESCE(NULLIF(night_rate, 0), day_rate, daily_rate, 0)
WHERE day_rate = 0
   OR night_rate = 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS start_time time NOT NULL DEFAULT '09:30',
  ADD COLUMN IF NOT EXISTS end_time time NOT NULL DEFAULT '23:00',
  ADD COLUMN IF NOT EXISTS actual_return_date date;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS day_rate_snapshot numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_rate_snapshot numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day_units integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_units integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shift_type text NOT NULL DEFAULT 'day'
    CHECK (shift_type IN ('day', 'night')),
  ADD COLUMN IF NOT EXISTS rate_source text NOT NULL DEFAULT 'auto'
    CHECK (rate_source IN ('auto', 'manual'));

UPDATE order_items
SET
  day_rate_snapshot = CASE WHEN shift_type = 'day' THEN COALESCE(NULLIF(day_rate_snapshot, 0), daily_rate, 0) ELSE COALESCE(day_rate_snapshot, 0) END,
  night_rate_snapshot = CASE WHEN shift_type = 'night' THEN COALESCE(NULLIF(night_rate_snapshot, 0), daily_rate, 0) ELSE COALESCE(NULLIF(night_rate_snapshot, 0), day_rate_snapshot, daily_rate, 0) END,
  day_units = CASE WHEN shift_type = 'day' THEN COALESCE(NULLIF(day_units, 0), days, 1) ELSE COALESCE(day_units, 0) END,
  night_units = CASE WHEN shift_type = 'night' THEN COALESCE(NULLIF(night_units, 0), days, 1) ELSE COALESCE(night_units, 0) END;

-- Re-sync legacy daily_rate with the day rate so old consumers keep working.
UPDATE equipment
SET daily_rate = day_rate
WHERE daily_rate IS DISTINCT FROM day_rate;

CREATE OR REPLACE FUNCTION create_order_atomic(
  p_client_id      uuid,
  p_start_date     date,
  p_end_date       date,
  p_deposit_amount numeric,
  p_notes          text,
  p_created_by     uuid,
  p_items          jsonb,
  p_start_time     time DEFAULT '09:30',
  p_end_time       time DEFAULT '23:00'
)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_order_id     uuid;
  v_order_number text;
  v_total        numeric := 0;
  v_item         jsonb;
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
    COALESCE(p_start_time, '09:30'),
    COALESCE(p_end_time, '23:00'),
    v_total,
    p_deposit_amount,
    p_notes,
    p_created_by
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id,
      equipment_id,
      daily_rate,
      day_rate_snapshot,
      night_rate_snapshot,
      day_units,
      night_units,
      days,
      subtotal,
      condition_on_issue,
      selected_kit_items,
      shift_type,
      rate_source
    )
    VALUES (
      v_order_id,
      (v_item->>'equipment_id')::uuid,
      COALESCE((v_item->>'daily_rate')::numeric, 0),
      COALESCE((v_item->>'day_rate_snapshot')::numeric, COALESCE((v_item->>'daily_rate')::numeric, 0)),
      COALESCE((v_item->>'night_rate_snapshot')::numeric, COALESCE((v_item->>'daily_rate')::numeric, 0)),
      COALESCE((v_item->>'day_units')::int, 0),
      COALESCE((v_item->>'night_units')::int, 0),
      COALESCE((v_item->>'days')::int, 1),
      COALESCE((v_item->>'subtotal')::numeric, 0),
      COALESCE(v_item->>'condition_on_issue', 'Хорошее'),
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_item->'selected_kit_items', '[]'::jsonb))),
        ARRAY[]::text[]
      ),
      COALESCE(v_item->>'shift_type', 'day'),
      COALESCE(v_item->>'rate_source', 'auto')
    );
  END LOOP;

  RETURN v_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION return_order_atomic(
  p_order_id uuid,
  p_items jsonb,
  p_actual_return_date date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_item jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE order_items
    SET condition_on_return = v_item->>'condition_on_return',
        return_photo_urls   = ARRAY(SELECT jsonb_array_elements_text(v_item->'return_photo_urls'))
    WHERE id = (v_item->>'order_item_id')::uuid;
  END LOOP;

  UPDATE orders
  SET status = 'returned',
      actual_return_date = COALESCE(p_actual_return_date, CURRENT_DATE)
  WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM orders WHERE status = 'active') AS active_rentals,
  (SELECT COUNT(*) FROM orders WHERE status = 'overdue') AS overdue_count,
  (SELECT COALESCE(SUM(amount), 0) FROM payments
   WHERE payment_type NOT IN ('deposit', 'deposit_return')
     AND paid_at >= date_trunc('month', now())) AS revenue_this_month,
  (SELECT COALESCE(SUM(amount), 0) FROM payments
   WHERE payment_type NOT IN ('deposit', 'deposit_return')
     AND paid_at >= date_trunc('week', now())) AS revenue_this_week,
  (SELECT COALESCE(SUM(amount), 0) FROM payments
   WHERE payment_type NOT IN ('deposit', 'deposit_return')
     AND paid_at >= date_trunc('day', now())) AS revenue_today,
  (SELECT COUNT(*) FROM equipment) AS equipment_free,
  0::bigint AS equipment_rented,
  (SELECT COUNT(*) FROM equipment WHERE status = 'maintenance') AS equipment_maintenance,
  (SELECT COUNT(*) FROM clients) AS total_clients;
