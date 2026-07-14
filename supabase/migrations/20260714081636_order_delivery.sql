-- Dream Art CRM: simple outbound delivery attached to an order.
-- Rollout is additive: legacy RPC signatures stay available while the app moves to v2.

ALTER TABLE public.orders
  ADD COLUMN fulfillment_method text NOT NULL DEFAULT 'pickup',
  ADD COLUMN delivery_address text,
  ADD COLUMN delivery_fee numeric(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfillment_method_check
    CHECK (fulfillment_method IN ('pickup', 'delivery')),
  ADD CONSTRAINT orders_delivery_fee_check
    CHECK (delivery_fee >= 0 AND delivery_fee = trunc(delivery_fee)),
  ADD CONSTRAINT orders_delivery_fields_check
    CHECK (
      (
        fulfillment_method = 'pickup'
        AND delivery_address IS NULL
        AND delivery_fee = 0
      )
      OR
      (
        fulfillment_method = 'delivery'
        AND NULLIF(btrim(delivery_address), '') IS NOT NULL
        AND char_length(btrim(delivery_address)) <= 500
      )
    );

COMMENT ON COLUMN public.orders.fulfillment_method IS
  'How the customer receives the order: pickup or outbound delivery.';
COMMENT ON COLUMN public.orders.delivery_address IS
  'Delivery address snapshot stored on the order; null for pickup.';
COMMENT ON COLUMN public.orders.delivery_fee IS
  'Outbound delivery charge included once in orders.total_amount.';

CREATE TABLE public.order_delivery_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  amount numeric(10, 2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id)
);

CREATE INDEX order_delivery_payment_allocations_order_id_idx
  ON public.order_delivery_payment_allocations(order_id);

ALTER TABLE public.order_delivery_payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view delivery payment allocations"
  ON public.order_delivery_payment_allocations
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.order_delivery_payment_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.order_delivery_payment_allocations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_delivery_payment_allocations TO service_role;

COMMENT ON TABLE public.order_delivery_payment_allocations IS
  'Allocation rows that connect rental payments to the single delivery charge of an order.';

-- Payment writes must go through the service-role atomic RPCs. Authenticated users
-- retain read access for the order and finance screens.
DROP POLICY IF EXISTS "auth_all_payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated users can view payments" ON public.payments;
CREATE POLICY "Authenticated users can view payments"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.payments FROM anon, authenticated;
GRANT SELECT ON TABLE public.payments TO authenticated;

