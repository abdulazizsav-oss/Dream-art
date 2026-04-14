-- ============================================================
-- Dream Art CRM — Functions and Views
-- ============================================================

-- Check equipment availability for a given date range
-- Returns TRUE if the equipment is available (not booked, not blocked)
CREATE OR REPLACE FUNCTION check_equipment_availability(
  p_equipment_id uuid,
  p_start_date   date,
  p_end_date     date,
  p_exclude_order_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  conflict_count int;
BEGIN
  -- Check existing orders
  SELECT COUNT(*) INTO conflict_count
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE oi.equipment_id = p_equipment_id
    AND o.status NOT IN ('returned', 'cancelled')
    AND (p_exclude_order_id IS NULL OR o.id != p_exclude_order_id)
    AND NOT (p_start_date > o.end_date OR p_end_date < o.start_date);

  IF conflict_count > 0 THEN
    RETURN false;
  END IF;

  -- Check blocked dates
  SELECT COUNT(*) INTO conflict_count
  FROM blocked_dates
  WHERE equipment_id = p_equipment_id
    AND NOT (p_start_date > end_date OR p_end_date < start_date);

  RETURN conflict_count = 0;
END;
$$;

-- Create order atomically: insert order + items + update equipment status
CREATE OR REPLACE FUNCTION create_order_atomic(
  p_client_id      uuid,
  p_start_date     date,
  p_end_date       date,
  p_deposit_amount numeric,
  p_notes          text,
  p_created_by     uuid,
  p_items          jsonb  -- [{equipment_id, daily_rate, days, subtotal, condition_on_issue}]
)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_order_id     uuid;
  v_order_number text;
  v_total        numeric := 0;
  v_item         jsonb;
  v_equipment_id uuid;
BEGIN
  -- Validate availability for all items first
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_equipment_id := (v_item->>'equipment_id')::uuid;
    IF NOT check_equipment_availability(v_equipment_id, p_start_date, p_end_date) THEN
      RAISE EXCEPTION 'Equipment % is not available for the selected dates', v_equipment_id;
    END IF;
  END LOOP;

  -- Generate order number
  v_order_number := generate_order_number();

  -- Calculate total
  SELECT SUM((item->>'subtotal')::numeric) INTO v_total
  FROM jsonb_array_elements(p_items) AS item;

  -- Insert order
  INSERT INTO orders (order_number, client_id, status, start_date, end_date,
                      total_amount, deposit_amount, notes, created_by)
  VALUES (v_order_number, p_client_id, 'active', p_start_date, p_end_date,
          v_total, p_deposit_amount, p_notes, p_created_by)
  RETURNING id INTO v_order_id;

  -- Insert order items and update equipment status
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_equipment_id := (v_item->>'equipment_id')::uuid;

    INSERT INTO order_items (order_id, equipment_id, daily_rate, days, subtotal, condition_on_issue)
    VALUES (v_order_id, v_equipment_id,
            (v_item->>'daily_rate')::numeric,
            (v_item->>'days')::int,
            (v_item->>'subtotal')::numeric,
            COALESCE(v_item->>'condition_on_issue', 'Хорошее'));

    UPDATE equipment SET status = 'rented' WHERE id = v_equipment_id;
  END LOOP;

  RETURN v_order_id;
END;
$$;

-- Return order atomically: update items + reset equipment status + update order status
CREATE OR REPLACE FUNCTION return_order_atomic(
  p_order_id uuid,
  p_items    jsonb  -- [{order_item_id, condition_on_return, return_photo_urls}]
)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_item jsonb;
  v_equipment_id uuid;
BEGIN
  -- Update each order item with return info
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE order_items
    SET condition_on_return = v_item->>'condition_on_return',
        return_photo_urls   = ARRAY(SELECT jsonb_array_elements_text(v_item->'return_photo_urls'))
    WHERE id = (v_item->>'order_item_id')::uuid
    RETURNING equipment_id INTO v_equipment_id;

    -- Reset equipment to free
    UPDATE equipment SET status = 'free' WHERE id = v_equipment_id;
  END LOOP;

  -- Mark order as returned
  UPDATE orders SET status = 'returned' WHERE id = p_order_id;
END;
$$;

-- ============================================================
-- VIEWS
-- ============================================================

-- Equipment utilization: rental days and revenue
CREATE OR REPLACE VIEW v_equipment_utilization AS
SELECT
  e.id,
  e.name,
  e.category_id,
  e.daily_rate,
  e.purchase_cost,
  e.status,
  COUNT(DISTINCT oi.order_id) AS total_rentals,
  COALESCE(SUM(oi.days), 0) AS total_rental_days,
  COALESCE(SUM(oi.subtotal), 0) AS total_revenue,
  CASE
    WHEN e.purchase_cost > 0
    THEN ROUND((COALESCE(SUM(oi.subtotal), 0) / e.purchase_cost) * 100, 1)
    ELSE 0
  END AS roi_percent
FROM equipment e
LEFT JOIN order_items oi ON oi.equipment_id = e.id
LEFT JOIN orders o ON oi.order_id = o.id AND o.status NOT IN ('cancelled')
GROUP BY e.id;

-- Overdue orders
CREATE OR REPLACE VIEW v_overdue_orders AS
SELECT
  o.*,
  c.full_name AS client_name,
  c.phone AS client_phone,
  c.telegram_chat_id,
  (CURRENT_DATE - o.end_date) AS days_overdue
FROM orders o
JOIN clients c ON o.client_id = c.id
WHERE o.status = 'active'
  AND o.end_date < CURRENT_DATE;

-- Dashboard stats
CREATE OR REPLACE VIEW v_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM orders WHERE status = 'active') AS active_rentals,
  (SELECT COUNT(*) FROM v_overdue_orders) AS overdue_count,
  (SELECT COALESCE(SUM(amount), 0) FROM payments
   WHERE paid_at >= date_trunc('month', now())
     AND payment_type NOT IN ('deposit', 'deposit_return')) AS revenue_this_month,
  (SELECT COALESCE(SUM(amount), 0) FROM payments
   WHERE paid_at >= date_trunc('week', now())
     AND payment_type NOT IN ('deposit', 'deposit_return')) AS revenue_this_week,
  (SELECT COUNT(*) FROM equipment WHERE status = 'free') AS equipment_free,
  (SELECT COUNT(*) FROM equipment WHERE status = 'rented') AS equipment_rented,
  (SELECT COUNT(*) FROM equipment WHERE status = 'maintenance') AS equipment_maintenance,
  (SELECT COUNT(*) FROM clients) AS total_clients;

-- Mark overdue orders automatically
CREATE OR REPLACE FUNCTION mark_overdue_orders()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE orders
  SET status = 'overdue'
  WHERE status = 'active'
    AND end_date < CURRENT_DATE;
END;
$$;
