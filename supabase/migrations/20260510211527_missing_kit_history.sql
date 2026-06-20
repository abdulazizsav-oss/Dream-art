-- Dream Art CRM
-- Track every missing kit item as an auditable event with a start timestamp.

CREATE TABLE IF NOT EXISTS public.order_item_missing_kit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  kit_name text NOT NULL CHECK (length(btrim(kit_name)) > 0),
  missing_since timestamptz NOT NULL DEFAULT now(),
  returned_at timestamptz,
  marked_missing_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  marked_returned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_item_missing_kit_events_order_id_idx
  ON public.order_item_missing_kit_events(order_id);

CREATE INDEX IF NOT EXISTS order_item_missing_kit_events_order_item_id_idx
  ON public.order_item_missing_kit_events(order_item_id);

CREATE INDEX IF NOT EXISTS order_item_missing_kit_events_active_since_idx
  ON public.order_item_missing_kit_events(missing_since)
  WHERE returned_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS order_item_missing_kit_events_one_active_item_idx
  ON public.order_item_missing_kit_events(order_item_id, kit_name)
  WHERE returned_at IS NULL;

ALTER TABLE public.order_item_missing_kit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view missing kit events"
  ON public.order_item_missing_kit_events;

CREATE POLICY "Authenticated users can view missing kit events"
  ON public.order_item_missing_kit_events
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.order_item_missing_kit_events FROM anon, authenticated;
GRANT SELECT ON public.order_item_missing_kit_events TO authenticated;

COMMENT ON TABLE public.order_item_missing_kit_events IS
  'Audit events for kit elements that were missing when an order item was returned.';

-- Backfill current missing kit arrays into active events. Historical rows do not
-- have an exact missing timestamp, so use the best available return timestamp.
INSERT INTO public.order_item_missing_kit_events (
  order_id,
  order_item_id,
  kit_name,
  missing_since,
  marked_missing_by
)
SELECT
  o.id,
  oi.id,
  btrim(missing.kit_name),
  COALESCE(
    oi.actual_end_at,
    o.actual_end_at,
    CASE
      WHEN o.actual_return_date IS NOT NULL
        THEN o.actual_return_date::timestamp AT TIME ZONE 'Asia/Tashkent'
      ELSE NULL
    END,
    o.updated_at,
    o.created_at,
    now()
  ),
  o.created_by
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
CROSS JOIN LATERAL unnest(COALESCE(oi.missing_kit_items, '{}'::text[])) AS missing(kit_name)
WHERE btrim(missing.kit_name) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.order_item_missing_kit_events existing
    WHERE existing.order_item_id = oi.id
      AND existing.kit_name = btrim(missing.kit_name)
      AND existing.returned_at IS NULL
  );

DROP FUNCTION IF EXISTS public.return_order_items_with_payments_atomic(
  uuid, jsonb, jsonb, uuid, text
);

