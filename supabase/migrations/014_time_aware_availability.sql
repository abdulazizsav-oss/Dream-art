-- Time-aware equipment availability + human-readable Russian errors.
-- The old date-only check blocked same-day rentals even when times did not
-- overlap (e.g. one order 09:00–12:00 made another 17:00–22:00 impossible).

CREATE OR REPLACE FUNCTION check_equipment_availability_tr(
  p_equipment_id uuid,
  p_start_date   date,
  p_start_time   time,
  p_end_date     date,
  p_end_time     time,
  p_exclude_order_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  conflict_count int;
  v_req_start timestamp := (p_start_date + COALESCE(p_start_time, '00:00'::time));
  v_req_end   timestamp := (p_end_date   + COALESCE(p_end_time,   '23:59'::time));
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  WHERE oi.equipment_id = p_equipment_id
    AND o.status NOT IN ('returned', 'cancelled')
    AND (p_exclude_order_id IS NULL OR o.id != p_exclude_order_id)
    AND (o.start_date + COALESCE(NULLIF(o.start_time::text, '')::time, '00:00'::time)) < v_req_end
    AND (o.end_date   + COALESCE(NULLIF(o.end_time::text,   '')::time, '23:59'::time)) > v_req_start;

  IF conflict_count > 0 THEN RETURN false; END IF;

  SELECT COUNT(*) INTO conflict_count
  FROM blocked_dates
  WHERE equipment_id = p_equipment_id
    AND NOT (p_start_date > end_date OR p_end_date < start_date);

  RETURN conflict_count = 0;
END;
$$;

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
