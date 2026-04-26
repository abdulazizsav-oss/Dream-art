-- Dream Art CRM
-- Track rental payments per returned order item.

CREATE TABLE IF NOT EXISTS public.order_item_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  amount numeric(10, 2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_item_id, payment_id)
);

CREATE INDEX IF NOT EXISTS order_item_payment_allocations_order_item_id_idx
  ON public.order_item_payment_allocations(order_item_id);

CREATE INDEX IF NOT EXISTS order_item_payment_allocations_payment_id_idx
  ON public.order_item_payment_allocations(payment_id);

ALTER TABLE public.order_item_payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view order item payment allocations"
  ON public.order_item_payment_allocations;

CREATE POLICY "Authenticated users can view order item payment allocations"
  ON public.order_item_payment_allocations
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.order_item_payment_allocations IS
  'Allocation rows that connect rental payments to returned order_items.';

CREATE OR REPLACE FUNCTION public.return_order_items_with_payments_atomic(
  p_order_id uuid,
  p_items jsonb,
  p_payment_splits jsonb DEFAULT '[]'::jsonb,
  p_created_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
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
      actual_end_at = now(),
      returned = true
    WHERE id = v_order_item_id
      AND order_id = p_order_id
      AND returned = false;

    IF FOUND THEN
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
        now()
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
    actual_return_date = CASE WHEN v_open_count = 0 THEN CURRENT_DATE ELSE actual_return_date END,
    actual_end_at = CASE WHEN v_open_count = 0 THEN now() ELSE actual_end_at END
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'closed', v_closed_count,
    'order_closed', v_open_count = 0,
    'paid_total', v_expected_paid,
    'payment_ids', to_jsonb(v_payment_ids)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_order_item_atomic(
  p_order_id uuid,
  p_order_item_id uuid,
  p_payment_splits jsonb,
  p_created_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_item public.order_items%ROWTYPE;
  v_split jsonb;
  v_existing_paid numeric := 0;
  v_remaining_due numeric := 0;
  v_split_total numeric := 0;
  v_split_count int := 0;
  v_group_id uuid := NULL;
  v_payment_id uuid;
  v_payment_ids uuid[] := '{}';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));

  SELECT *
  INTO v_item
  FROM public.order_items
  WHERE id = p_order_item_id
    AND order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Позиция заказа не найдена';
  END IF;

  IF v_item.returned IS NOT TRUE THEN
    RAISE EXCEPTION 'Оплатить по позиции можно только после сдачи';
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_existing_paid
  FROM public.order_item_payment_allocations
  WHERE order_item_id = p_order_item_id;

  v_remaining_due := GREATEST(COALESCE(v_item.final_subtotal, v_item.subtotal, 0) - v_existing_paid, 0);

  IF v_remaining_due <= 0.01 THEN
    RAISE EXCEPTION 'Позиция уже оплачена';
  END IF;

  SELECT
    COALESCE(SUM((split->>'amount')::numeric), 0),
    COUNT(*)
  INTO v_split_total, v_split_count
  FROM jsonb_array_elements(COALESCE(p_payment_splits, '[]'::jsonb)) AS split;

  IF v_split_total <= 0 THEN
    RAISE EXCEPTION 'Укажите сумму платежа';
  END IF;

  IF v_split_total > v_remaining_due + 0.01 THEN
    RAISE EXCEPTION 'Платёж больше остатка по позиции';
  END IF;

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
      now()
    )
    RETURNING id INTO v_payment_id;

    INSERT INTO public.order_item_payment_allocations (
      order_item_id,
      payment_id,
      amount
    )
    VALUES (
      p_order_item_id,
      v_payment_id,
      (v_split->>'amount')::numeric
    );

    v_payment_ids := array_append(v_payment_ids, v_payment_id);
  END LOOP;

  RETURN jsonb_build_object(
    'paid_total', v_split_total,
    'remaining_due', GREATEST(v_remaining_due - v_split_total, 0),
    'payment_ids', to_jsonb(v_payment_ids)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.return_order_items_with_payments_atomic(
  uuid, jsonb, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.return_order_items_with_payments_atomic(
  uuid, jsonb, jsonb, uuid, text
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.pay_order_item_atomic(
  uuid, uuid, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_order_item_atomic(
  uuid, uuid, jsonb, uuid, text
) TO service_role;
