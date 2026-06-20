-- Dream Art CRM: calendar and finance analytics.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clients_created_by_profile_fk'
      AND conrelid = 'public.clients'::regclass
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_created_by_profile_fk
      FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS clients_created_by_idx
  ON public.clients(created_by);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (
    category IN ('maintenance', 'purchase', 'salary', 'rent', 'tax', 'marketing', 'transport', 'other')
  ),
  description text NOT NULL DEFAULT '',
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'UZS' CHECK (currency = 'UZS'),
  expense_date date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tashkent')::date),
  payment_method text NOT NULL DEFAULT 'cash' CHECK (
    payment_method IN ('cash', 'transfer', 'card')
  ),
  equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expenses_created_by_profile_fk'
      AND conrelid = 'public.expenses'::regclass
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_created_by_profile_fk
      FOREIGN KEY (created_by) REFERENCES public.user_profiles(id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS expenses_expense_date_idx
  ON public.expenses(expense_date DESC);

CREATE INDEX IF NOT EXISTS expenses_equipment_id_idx
  ON public.expenses(equipment_id)
  WHERE equipment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS expenses_created_by_idx
  ON public.expenses(created_by)
  WHERE created_by IS NOT NULL;

DROP TRIGGER IF EXISTS expenses_updated_at ON public.expenses;
CREATE TRIGGER expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_expenses" ON public.expenses;
CREATE POLICY "authenticated_read_expenses"
  ON public.expenses
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "super_admin_insert_expenses" ON public.expenses;
CREATE POLICY "super_admin_insert_expenses"
  ON public.expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles profile
      WHERE profile.id = auth.uid()
        AND profile.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "super_admin_update_expenses" ON public.expenses;
CREATE POLICY "super_admin_update_expenses"
  ON public.expenses
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles profile
      WHERE profile.id = auth.uid()
        AND profile.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles profile
      WHERE profile.id = auth.uid()
        AND profile.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS "super_admin_delete_expenses" ON public.expenses;
CREATE POLICY "super_admin_delete_expenses"
  ON public.expenses
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles profile
      WHERE profile.id = auth.uid()
        AND profile.role = 'super_admin'
    )
  );

GRANT SELECT ON public.expenses TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.expenses TO authenticated;

CREATE OR REPLACE VIEW public.v_equipment_utilization
WITH (security_invoker = true)
AS
SELECT
  e.id,
  e.name,
  e.category_id,
  e.daily_rate,
  e.purchase_cost,
  e.status,
  COUNT(DISTINCT oi.order_id) FILTER (WHERE o.status IS DISTINCT FROM 'cancelled') AS total_rentals,
  COALESCE(SUM(
    CASE
      WHEN o.status IS DISTINCT FROM 'cancelled'
      THEN COALESCE(
        oi.final_day_units + oi.final_night_units,
        oi.day_units + oi.night_units,
        oi.days
      )
      ELSE 0
    END
  ), 0) AS total_rental_days,
  COALESCE(SUM(
    CASE
      WHEN o.status IS DISTINCT FROM 'cancelled'
      THEN COALESCE(oi.final_subtotal, oi.subtotal, 0)
      ELSE 0
    END
  ), 0) AS total_revenue,
  CASE
    WHEN e.purchase_cost > 0 THEN ROUND((
      COALESCE(SUM(
        CASE
          WHEN o.status IS DISTINCT FROM 'cancelled'
          THEN COALESCE(oi.final_subtotal, oi.subtotal, 0)
          ELSE 0
        END
      ), 0) / e.purchase_cost
    ) * 100, 1)
    ELSE 0
  END AS roi_percent,
  e.currency
FROM public.equipment e
LEFT JOIN public.order_items oi ON oi.equipment_id = e.id
LEFT JOIN public.orders o ON o.id = oi.order_id
GROUP BY e.id;

GRANT SELECT ON public.v_equipment_utilization TO authenticated;

CREATE OR REPLACE FUNCTION public.add_order_payment_with_allocations_atomic(
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
  v_split jsonb;
  v_item record;
  v_payment_id uuid;
  v_payment_ids uuid[] := '{}';
  v_group_id uuid := NULL;
  v_split_count integer := 0;
  v_split_total numeric := 0;
  v_remaining_due numeric := 0;
  v_remaining_payment numeric := 0;
  v_alloc_amount numeric := 0;
BEGIN
  IF p_payment_type NOT IN ('rental', 'deposit', 'deposit_return', 'extra', 'fine') THEN
    RAISE EXCEPTION 'Некорректный тип платежа';
  END IF;

  IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' OR jsonb_array_length(p_splits) = 0 THEN
    RAISE EXCEPTION 'Укажите сумму платежа';
  END IF;

  PERFORM 1
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Заказ не найден';
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
    INTO v_remaining_due
    FROM public.order_items oi
    LEFT JOIN (
      SELECT order_item_id, SUM(amount) AS paid
      FROM public.order_item_payment_allocations
      GROUP BY order_item_id
    ) alloc ON alloc.order_item_id = oi.id
    WHERE oi.order_id = p_order_id;

    IF v_split_total > v_remaining_due + 0.01 THEN
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
        EXIT WHEN v_remaining_payment <= 0.01;
        CONTINUE WHEN v_item.remaining <= 0.01;

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

      IF v_remaining_payment > 0.01 THEN
        RAISE EXCEPTION 'Не удалось распределить платёж по позициям';
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'paid_total', v_split_total,
    'payment_ids', to_jsonb(v_payment_ids),
    'payment_group_id', v_group_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_order_payment_with_allocations_atomic(
  uuid, text, jsonb, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_order_payment_with_allocations_atomic(
  uuid, text, jsonb, uuid, text
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
    COALESCE(SUM(COALESCE(oi.final_subtotal, oi.subtotal, 0)), 0) AS charge
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
      FROM public.orders o, params
      WHERE o.created_by = profile.id
        AND o.status <> 'cancelled'
        AND (o.created_at AT TIME ZONE 'Asia/Tashkent')::date BETWEEN date_from AND date_to
    ), 0) AS orders_count,
    COALESCE((
      SELECT SUM(COALESCE(oi.final_subtotal, oi.subtotal, 0))
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      JOIN params ON true
      WHERE o.created_by = profile.id
        AND o.status <> 'cancelled'
        AND (o.created_at AT TIME ZONE 'Asia/Tashkent')::date BETWEEN date_from AND date_to
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
        FROM public.order_item_payment_allocations
        GROUP BY payment_id
      ) allocated ON allocated.payment_id = p.id
      WHERE p.payment_type = 'rental'
    ), 0)
  )
)
FROM params;
$$;

REVOKE ALL ON FUNCTION public.get_finance_analytics(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_finance_analytics(date, date) TO authenticated, service_role;