CREATE OR REPLACE FUNCTION public.return_order_items_with_payments_atomic(
  p_order_id uuid,
  p_items jsonb,
  p_payment_splits jsonb DEFAULT '[]'::jsonb,
  p_created_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_actual_end_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_item jsonb;
  v_split jsonb;
  v_order_item_id uuid;
  v_final_subtotal numeric;
  v_final_day_units int;
  v_final_night_units int;
  v_paid_amount numeric;
  v_expected_paid numeric := 0;
  v_split_total numeric := 0;
  v_split_count int := 0;
  v_group_id uuid := NULL;
  v_payment_id uuid;
  v_payment_ids uuid[] := '{}';
  v_remaining_payment numeric;
  v_alloc_amount numeric;
  v_alloc_row record;
  v_sort_order int := 0;
  v_closed_count int := 0;
  v_open_count int := 0;
  v_actual_end_at timestamptz := COALESCE(p_actual_end_at, now());
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Нет позиций для сдачи';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  CREATE TEMP TABLE IF NOT EXISTS return_item_payment_tmp (
    sort_order int,
    order_item_id uuid,
    final_subtotal numeric,
    requested_paid numeric,
    remaining_paid numeric
  ) ON COMMIT DROP;

  TRUNCATE return_item_payment_tmp;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_order_item_id := (v_item->>'order_item_id')::uuid;
    v_final_subtotal := COALESCE((v_item->>'final_subtotal')::numeric, 0);
    v_final_day_units := COALESCE((v_item->>'final_day_units')::int, 0);
    v_final_night_units := COALESCE((v_item->>'final_night_units')::int, 0);
    v_paid_amount := COALESCE((v_item->>'paid_amount')::numeric, 0);

    IF v_final_subtotal < 0 THEN
      RAISE EXCEPTION 'Некорректная сумма позиции';
    END IF;

    IF v_paid_amount < 0 OR v_paid_amount > v_final_subtotal + 0.01 THEN
      RAISE EXCEPTION 'Оплата позиции не может быть меньше 0 или больше суммы позиции';
    END IF;

    UPDATE public.order_items
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
      final_subtotal = v_final_subtotal,
      final_day_units = v_final_day_units,
      final_night_units = v_final_night_units,
      subtotal = v_final_subtotal,
      day_units = v_final_day_units,
      night_units = v_final_night_units,
      shift_type = COALESCE(v_item->>'shift_type', shift_type),
      actual_end_at = v_actual_end_at,
      returned = true
    WHERE id = v_order_item_id
      AND order_id = p_order_id
      AND returned = false;

    IF FOUND THEN
      INSERT INTO public.order_item_missing_kit_events (
        order_id,
        order_item_id,
        kit_name,
        missing_since,
        marked_missing_by
      )
      SELECT
        p_order_id,
        v_order_item_id,
        missing.kit_name,
        v_actual_end_at,
        p_created_by
      FROM (
        SELECT DISTINCT btrim(value) AS kit_name
        FROM jsonb_array_elements_text(COALESCE(v_item->'missing_kit_items', '[]'::jsonb)) AS raw(value)
        WHERE btrim(value) <> ''
      ) missing
      ON CONFLICT (order_item_id, kit_name) WHERE returned_at IS NULL
      DO UPDATE SET
        missing_since = LEAST(
          public.order_item_missing_kit_events.missing_since,
          EXCLUDED.missing_since
        ),
        marked_missing_by = COALESCE(
          EXCLUDED.marked_missing_by,
          public.order_item_missing_kit_events.marked_missing_by
        );

      v_sort_order := v_sort_order + 1;
      v_closed_count := v_closed_count + 1;
      v_expected_paid := v_expected_paid + v_paid_amount;

      INSERT INTO return_item_payment_tmp (
        sort_order,
        order_item_id,
        final_subtotal,
        requested_paid,
        remaining_paid
      )
      VALUES (
        v_sort_order,
        v_order_item_id,
        v_final_subtotal,
        v_paid_amount,
        v_paid_amount
      );
    END IF;
  END LOOP;

  IF v_closed_count = 0 THEN
    RAISE EXCEPTION 'Нет валидных позиций для сдачи';
  END IF;

  SELECT
    COALESCE(SUM((split->>'amount')::numeric), 0),
    COUNT(*)
  INTO v_split_total, v_split_count
  FROM jsonb_array_elements(COALESCE(p_payment_splits, '[]'::jsonb)) AS split;

  IF ABS(v_split_total - v_expected_paid) > 0.01 THEN
    RAISE EXCEPTION 'Сумма платежей (%) не совпадает с оплатой по позициям (%)',
      v_split_total, v_expected_paid;
  END IF;

  IF v_expected_paid > 0 THEN
    v_group_id := CASE WHEN v_split_count > 1 THEN gen_random_uuid() ELSE NULL END;

    FOR v_split IN SELECT * FROM jsonb_array_elements(COALESCE(p_payment_splits, '[]'::jsonb))
    LOOP
      IF COALESCE((v_split->>'amount')::numeric, 0) <= 0 THEN
        RAISE EXCEPTION 'Сумма платежа должна быть больше нуля';
      END IF;

      INSERT INTO public.payments (
        order_id,
        amount,
        payment_method,
        payment_type,
        notes,
        created_by,
        payment_group_id,
        paid_at
      )
      VALUES (
        p_order_id,
        (v_split->>'amount')::numeric,
        COALESCE(v_split->>'payment_method', 'cash'),
        'rental',
        p_notes,
        p_created_by,
        v_group_id,
        v_actual_end_at
      )
      RETURNING id INTO v_payment_id;

      v_payment_ids := array_append(v_payment_ids, v_payment_id);
      v_remaining_payment := (v_split->>'amount')::numeric;

      FOR v_alloc_row IN
        SELECT sort_order, order_item_id, remaining_paid
        FROM return_item_payment_tmp
        WHERE remaining_paid > 0
        ORDER BY sort_order
      LOOP
        EXIT WHEN v_remaining_payment <= 0;

        v_alloc_amount := LEAST(v_remaining_payment, v_alloc_row.remaining_paid);
        IF v_alloc_amount > 0 THEN
          INSERT INTO public.order_item_payment_allocations (
            order_item_id,
            payment_id,
            amount
          )
          VALUES (
            v_alloc_row.order_item_id,
            v_payment_id,
            v_alloc_amount
          );

          UPDATE return_item_payment_tmp
          SET remaining_paid = remaining_paid - v_alloc_amount
          WHERE sort_order = v_alloc_row.sort_order;

          v_remaining_payment := v_remaining_payment - v_alloc_amount;
        END IF;
      END LOOP;

      IF v_remaining_payment > 0.01 THEN
        RAISE EXCEPTION 'Не удалось распределить платёж по позициям';
      END IF;
    END LOOP;
  END IF;

  SELECT COUNT(*) INTO v_open_count
  FROM public.order_items
  WHERE order_id = p_order_id
    AND returned = false;

  UPDATE public.orders
  SET
    total_amount = COALESCE((
      SELECT SUM(subtotal)
      FROM public.order_items
      WHERE order_id = p_order_id
    ), 0),
    status = CASE WHEN v_open_count = 0 THEN 'returned' ELSE status END,
    actual_return_date = CASE WHEN v_open_count = 0 THEN (v_actual_end_at AT TIME ZONE 'Asia/Tashkent')::date ELSE actual_return_date END,
    actual_end_at = CASE WHEN v_open_count = 0 THEN v_actual_end_at ELSE actual_end_at END
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'closed', v_closed_count,
    'order_closed', v_open_count = 0,
    'paid_total', v_expected_paid,
    'payment_ids', to_jsonb(v_payment_ids)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.return_missing_kit_events_atomic(
  p_order_id uuid,
  p_items jsonb,
  p_marked_returned_by uuid DEFAULT NULL,
  p_returned_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_item jsonb;
  v_current public.order_items%ROWTYPE;
  v_order_item_id uuid;
  v_returned_now text[];
  v_unknown text[];
  v_missing_after text[];
  v_returned_after text[];
  v_returned_at timestamptz := COALESCE(p_returned_at, now());
  v_row_count int := 0;
  v_total_returned int := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Нет элементов для возврата';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_order_item_id := (v_item->>'order_item_id')::uuid;

    SELECT *
    INTO v_current
    FROM public.order_items
    WHERE id = v_order_item_id
      AND order_id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Позиция не принадлежит заказу';
    END IF;

    SELECT COALESCE(array_agg(DISTINCT btrim(raw.value)), '{}'::text[])
    INTO v_returned_now
    FROM jsonb_array_elements_text(COALESCE(v_item->'returned_now', '[]'::jsonb)) AS raw(value)
    WHERE btrim(raw.value) <> '';

    IF COALESCE(array_length(v_returned_now, 1), 0) = 0 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(array_agg(requested.value), '{}'::text[])
    INTO v_unknown
    FROM unnest(v_returned_now) AS requested(value)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.order_item_missing_kit_events event
      WHERE event.order_id = p_order_id
        AND event.order_item_id = v_order_item_id
        AND event.kit_name = requested.value
        AND event.returned_at IS NULL
    );

    IF COALESCE(array_length(v_unknown, 1), 0) > 0 THEN
      RAISE EXCEPTION 'Эти элементы не числятся в недосдаче: %',
        array_to_string(v_unknown, ', ');
    END IF;

    UPDATE public.order_item_missing_kit_events
    SET
      returned_at = v_returned_at,
      marked_returned_by = p_marked_returned_by
    WHERE order_id = p_order_id
      AND order_item_id = v_order_item_id
      AND kit_name = ANY(v_returned_now)
      AND returned_at IS NULL;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_total_returned := v_total_returned + v_row_count;

    SELECT COALESCE(array_agg(missing.value), '{}'::text[])
    INTO v_missing_after
    FROM unnest(COALESCE(v_current.missing_kit_items, '{}'::text[])) AS missing(value)
    WHERE missing.value <> ALL(v_returned_now);

    SELECT COALESCE(array_agg(DISTINCT returned.value), '{}'::text[])
    INTO v_returned_after
    FROM unnest(COALESCE(v_current.returned_kit_items, '{}'::text[]) || v_returned_now) AS returned(value)
    WHERE btrim(returned.value) <> '';

    UPDATE public.order_items
    SET
      missing_kit_items = v_missing_after,
      returned_kit_items = v_returned_after
    WHERE id = v_order_item_id;
  END LOOP;

  IF v_total_returned = 0 THEN
    RAISE EXCEPTION 'Нет валидных элементов для возврата';
  END IF;

  RETURN jsonb_build_object(
    'returned', v_total_returned,
    'returned_at', v_returned_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.return_order_items_with_payments_atomic(
  uuid, jsonb, jsonb, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.return_order_items_with_payments_atomic(
  uuid, jsonb, jsonb, uuid, text, timestamptz
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.return_missing_kit_events_atomic(
  uuid, jsonb, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.return_missing_kit_events_atomic(
  uuid, jsonb, uuid, timestamptz
) TO service_role;
