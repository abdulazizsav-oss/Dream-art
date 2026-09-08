-- Cancellation is a full physical return with waived charges, not a payment.
-- Preserve the original amounts/items and all incoming payment/allocation rows.
CREATE TABLE public.order_cancellations (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 1000),
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  cancelled_by uuid REFERENCES public.user_profiles(id),
  original_total numeric NOT NULL,
  original_delivery_fee numeric NOT NULL,
  original_items jsonb NOT NULL
);
ALTER TABLE public.order_cancellations ENABLE ROW LEVEL SECURITY;
CREATE POLICY cancellation_read ON public.order_cancellations
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.order_cancellations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_cancellations TO authenticated;
GRANT ALL ON public.order_cancellations TO service_role;

ALTER TABLE public.payments DROP CONSTRAINT payments_payment_type_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_type_check
  CHECK (payment_type IN ('rental', 'deposit', 'deposit_return', 'extra', 'fine', 'refund'));

CREATE FUNCTION public.cancel_order_atomic(
  p_order_id uuid, p_reason text, p_items jsonb, p_created_by uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_snapshot jsonb;
  v_now timestamptz := now();
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Укажите причину отмены (до 1000 символов)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_created_by AND role IN ('admin', 'super_admin')) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Заказ не найден'; END IF;
  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('id', p_order_id, 'status', 'cancelled');
  END IF;
  IF v_order.status NOT IN ('draft', 'active', 'overdue') THEN
    RAISE EXCEPTION 'Можно отменить только незакрытый заказ';
  END IF;
  PERFORM id FROM public.order_items WHERE order_id = p_order_id ORDER BY id FOR UPDATE;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'returned', COALESCE(returned, false),
    'selected_kit_items', COALESCE(selected_kit_items, '{}'::text[]),
    'missing_kit_items', COALESCE(missing_kit_items, '{}'::text[])
  ) ORDER BY id), '[]'::jsonb) INTO v_snapshot
  FROM public.order_items WHERE order_id = p_order_id;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Подтвердите возврат всей техники и комплектации';
  END IF;
  IF v_snapshot IS DISTINCT FROM (SELECT COALESCE(jsonb_agg(item ORDER BY item->>'id'), '[]'::jsonb) FROM jsonb_array_elements(p_items) item) THEN
    RAISE EXCEPTION 'Состав заказа изменился. Обновите страницу и проверьте возврат ещё раз';
  END IF;
  INSERT INTO public.order_cancellations(order_id, reason, cancelled_by, original_total, original_delivery_fee, original_items)
  SELECT p_order_id, btrim(p_reason), p_created_by, v_order.total_amount, v_order.delivery_fee,
    COALESCE(jsonb_agg(to_jsonb(oi) ORDER BY oi.id), '[]'::jsonb)
  FROM public.order_items oi WHERE oi.order_id = p_order_id;

  UPDATE public.order_items SET returned = true,
    actual_end_at = COALESCE(actual_end_at, v_now),
    returned_kit_items = COALESCE(selected_kit_items, '{}'::text[]), missing_kit_items = '{}',
    subtotal = 0, final_subtotal = 0, manual_subtotal = 0
  WHERE order_id = p_order_id;
  UPDATE public.order_item_missing_kit_events
    SET returned_at = v_now, marked_returned_by = p_created_by
    WHERE order_id = p_order_id AND returned_at IS NULL;
  UPDATE public.orders SET status = 'cancelled', total_amount = 0, delivery_fee = 0,
    actual_end_at = v_now, actual_return_date = (v_now AT TIME ZONE 'Asia/Tashkent')::date
    WHERE id = p_order_id;
  -- Keep maintenance/lost states, and never free an item still held on another order.
  UPDATE public.equipment e SET status = 'free'
    WHERE e.status = 'rented'
      AND e.id IN (SELECT equipment_id FROM public.order_items WHERE order_id = p_order_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
        WHERE oi.equipment_id = e.id AND o.status IN ('active', 'overdue') AND NOT oi.returned
      );
  RETURN jsonb_build_object('id', p_order_id, 'status', 'cancelled');
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_order_atomic(uuid, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_atomic(uuid, text, jsonb, uuid) TO service_role;

-- Records an already completed cash/card/transfer refund. No bank transfer occurs.
-- A stable payment ID makes a retried request safe after a lost HTTP response.
CREATE FUNCTION public.record_cancelled_order_refund_atomic(
  p_order_id uuid, p_request_id uuid, p_amount numeric, p_payment_type text,
  p_payment_method text, p_created_by uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_remaining numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_created_by AND role IN ('admin', 'super_admin')) THEN
    RAISE EXCEPTION 'Недостаточно прав';
  END IF;
  IF p_request_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount, 2)
    OR p_payment_type IS NULL OR p_payment_type NOT IN ('refund', 'deposit_return')
    OR p_payment_method IS NULL OR p_payment_method NOT IN ('cash', 'card', 'transfer') THEN
    RAISE EXCEPTION 'Некорректные данные возврата';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_order_id::text));
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'cancelled' THEN RAISE EXCEPTION 'Заказ не отменён'; END IF;
  SELECT * INTO v_existing FROM public.payments WHERE id = p_request_id;
  IF FOUND THEN
    IF v_existing.order_id <> p_order_id OR v_existing.amount <> p_amount
      OR v_existing.payment_type <> p_payment_type OR v_existing.payment_method <> p_payment_method THEN
      RAISE EXCEPTION 'Этот запрос уже использован для другого возврата';
    END IF;
    RETURN p_request_id;
  END IF;
  SELECT COALESCE(SUM(CASE
    WHEN p_payment_type = 'refund' AND payment_type IN ('rental','extra','fine') THEN amount
    WHEN p_payment_type = 'refund' AND payment_type = 'refund' THEN -amount
    WHEN p_payment_type = 'deposit_return' AND payment_type = 'deposit' THEN amount
    WHEN p_payment_type = 'deposit_return' AND payment_type = 'deposit_return' THEN -amount
    ELSE 0 END), 0)
  INTO v_remaining FROM public.payments WHERE order_id = p_order_id;
  IF p_amount > v_remaining THEN RAISE EXCEPTION 'Сумма превышает остаток к возврату'; END IF;
  INSERT INTO public.payments(id, order_id, amount, payment_type, payment_method, created_by, notes)
  VALUES (p_request_id, p_order_id, p_amount, p_payment_type, p_payment_method, p_created_by, 'Возврат средств по отменённому заказу');
  IF p_payment_type = 'deposit_return' AND p_amount = v_remaining THEN
    UPDATE public.orders SET deposit_returned = true WHERE id = p_order_id;
  END IF;
  RETURN p_request_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_cancelled_order_refund_atomic(uuid, uuid, numeric, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cancelled_order_refund_atomic(uuid, uuid, numeric, text, text, uuid) TO service_role;

-- Cash revenue is net of recorded refunds, on the actual refund date.
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
    p.id, p.order_id, p.payment_type, p.payment_method, p.created_by, p.paid_at, p.payment_group_id,
    CASE WHEN p.payment_type = 'refund' THEN -p.amount ELSE p.amount END AS amount,
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
      FROM revenue_current WHERE payment_type <> 'refund'
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
  JOIN public.orders o ON o.id = oi.order_id AND o.status <> 'cancelled'
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

CREATE OR REPLACE VIEW public.v_dashboard_stats WITH (security_invoker = true) AS
SELECT
  (SELECT COUNT(*) FROM orders WHERE status = 'active') AS active_rentals,
  (SELECT COUNT(*) FROM orders WHERE status = 'overdue') AS overdue_count,
  (SELECT COALESCE(SUM(CASE WHEN payment_type = 'refund' THEN -amount ELSE amount END), 0) FROM payments
   WHERE payment_type NOT IN ('deposit', 'deposit_return')
     AND paid_at >= date_trunc('day', now())) AS revenue_today,
  (SELECT COALESCE(SUM(CASE WHEN payment_type = 'refund' THEN -amount ELSE amount END), 0) FROM payments
   WHERE payment_type NOT IN ('deposit', 'deposit_return')
     AND paid_at >= date_trunc('month', now())) AS revenue_this_month,
  (SELECT COALESCE(SUM(CASE WHEN payment_type = 'refund' THEN -amount ELSE amount END), 0) FROM payments
   WHERE payment_type NOT IN ('deposit', 'deposit_return')
     AND paid_at >= date_trunc('week', now())) AS revenue_this_week,
  (SELECT COUNT(*) FROM equipment WHERE status = 'free') AS equipment_free,
  (SELECT COUNT(*) FROM equipment WHERE status = 'rented') AS equipment_rented,
  (SELECT COUNT(*) FROM equipment WHERE status = 'maintenance') AS equipment_maintenance,
  (SELECT COUNT(*) FROM clients) AS total_clients;

NOTIFY pgrst, 'reload schema';