CREATE OR REPLACE FUNCTION public.create_order_atomic_v2(
  p_client_id uuid,
  p_start_date date,
  p_end_date date,
  p_start_time text,
  p_end_time text,
  p_deposit_amount numeric,
  p_notes text,
  p_created_by uuid,
  p_items jsonb,
  p_fulfillment_method text DEFAULT 'pickup',
  p_delivery_address text DEFAULT NULL,
  p_delivery_fee numeric DEFAULT 0
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_items_total numeric := 0;
  v_item jsonb;
  v_equipment_id uuid;
  v_start_t time := COALESCE(NULLIF(p_start_time, '')::time, '09:30'::time);
  v_end_t time := COALESCE(NULLIF(p_end_time, '')::time, '23:00'::time);
  v_method text := COALESCE(NULLIF(btrim(p_fulfillment_method), ''), 'pickup');
  v_address text := NULLIF(btrim(p_delivery_address), '');
  v_delivery_fee numeric := COALESCE(p_delivery_fee, 0);
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Добавьте хотя бы одну единицу техники';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'Дата окончания не может быть раньше даты начала';
  END IF;

  IF v_method NOT IN ('pickup', 'delivery') THEN
    RAISE EXCEPTION 'Некорректный способ получения заказа';
  END IF;

  IF v_delivery_fee < 0 OR v_delivery_fee <> trunc(v_delivery_fee) THEN
    RAISE EXCEPTION 'Некорректная стоимость доставки';
  END IF;

  IF v_method = 'pickup' THEN
    v_address := NULL;
    v_delivery_fee := 0;
  ELSIF v_address IS NULL OR char_length(v_address) > 500 THEN
    RAISE EXCEPTION 'Укажите корректный адрес доставки';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS item
    WHERE COALESCE((item->>'subtotal')::numeric, -1) < 0
  ) THEN
    RAISE EXCEPTION 'Некорректная сумма позиции заказа';
  END IF;

  SELECT COALESCE(SUM((item->>'subtotal')::numeric), 0)
  INTO v_items_total
  FROM jsonb_array_elements(p_items) AS item;

  v_order_number := 'DA-'
    || to_char(now(), 'YYYY')
    || '-'
    || lpad(nextval('public.order_number_seq'::regclass)::text, 4, '0');

  INSERT INTO public.orders (
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
    created_by,
    fulfillment_method,
    delivery_address,
    delivery_fee
  )
  VALUES (
    v_order_number,
    p_client_id,
    'active',
    p_start_date,
    p_end_date,
    v_start_t,
    v_end_t,
    v_items_total + v_delivery_fee,
    COALESCE(p_deposit_amount, 0),
    p_notes,
    p_created_by,
    v_method,
    v_address,
    v_delivery_fee
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_equipment_id := (v_item->>'equipment_id')::uuid;

    INSERT INTO public.order_items (
      order_id,
      equipment_id,
      daily_rate,
      days,
      subtotal,
      manual_subtotal,
      kit_selection,
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
      COALESCE((v_item->>'daily_rate')::numeric, 0),
      COALESCE((v_item->>'days')::int, 1),
      COALESCE((v_item->>'subtotal')::numeric, 0),
      NULLIF(v_item->>'manual_subtotal', '')::numeric,
      COALESCE(v_item->'kit_selection', '[]'::jsonb),
      COALESCE(v_item->>'shift_type', 'day'),
      COALESCE(v_item->>'rate_source', 'auto'),
      COALESCE((v_item->>'day_rate_snapshot')::numeric, 0),
      COALESCE((v_item->>'night_rate_snapshot')::numeric, 0),
      COALESCE((v_item->>'day_units')::int, 0),
      COALESCE((v_item->>'night_units')::int, 0),
      COALESCE(v_item->>'condition_on_issue', 'Хорошее'),
      COALESCE(
        ARRAY(
          SELECT jsonb_array_elements_text(
            COALESCE(v_item->'selected_kit_items', '[]'::jsonb)
          )
        ),
        '{}'::text[]
      )
    );
  END LOOP;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic_v2(
  uuid, date, date, text, text, numeric, text, uuid, jsonb, text, text, numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic_v2(
  uuid, date, date, text, text, numeric, text, uuid, jsonb, text, text, numeric
) TO service_role;

-- Existing add-items callers keep their signature, but the persisted grand total
-- now always includes delivery exactly once.
CREATE OR REPLACE FUNCTION public.add_order_items_atomic(
  p_order_id uuid,
  p_items jsonb,
  p_added_by uuid
) RETURNS uuid[]
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item jsonb;
  v_equipment_id uuid;
  v_inserted_id uuid;
  v_inserted_ids uuid[] := '{}';
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Добавьте хотя бы одну позицию';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  SELECT * INTO v_order
  FROM public.orders
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

    INSERT INTO public.order_items (
      order_id,
      equipment_id,
      daily_rate,
      days,
      subtotal,
      manual_subtotal,
      kit_selection,
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
      NULLIF(v_item->>'manual_subtotal', '')::numeric,
      COALESCE(v_item->'kit_selection', '[]'::jsonb),
      COALESCE(v_item->>'shift_type', 'day'),
      COALESCE(v_item->>'rate_source', 'auto'),
      COALESCE((v_item->>'day_rate_snapshot')::numeric, COALESCE((v_item->>'daily_rate')::numeric, 0)),
      COALESCE((v_item->>'night_rate_snapshot')::numeric, COALESCE((v_item->>'daily_rate')::numeric, 0)),
      COALESCE((v_item->>'day_units')::int, 1),
      COALESCE((v_item->>'night_units')::int, 0),
      COALESCE(v_item->>'condition_on_issue', 'Хорошее'),
      COALESCE(
        ARRAY(
          SELECT jsonb_array_elements_text(
            COALESCE(v_item->'selected_kit_items', '[]'::jsonb)
          )
        ),
        '{}'::text[]
      ),
      now(),
      false
    )
    RETURNING id INTO v_inserted_id;

    v_inserted_ids := array_append(v_inserted_ids, v_inserted_id);
  END LOOP;

  UPDATE public.orders o
  SET total_amount = COALESCE((
    SELECT SUM(oi.subtotal)
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
  ), 0) + o.delivery_fee
  WHERE o.id = p_order_id;

  RETURN v_inserted_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.add_order_items_atomic(uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_order_items_atomic(uuid, jsonb, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.return_order_items_atomic(
  p_order_id uuid,
  p_items jsonb
) RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_item jsonb;
  v_order_item_id uuid;
  v_open_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_order_item_id := (v_item->>'order_item_id')::uuid;

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
  FROM public.order_items
  WHERE order_id = p_order_id
    AND returned = false;

  UPDATE public.orders o
  SET
    total_amount = COALESCE((
      SELECT SUM(oi.subtotal)
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
    ), 0) + o.delivery_fee,
    status = CASE WHEN v_open_count = 0 THEN 'returned' ELSE o.status END,
    actual_return_date = CASE WHEN v_open_count = 0 THEN CURRENT_DATE ELSE o.actual_return_date END,
    actual_end_at = CASE WHEN v_open_count = 0 THEN now() ELSE o.actual_end_at END
  WHERE o.id = p_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.return_order_items_atomic(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.return_order_items_atomic(uuid, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.add_order_payment_with_allocations_atomic_v2(
  p_order_id uuid,
  p_payment_type text,
  p_splits jsonb,
  p_created_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_split jsonb;
  v_item record;
  v_payment_id uuid;
  v_payment_ids uuid[] := '{}';
  v_group_id uuid := NULL;
  v_split_count integer := 0;
  v_split_total numeric := 0;
  v_item_due numeric := 0;
  v_delivery_due numeric := 0;
  v_total_due numeric := 0;
  v_remaining_payment numeric := 0;
  v_alloc_amount numeric := 0;
BEGIN
  IF p_payment_type NOT IN ('rental', 'deposit', 'deposit_return', 'extra', 'fine') THEN
    RAISE EXCEPTION 'Некорректный тип платежа';
  END IF;

  IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' OR jsonb_array_length(p_splits) = 0 THEN
    RAISE EXCEPTION 'Укажите сумму платежа';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Нельзя принять платёж по отменённому заказу';
  END IF;

  SELECT
    COUNT(*),
    COALESCE(SUM((split->>'amount')::numeric), 0)
  INTO v_split_count, v_split_total
  FROM jsonb_array_elements(p_splits) AS split;

  IF v_split_total <= 0 THEN
    RAISE EXCEPTION 'Сумма платежа должна быть больше нуля';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_splits) AS split
    WHERE COALESCE((split->>'amount')::numeric, 0) <= 0
       OR (split->>'amount')::numeric <> round((split->>'amount')::numeric, 2)
       OR COALESCE(split->>'payment_method', '') NOT IN ('cash', 'transfer', 'card')
  ) THEN
    RAISE EXCEPTION 'Некорректная сумма или способ оплаты';
  END IF;

  IF p_payment_type = 'rental' THEN
    SELECT COALESCE(SUM(
      GREATEST(
        COALESCE(oi.final_subtotal, oi.subtotal, 0)
        - COALESCE(alloc.paid, 0),
        0
      )
    ), 0)
    INTO v_item_due
    FROM public.order_items oi
    LEFT JOIN (
      SELECT order_item_id, SUM(amount) AS paid
      FROM public.order_item_payment_allocations
      GROUP BY order_item_id
    ) alloc ON alloc.order_item_id = oi.id
    WHERE oi.order_id = p_order_id;

    SELECT GREATEST(
      v_order.delivery_fee - COALESCE(SUM(a.amount), 0),
      0
    )
    INTO v_delivery_due
    FROM public.order_delivery_payment_allocations a
    WHERE a.order_id = p_order_id;

    v_total_due := v_item_due + v_delivery_due;

    IF v_split_total > v_total_due THEN
      RAISE EXCEPTION 'Платёж больше остатка по заказу';
    END IF;
  END IF;

  v_group_id := CASE WHEN v_split_count > 1 THEN gen_random_uuid() ELSE NULL END;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits)
  LOOP
    INSERT INTO public.payments (
      order_id,
      amount,
      payment_method,
      payment_type,
      paid_at,
      notes,
      created_by,
      payment_group_id
    )
    VALUES (
      p_order_id,
      (v_split->>'amount')::numeric,
      v_split->>'payment_method',
      p_payment_type,
      now(),
      p_notes,
      p_created_by,
      v_group_id
    )
    RETURNING id INTO v_payment_id;

    v_payment_ids := array_append(v_payment_ids, v_payment_id);

    IF p_payment_type = 'rental' THEN
      v_remaining_payment := (v_split->>'amount')::numeric;

      FOR v_item IN
        SELECT
          oi.id,
          GREATEST(
            COALESCE(oi.final_subtotal, oi.subtotal, 0)
            - COALESCE((
              SELECT SUM(a.amount)
              FROM public.order_item_payment_allocations a
              WHERE a.order_item_id = oi.id
            ), 0),
            0
          ) AS remaining
        FROM public.order_items oi
        WHERE oi.order_id = p_order_id
        ORDER BY oi.returned DESC, oi.id
      LOOP
        EXIT WHEN v_remaining_payment = 0;
        CONTINUE WHEN v_item.remaining = 0;

        v_alloc_amount := LEAST(v_remaining_payment, v_item.remaining);
        INSERT INTO public.order_item_payment_allocations (
          order_item_id,
          payment_id,
          amount
        )
        VALUES (
          v_item.id,
          v_payment_id,
          v_alloc_amount
        );

        v_remaining_payment := v_remaining_payment - v_alloc_amount;
      END LOOP;

      IF v_remaining_payment > 0 THEN
        SELECT GREATEST(
          v_order.delivery_fee - COALESCE(SUM(a.amount), 0),
          0
        )
        INTO v_delivery_due
        FROM public.order_delivery_payment_allocations a
        WHERE a.order_id = p_order_id;

        v_alloc_amount := LEAST(v_remaining_payment, v_delivery_due);
        IF v_alloc_amount > 0 THEN
          INSERT INTO public.order_delivery_payment_allocations (
            order_id,
            payment_id,
            amount
          )
          VALUES (
            p_order_id,
            v_payment_id,
            v_alloc_amount
          );

          v_remaining_payment := v_remaining_payment - v_alloc_amount;
        END IF;
      END IF;

      IF v_remaining_payment <> 0 THEN
        RAISE EXCEPTION 'Не удалось полностью распределить платёж';
      END IF;
    END IF;
  END LOOP;

  IF p_payment_type = 'rental' AND EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.id = ANY(v_payment_ids)
      AND p.amount <> COALESCE((
        SELECT SUM(allocated.amount)
        FROM (
          SELECT a.amount
          FROM public.order_item_payment_allocations a
          WHERE a.payment_id = p.id
          UNION ALL
          SELECT a.amount
          FROM public.order_delivery_payment_allocations a
          WHERE a.payment_id = p.id
        ) allocated
      ), 0)
  ) THEN
    RAISE EXCEPTION 'Платёж распределён не полностью';
  END IF;

  IF p_payment_type = 'rental' AND EXISTS (
    SELECT 1
    FROM public.order_delivery_payment_allocations a
    JOIN public.payments p ON p.id = a.payment_id
    WHERE a.payment_id = ANY(v_payment_ids)
      AND a.order_id <> p.order_id
  ) THEN
    RAISE EXCEPTION 'Доставка распределена на другой заказ';
  END IF;

  RETURN jsonb_build_object(
    'paid_total', v_split_total,
    'payment_ids', to_jsonb(v_payment_ids),
    'payment_group_id', v_group_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_order_payment_with_allocations_atomic_v2(
  uuid, text, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_order_payment_with_allocations_atomic_v2(
  uuid, text, jsonb, uuid, text
) TO service_role;

-- Keep the legacy signature callable for rollback deployments, while routing all
-- new writes through the allocation-complete implementation.
CREATE OR REPLACE FUNCTION public.add_order_payment_with_allocations_atomic(
  p_order_id uuid,
  p_payment_type text,
  p_splits jsonb,
  p_created_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT public.add_order_payment_with_allocations_atomic_v2(
    p_order_id,
    p_payment_type,
    p_splits,
    p_created_by,
    p_notes
  );
$$;

REVOKE ALL ON FUNCTION public.add_order_payment_with_allocations_atomic(
  uuid, text, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_order_payment_with_allocations_atomic(
  uuid, text, jsonb, uuid, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.update_order_delivery_atomic(
  p_order_id uuid,
  p_fulfillment_method text,
  p_delivery_address text,
  p_delivery_fee numeric
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_updated public.orders%ROWTYPE;
  v_method text := COALESCE(NULLIF(btrim(p_fulfillment_method), ''), 'pickup');
  v_address text := NULLIF(btrim(p_delivery_address), '');
  v_delivery_fee numeric := COALESCE(p_delivery_fee, 0);
  v_has_rental_payment boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден';
  END IF;

  IF v_order.status NOT IN ('active', 'overdue') THEN
    RAISE EXCEPTION 'Доставку можно изменить только у активного заказа';
  END IF;

  IF v_method NOT IN ('pickup', 'delivery') THEN
    RAISE EXCEPTION 'Некорректный способ получения заказа';
  END IF;

  IF v_delivery_fee < 0 OR v_delivery_fee <> trunc(v_delivery_fee) THEN
    RAISE EXCEPTION 'Некорректная стоимость доставки';
  END IF;

  IF v_method = 'pickup' THEN
    v_address := NULL;
    v_delivery_fee := 0;
  ELSIF v_address IS NULL OR char_length(v_address) > 500 THEN
    RAISE EXCEPTION 'Укажите корректный адрес доставки';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.order_id = p_order_id
      AND p.payment_type = 'rental'
  )
  INTO v_has_rental_payment;

  IF v_has_rental_payment AND (
    v_method <> v_order.fulfillment_method
    OR v_delivery_fee <> v_order.delivery_fee
  ) THEN
    RAISE EXCEPTION 'После оплаты можно исправить только адрес доставки';
  END IF;

  UPDATE public.orders o
  SET
    fulfillment_method = v_method,
    delivery_address = v_address,
    delivery_fee = v_delivery_fee,
    total_amount = COALESCE((
      SELECT SUM(oi.subtotal)
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
    ), 0) + v_delivery_fee
  WHERE o.id = p_order_id
  RETURNING o.* INTO v_updated;

  RETURN to_jsonb(v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.update_order_delivery_atomic(
  uuid, text, text, numeric
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_delivery_atomic(
  uuid, text, text, numeric
) TO service_role;

CREATE OR REPLACE FUNCTION public.return_order_items_with_payments_atomic_v2(
  p_order_id uuid,
  p_items jsonb,
  p_payment_splits jsonb DEFAULT '[]'::jsonb,
  p_created_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_actual_end_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item jsonb;
  v_split jsonb;
  v_order_item_id uuid;
  v_final_subtotal numeric;
  v_final_day_units int;
  v_final_night_units int;
  v_existing_item_paid numeric := 0;
  v_item_remaining numeric := 0;
  v_item_due numeric := 0;
  v_delivery_due numeric := 0;
  v_total_due numeric := 0;
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
  v_delivery_paid_now numeric := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Нет позиций для сдачи';
  END IF;

  IF p_payment_splits IS NULL OR jsonb_typeof(p_payment_splits) <> 'array' THEN
    RAISE EXCEPTION 'Некорректный список платежей';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден';
  END IF;

  IF v_order.status NOT IN ('active', 'overdue') THEN
    RAISE EXCEPTION 'Сдать позиции можно только по активному заказу';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS return_item_payment_v2_tmp (
    sort_order int,
    order_item_id uuid,
    remaining_due numeric
  ) ON COMMIT DROP;

  TRUNCATE return_item_payment_v2_tmp;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_order_item_id := (v_item->>'order_item_id')::uuid;
    v_final_subtotal := COALESCE((v_item->>'final_subtotal')::numeric, 0);
    v_final_day_units := COALESCE((v_item->>'final_day_units')::int, 0);
    v_final_night_units := COALESCE((v_item->>'final_night_units')::int, 0);

    IF v_final_subtotal < 0 OR v_final_subtotal <> round(v_final_subtotal, 2) THEN
      RAISE EXCEPTION 'Некорректная сумма позиции';
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
        FROM jsonb_array_elements_text(
          COALESCE(v_item->'missing_kit_items', '[]'::jsonb)
        ) AS raw(value)
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

      SELECT COALESCE(SUM(a.amount), 0)
      INTO v_existing_item_paid
      FROM public.order_item_payment_allocations a
      WHERE a.order_item_id = v_order_item_id;

      v_item_remaining := GREATEST(v_final_subtotal - v_existing_item_paid, 0);
      v_sort_order := v_sort_order + 1;
      v_closed_count := v_closed_count + 1;

      INSERT INTO return_item_payment_v2_tmp (
        sort_order,
        order_item_id,
        remaining_due
      )
      VALUES (
        v_sort_order,
        v_order_item_id,
        v_item_remaining
      );
    END IF;
  END LOOP;

  IF v_closed_count = 0 THEN
    RAISE EXCEPTION 'Нет валидных позиций для сдачи';
  END IF;

  -- After the positions returned in this call, cover debt on positions that had
  -- already been returned earlier. Active unselected positions are intentionally
  -- excluded from a partial return payment.
  FOR v_alloc_row IN
    SELECT
      oi.id AS order_item_id,
      GREATEST(
        COALESCE(oi.final_subtotal, oi.subtotal, 0)
        - COALESCE((
          SELECT SUM(a.amount)
          FROM public.order_item_payment_allocations a
          WHERE a.order_item_id = oi.id
        ), 0),
        0
      ) AS remaining_due
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.returned = true
      AND NOT EXISTS (
        SELECT 1
        FROM return_item_payment_v2_tmp tmp
        WHERE tmp.order_item_id = oi.id
      )
    ORDER BY oi.actual_end_at NULLS LAST, oi.id
  LOOP
    v_sort_order := v_sort_order + 1;
    INSERT INTO return_item_payment_v2_tmp (
      sort_order,
      order_item_id,
      remaining_due
    )
    VALUES (
      v_sort_order,
      v_alloc_row.order_item_id,
      v_alloc_row.remaining_due
    );
  END LOOP;

  SELECT
    COALESCE(SUM((split->>'amount')::numeric), 0),
    COUNT(*)
  INTO v_split_total, v_split_count
  FROM jsonb_array_elements(p_payment_splits) AS split;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payment_splits) AS split
    WHERE COALESCE((split->>'amount')::numeric, 0) <= 0
       OR (split->>'amount')::numeric <> round((split->>'amount')::numeric, 2)
       OR COALESCE(split->>'payment_method', '') NOT IN ('cash', 'transfer', 'card')
  ) THEN
    RAISE EXCEPTION 'Некорректная сумма или способ оплаты';
  END IF;

  SELECT COALESCE(SUM(remaining_due), 0)
  INTO v_item_due
  FROM return_item_payment_v2_tmp;

  SELECT GREATEST(
    v_order.delivery_fee - COALESCE(SUM(a.amount), 0),
    0
  )
  INTO v_delivery_due
  FROM public.order_delivery_payment_allocations a
  WHERE a.order_id = p_order_id;

  v_total_due := v_item_due + v_delivery_due;

  IF v_split_total > v_total_due THEN
    RAISE EXCEPTION 'Платёж больше остатка по сдаваемым позициям и доставке';
  END IF;

  IF v_split_total > 0 THEN
    v_group_id := CASE WHEN v_split_count > 1 THEN gen_random_uuid() ELSE NULL END;

    FOR v_split IN SELECT * FROM jsonb_array_elements(p_payment_splits)
    LOOP
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
        v_split->>'payment_method',
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
        SELECT sort_order, order_item_id, remaining_due
        FROM return_item_payment_v2_tmp
        WHERE remaining_due > 0
        ORDER BY sort_order
      LOOP
        EXIT WHEN v_remaining_payment = 0;

        v_alloc_amount := LEAST(v_remaining_payment, v_alloc_row.remaining_due);
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

        UPDATE return_item_payment_v2_tmp
        SET remaining_due = remaining_due - v_alloc_amount
        WHERE sort_order = v_alloc_row.sort_order;

        v_remaining_payment := v_remaining_payment - v_alloc_amount;
      END LOOP;

      IF v_remaining_payment > 0 THEN
        SELECT GREATEST(
          v_order.delivery_fee - COALESCE(SUM(a.amount), 0),
          0
        )
        INTO v_delivery_due
        FROM public.order_delivery_payment_allocations a
        WHERE a.order_id = p_order_id;

        v_alloc_amount := LEAST(v_remaining_payment, v_delivery_due);
        IF v_alloc_amount > 0 THEN
          INSERT INTO public.order_delivery_payment_allocations (
            order_id,
            payment_id,
            amount
          )
          VALUES (
            p_order_id,
            v_payment_id,
            v_alloc_amount
          );

          v_delivery_paid_now := v_delivery_paid_now + v_alloc_amount;
          v_remaining_payment := v_remaining_payment - v_alloc_amount;
        END IF;
      END IF;

      IF v_remaining_payment <> 0 THEN
        RAISE EXCEPTION 'Не удалось полностью распределить платёж';
      END IF;
    END LOOP;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.id = ANY(v_payment_ids)
      AND p.amount <> COALESCE((
        SELECT SUM(allocated.amount)
        FROM (
          SELECT a.amount
          FROM public.order_item_payment_allocations a
          WHERE a.payment_id = p.id
          UNION ALL
          SELECT a.amount
          FROM public.order_delivery_payment_allocations a
          WHERE a.payment_id = p.id
        ) allocated
      ), 0)
  ) THEN
    RAISE EXCEPTION 'Платёж распределён не полностью';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.order_delivery_payment_allocations a
    JOIN public.payments p ON p.id = a.payment_id
    WHERE a.payment_id = ANY(v_payment_ids)
      AND a.order_id <> p.order_id
  ) THEN
    RAISE EXCEPTION 'Доставка распределена на другой заказ';
  END IF;

  SELECT COUNT(*) INTO v_open_count
  FROM public.order_items
  WHERE order_id = p_order_id
    AND returned = false;

  UPDATE public.orders o
  SET
    total_amount = COALESCE((
      SELECT SUM(oi.subtotal)
      FROM public.order_items oi
      WHERE oi.order_id = p_order_id
    ), 0) + o.delivery_fee,
    status = CASE WHEN v_open_count = 0 THEN 'returned' ELSE o.status END,
    actual_return_date = CASE
      WHEN v_open_count = 0
      THEN (v_actual_end_at AT TIME ZONE 'Asia/Tashkent')::date
      ELSE o.actual_return_date
    END,
    actual_end_at = CASE
      WHEN v_open_count = 0 THEN v_actual_end_at
      ELSE o.actual_end_at
    END
  WHERE o.id = p_order_id;

  RETURN jsonb_build_object(
    'closed', v_closed_count,
    'order_closed', v_open_count = 0,
    'paid_total', v_split_total,
    'delivery_paid_total', v_delivery_paid_now,
    'payment_ids', to_jsonb(v_payment_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.return_order_items_with_payments_atomic_v2(
  uuid, jsonb, jsonb, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.return_order_items_with_payments_atomic_v2(
  uuid, jsonb, jsonb, uuid, text, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.return_order_items_with_payments_atomic(
  p_order_id uuid,
  p_items jsonb,
  p_payment_splits jsonb DEFAULT '[]'::jsonb,
  p_created_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_actual_end_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT public.return_order_items_with_payments_atomic_v2(
    p_order_id,
    p_items,
    p_payment_splits,
    p_created_by,
    p_notes,
    p_actual_end_at
  );
$$;

REVOKE ALL ON FUNCTION public.return_order_items_with_payments_atomic(
  uuid, jsonb, jsonb, uuid, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.return_order_items_with_payments_atomic(
  uuid, jsonb, jsonb, uuid, text, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_finance_analytics(
  p_from date,
  p_to date
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
WITH
params AS (
  SELECT
    p_from AS date_from,
    p_to AS date_to,
    (p_to - p_from + 1) AS period_days,
    p_from - (p_to - p_from + 1) AS previous_from,
    p_from - 1 AS previous_to
),
payment_base AS (
  SELECT
    p.*,
    (p.paid_at AT TIME ZONE 'Asia/Tashkent')::date AS local_date
  FROM public.payments p
),
revenue_current AS (
  SELECT *
  FROM payment_base, params
  WHERE local_date BETWEEN date_from AND date_to
    AND payment_type NOT IN ('deposit', 'deposit_return')
),
revenue_previous AS (
  SELECT *
  FROM payment_base, params
  WHERE local_date BETWEEN previous_from AND previous_to
    AND payment_type NOT IN ('deposit', 'deposit_return')
),
expense_base AS (
  SELECT
    e.id,
    e.expense_date AS local_date,
    e.amount,
    e.category,
    e.payment_method,
    e.equipment_id,
    e.description,
    e.created_by,
    e.created_at
  FROM public.expenses e
  UNION ALL
  SELECT
    m.id,
    COALESCE(
      m.completed_date,
      m.scheduled_date,
      (m.created_at AT TIME ZONE 'Asia/Tashkent')::date
    ) AS local_date,
    COALESCE(m.cost, 0) AS amount,
    'maintenance'::text AS category,
    'cash'::text AS payment_method,
    m.equipment_id,
    COALESCE(m.description, 'Техническое обслуживание') AS description,
    NULL::uuid AS created_by,
    m.created_at
  FROM public.equipment_maintenance m
  WHERE COALESCE(m.cost, 0) > 0
),
expenses_current AS (
  SELECT *
  FROM expense_base, params
  WHERE local_date BETWEEN date_from AND date_to
),
expenses_previous AS (
  SELECT *
  FROM expense_base, params
  WHERE local_date BETWEEN previous_from AND previous_to
),
order_charges AS (
  SELECT
    o.id,
    o.client_id,
    o.created_by,
    o.status,
    o.end_date,
    (o.created_at AT TIME ZONE 'Asia/Tashkent')::date AS local_date,
    COALESCE(SUM(COALESCE(oi.final_subtotal, oi.subtotal, 0)), 0)
      + o.delivery_fee AS charge
  FROM public.orders o
  LEFT JOIN public.order_items oi ON oi.order_id = o.id
  WHERE o.status <> 'cancelled'
  GROUP BY o.id
),
order_paid AS (
  SELECT
    p.order_id,
    COALESCE(SUM(p.amount), 0) AS paid
  FROM public.payments p
  WHERE p.payment_type = 'rental'
  GROUP BY p.order_id
),
debt_rows AS (
  SELECT
    oc.id,
    oc.client_id,
    oc.end_date,
    GREATEST(oc.charge - COALESCE(op.paid, 0), 0) AS debt,
    GREATEST(
      ((now() AT TIME ZONE 'Asia/Tashkent')::date - oc.end_date),
      0
    ) AS age_days
  FROM order_charges oc
  LEFT JOIN order_paid op ON op.order_id = oc.id
  WHERE GREATEST(oc.charge - COALESCE(op.paid, 0), 0) > 0.01
),
current_orders AS (
  SELECT oc.*
  FROM order_charges oc, params
  WHERE oc.local_date BETWEEN date_from AND date_to
),
current_summary AS (
  SELECT
    COALESCE((SELECT SUM(amount) FROM revenue_current), 0) AS revenue,
    COALESCE((SELECT SUM(amount) FROM expenses_current), 0) AS expenses,
    COALESCE((SELECT SUM(debt) FROM debt_rows), 0) AS debt,
    COALESCE((SELECT SUM(charge) FROM current_orders), 0) AS billed,
    (SELECT COUNT(*) FROM current_orders) AS orders_count,
    COALESCE((
      SELECT COUNT(DISTINCT COALESCE(payment_group_id::text, id::text))
      FROM revenue_current
    ), 0) AS checks_count
),
previous_summary AS (
  SELECT
    COALESCE((SELECT SUM(amount) FROM revenue_previous), 0) AS revenue,
    COALESCE((SELECT SUM(amount) FROM expenses_previous), 0) AS expenses,
    COALESCE((
      SELECT SUM(oc.charge)
      FROM order_charges oc, params
      WHERE oc.local_date BETWEEN previous_from AND previous_to
    ), 0) AS billed,
    COALESCE((
      SELECT COUNT(*)
      FROM order_charges oc, params
      WHERE oc.local_date BETWEEN previous_from AND previous_to
    ), 0) AS orders_count
),
days AS (
  SELECT generate_series(p_from, p_to, interval '1 day')::date AS day
),
time_series AS (
  SELECT
    d.day,
    COALESCE((
      SELECT SUM(rc.amount)
      FROM revenue_current rc
      WHERE rc.local_date = d.day
    ), 0) AS revenue,
    COALESCE((
      SELECT SUM(ec.amount)
      FROM expenses_current ec
      WHERE ec.local_date = d.day
    ), 0) AS expenses
  FROM days d
),
equipment_billed AS (
  SELECT
    oi.equipment_id,
    COUNT(DISTINCT oi.order_id) AS rentals,
    COALESCE(SUM(COALESCE(oi.final_subtotal, oi.subtotal, 0)), 0) AS billed
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN params ON true
  WHERE o.status <> 'cancelled'
    AND (o.created_at AT TIME ZONE 'Asia/Tashkent')::date BETWEEN date_from AND date_to
  GROUP BY oi.equipment_id
),
equipment_collected AS (
  SELECT
    oi.equipment_id,
    COALESCE(SUM(a.amount), 0) AS collected
  FROM public.order_item_payment_allocations a
  JOIN public.order_items oi ON oi.id = a.order_item_id
  JOIN payment_base p ON p.id = a.payment_id
  JOIN params ON true
  WHERE p.local_date BETWEEN date_from AND date_to
    AND p.payment_type = 'rental'
  GROUP BY oi.equipment_id
),
equipment_expense AS (
  SELECT
    ec.equipment_id,
    COALESCE(SUM(ec.amount), 0) AS expenses
  FROM expenses_current ec
  WHERE ec.equipment_id IS NOT NULL
  GROUP BY ec.equipment_id
),
equipment_stats AS (
  SELECT
    e.id,
    e.name,
    e.currency,
    COALESCE(eb.rentals, 0) AS rentals,
    COALESCE(eb.billed, 0) AS billed,
    COALESCE(ec.collected, 0) AS collected,
    COALESCE(ee.expenses, 0) AS expenses,
    COALESCE(ec.collected, 0) - COALESCE(ee.expenses, 0) AS result,
    e.purchase_cost
  FROM public.equipment e
  LEFT JOIN equipment_billed eb ON eb.equipment_id = e.id
  LEFT JOIN equipment_collected ec ON ec.equipment_id = e.id
  LEFT JOIN equipment_expense ee ON ee.equipment_id = e.id
  WHERE e.currency = 'UZS'
),
team_stats AS (
  SELECT
    profile.id,
    profile.full_name,
    profile.role,
    COALESCE((
      SELECT COUNT(*)
      FROM order_charges oc, params
      WHERE oc.created_by = profile.id
        AND oc.local_date BETWEEN date_from AND date_to
    ), 0) AS orders_count,
    COALESCE((
      SELECT SUM(oc.charge)
      FROM order_charges oc, params
      WHERE oc.created_by = profile.id
        AND oc.local_date BETWEEN date_from AND date_to
    ), 0) AS orders_amount,
    COALESCE((
      SELECT SUM(p.amount)
      FROM revenue_current p
      WHERE p.created_by = profile.id
    ), 0) AS payments_amount,
    COALESCE((
      SELECT COUNT(*)
      FROM public.clients c, params
      WHERE c.created_by = profile.id
        AND (c.created_at AT TIME ZONE 'Asia/Tashkent')::date BETWEEN date_from AND date_to
    ), 0) AS clients_count
  FROM public.user_profiles profile
),
client_stats AS (
  SELECT
    c.id,
    c.full_name,
    COUNT(DISTINCT o.id) FILTER (WHERE o.status <> 'cancelled') AS orders_count,
    COALESCE(SUM(rc.amount), 0) AS collected
  FROM public.clients c
  LEFT JOIN public.orders o ON o.client_id = c.id
  LEFT JOIN revenue_current rc ON rc.order_id = o.id
  GROUP BY c.id
),
recent_payments AS (
  SELECT
    p.id,
    p.order_id,
    p.amount,
    p.payment_method,
    p.payment_type,
    p.paid_at,
    p.notes,
    o.order_number,
    c.full_name AS client_name,
    profile.full_name AS admin_name
  FROM public.payments p
  JOIN params ON true
  JOIN public.orders o ON o.id = p.order_id
  JOIN public.clients c ON c.id = o.client_id
  LEFT JOIN public.user_profiles profile ON profile.id = p.created_by
  WHERE (p.paid_at AT TIME ZONE 'Asia/Tashkent')::date BETWEEN date_from AND date_to
  ORDER BY p.paid_at DESC
  LIMIT 100
),
recent_expenses AS (
  SELECT
    e.id,
    e.category,
    e.description,
    e.amount,
    e.local_date AS expense_date,
    e.payment_method,
    e.equipment_id,
    equipment.name AS equipment_name,
    profile.full_name AS admin_name
  FROM expense_base e
  JOIN params ON true
  LEFT JOIN public.equipment equipment ON equipment.id = e.equipment_id
  LEFT JOIN public.user_profiles profile ON profile.id = e.created_by
  WHERE e.local_date BETWEEN date_from AND date_to
  ORDER BY e.local_date DESC, e.created_at DESC
  LIMIT 100
)
SELECT jsonb_build_object(
  'period', jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'timezone', 'Asia/Tashkent'
  ),
  'kpi', (
    SELECT jsonb_build_object(
      'revenue', revenue,
      'expenses', expenses,
      'result', revenue - expenses,
      'debt', debt,
      'billed', billed,
      'average_check', CASE WHEN checks_count > 0 THEN revenue / checks_count ELSE 0 END,
      'orders_count', orders_count
    )
    FROM current_summary
  ),
  'previous', (
    SELECT jsonb_build_object(
      'revenue', revenue,
      'expenses', expenses,
      'result', revenue - expenses,
      'billed', billed,
      'orders_count', orders_count
    )
    FROM previous_summary
  ),
  'series', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'date', day,
      'revenue', revenue,
      'expenses', expenses,
      'result', revenue - expenses
    ) ORDER BY day)
    FROM time_series
  ), '[]'::jsonb),
  'payment_methods', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('name', payment_method, 'value', total) ORDER BY total DESC)
    FROM (
      SELECT payment_method, SUM(amount) AS total
      FROM revenue_current
      GROUP BY payment_method
    ) grouped
  ), '[]'::jsonb),
  'payment_types', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('name', payment_type, 'value', total) ORDER BY total DESC)
    FROM (
      SELECT payment_type, SUM(amount) AS total
      FROM revenue_current
      GROUP BY payment_type
    ) grouped
  ), '[]'::jsonb),
  'equipment', COALESCE((
    SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.collected DESC, row_data.billed DESC)
    FROM (
      SELECT *
      FROM equipment_stats
      WHERE billed > 0 OR collected > 0 OR expenses > 0
      ORDER BY collected DESC, billed DESC
      LIMIT 30
    ) row_data
  ), '[]'::jsonb),
  'team', COALESCE((
    SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.orders_count DESC, row_data.payments_amount DESC)
    FROM team_stats row_data
  ), '[]'::jsonb),
  'clients', COALESCE((
    SELECT jsonb_agg(to_jsonb(row_data) ORDER BY row_data.collected DESC, row_data.orders_count DESC)
    FROM (
      SELECT *
      FROM client_stats
      WHERE collected > 0 OR orders_count > 0
      ORDER BY collected DESC, orders_count DESC
      LIMIT 20
    ) row_data
  ), '[]'::jsonb),
  'debt', jsonb_build_object(
    'total', COALESCE((SELECT SUM(debt) FROM debt_rows), 0),
    'buckets', jsonb_build_array(
      jsonb_build_object('name', '0-7 дней', 'value', COALESCE((SELECT SUM(debt) FROM debt_rows WHERE age_days <= 7), 0)),
      jsonb_build_object('name', '8-30 дней', 'value', COALESCE((SELECT SUM(debt) FROM debt_rows WHERE age_days BETWEEN 8 AND 30), 0)),
      jsonb_build_object('name', '31+ дней', 'value', COALESCE((SELECT SUM(debt) FROM debt_rows WHERE age_days >= 31), 0))
    )
  ),
  'payments', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM recent_payments row_data), '[]'::jsonb),
  'expenses', COALESCE((SELECT jsonb_agg(to_jsonb(row_data)) FROM recent_expenses row_data), '[]'::jsonb),
  'warnings', jsonb_build_object(
    'non_uzs_equipment', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'currency', currency))
      FROM public.equipment
      WHERE currency <> 'UZS'
    ), '[]'::jsonb),
    'clients_without_author', (SELECT COUNT(*) FROM public.clients WHERE created_by IS NULL),
    'unallocated_rental_amount', COALESCE((
      SELECT SUM(GREATEST(p.amount - COALESCE(allocated.amount, 0), 0))
      FROM public.payments p
      LEFT JOIN (
        SELECT payment_id, SUM(amount) AS amount
        FROM (
          SELECT payment_id, amount
          FROM public.order_item_payment_allocations
          UNION ALL
          SELECT payment_id, amount
          FROM public.order_delivery_payment_allocations
        ) all_allocations
        GROUP BY payment_id
      ) allocated ON allocated.payment_id = p.id
      WHERE p.payment_type = 'rental'
    ), 0)
  )
)
FROM params;
$$;

REVOKE ALL ON FUNCTION public.get_finance_analytics(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_analytics(date, date)
  TO authenticated, service_role;
