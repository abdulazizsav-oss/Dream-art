-- Replace address-based delivery with two fixed transport services:
--   1) send equipment to the client  (+50 000 UZS)
--   2) collect equipment from client (+50 000 UZS)
-- Existing delivery_fee remains the accounting source of truth so historical
-- orders and payment allocations keep their original totals.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_to_client boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_from_client boolean NOT NULL DEFAULT false;

-- Preserve the meaning of orders created by the address-based implementation.
UPDATE public.orders
SET delivery_to_client = true
WHERE fulfillment_method = 'delivery';

-- New orders no longer need an address. Keep legacy columns for rollback
-- compatibility, but remove the obsolete cross-field requirement.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_delivery_fields_check;

COMMENT ON COLUMN public.orders.delivery_to_client IS
  'Fixed 50 000 UZS service: send equipment to the client.';
COMMENT ON COLUMN public.orders.delivery_from_client IS
  'Fixed 50 000 UZS service: collect equipment from the client.';
COMMENT ON COLUMN public.orders.delivery_fee IS
  'Total transport service charge. Historical values are preserved; each new direction adds 50 000 UZS.';

CREATE OR REPLACE FUNCTION public.create_order_atomic_v3(
  p_client_id uuid,
  p_start_date date,
  p_end_date date,
  p_start_time text,
  p_end_time text,
  p_deposit_amount numeric,
  p_notes text,
  p_created_by uuid,
  p_items jsonb,
  p_delivery_to_client boolean DEFAULT false,
  p_delivery_from_client boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_order_id uuid;
  v_to_client boolean := COALESCE(p_delivery_to_client, false);
  v_from_client boolean := COALESCE(p_delivery_from_client, false);
  v_delivery_fee numeric := 0;
BEGIN
  v_delivery_fee :=
    (CASE WHEN v_to_client THEN 50000 ELSE 0 END)
    + (CASE WHEN v_from_client THEN 50000 ELSE 0 END);

  -- The v2 function remains the rollback-compatible creator. It creates a
  -- pickup order with zero legacy delivery, then this transaction attaches the
  -- new fixed services before the order becomes visible to other transactions.
  v_order_id := public.create_order_atomic_v2(
    p_client_id,
    p_start_date,
    p_end_date,
    p_start_time,
    p_end_time,
    p_deposit_amount,
    p_notes,
    p_created_by,
    p_items,
    'pickup',
    NULL,
    0
  );

  UPDATE public.orders
  SET
    delivery_to_client = v_to_client,
    delivery_from_client = v_from_client,
    delivery_fee = v_delivery_fee,
    total_amount = total_amount + v_delivery_fee
  WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_atomic_v3(
  uuid, date, date, text, text, numeric, text, uuid, jsonb, boolean, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic_v3(
  uuid, date, date, text, text, numeric, text, uuid, jsonb, boolean, boolean
) TO service_role;

-- Add newly selected transport directions and close/partially return items in
-- one transaction. Existing true flags can never be switched off here.
CREATE OR REPLACE FUNCTION public.return_order_items_with_payments_atomic_v3(
  p_order_id uuid,
  p_items jsonb,
  p_payment_splits jsonb DEFAULT '[]'::jsonb,
  p_created_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_actual_end_at timestamptz DEFAULT NULL,
  p_delivery_to_client boolean DEFAULT false,
  p_delivery_from_client boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_additional_fee numeric := 0;
  v_result jsonb;
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
    RAISE EXCEPTION 'Услуги доставки можно добавить только к активному заказу';
  END IF;

  IF COALESCE(p_delivery_to_client, false) AND NOT v_order.delivery_to_client THEN
    v_additional_fee := v_additional_fee + 50000;
  END IF;
  IF COALESCE(p_delivery_from_client, false) AND NOT v_order.delivery_from_client THEN
    v_additional_fee := v_additional_fee + 50000;
  END IF;

  UPDATE public.orders
  SET
    delivery_to_client = delivery_to_client OR COALESCE(p_delivery_to_client, false),
    delivery_from_client = delivery_from_client OR COALESCE(p_delivery_from_client, false),
    delivery_fee = delivery_fee + v_additional_fee,
    total_amount = total_amount + v_additional_fee
  WHERE id = p_order_id;

  v_result := public.return_order_items_with_payments_atomic_v2(
    p_order_id,
    p_items,
    p_payment_splits,
    p_created_by,
    p_notes,
    p_actual_end_at
  );

  RETURN v_result || jsonb_build_object('delivery_fee_added', v_additional_fee);
END;
$$;

REVOKE ALL ON FUNCTION public.return_order_items_with_payments_atomic_v3(
  uuid, jsonb, jsonb, uuid, text, timestamptz, boolean, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.return_order_items_with_payments_atomic_v3(
  uuid, jsonb, jsonb, uuid, text, timestamptz, boolean, boolean
) TO service_role;

-- Add accessories to one active order item. Existing quantities may only grow;
-- this prevents an already issued accessory from disappearing from the return
-- checklist. Prices of existing selection rows remain frozen.
CREATE OR REPLACE FUNCTION public.update_order_item_kit_atomic(
  p_order_id uuid,
  p_order_item_id uuid,
  p_kit_selection jsonb,
  p_selected_kit_items text[]
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item public.order_items%ROWTYPE;
  v_old_kit_per_shift numeric := 0;
  v_new_kit_per_shift numeric := 0;
  v_units int := 1;
  v_updated public.order_items%ROWTYPE;
BEGIN
  IF p_kit_selection IS NULL OR jsonb_typeof(p_kit_selection) <> 'array' THEN
    RAISE EXCEPTION 'Некорректная комплектация';
  END IF;

  IF COALESCE(cardinality(p_selected_kit_items), 0) > 200 THEN
    RAISE EXCEPTION 'Слишком много элементов комплектации';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_kit_selection) entry
    WHERE NULLIF(btrim(entry->>'name'), '') IS NULL
       OR COALESCE((entry->>'qty')::int, 0) <= 0
       OR COALESCE((entry->>'unit_price')::numeric, -1) < 0
       OR (entry->>'unit_price')::numeric <> trunc((entry->>'unit_price')::numeric)
  ) THEN
    RAISE EXCEPTION 'Некорректный элемент комплектации';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM jsonb_array_elements(p_kit_selection)
  ) <> (
    SELECT COUNT(DISTINCT entry->>'name')
    FROM jsonb_array_elements(p_kit_selection) entry
  ) THEN
    RAISE EXCEPTION 'Комплектация содержит дубликаты';
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
    RAISE EXCEPTION 'Комплектацию можно изменить только у активного заказа';
  END IF;

  SELECT * INTO v_item
  FROM public.order_items
  WHERE id = p_order_item_id
    AND order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Позиция заказа не найдена';
  END IF;
  IF v_item.returned THEN
    RAISE EXCEPTION 'Нельзя изменить комплект уже сданной позиции';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(COALESCE(v_item.kit_selection, '[]'::jsonb))
      AS old_entry(name text, qty int, unit_price numeric)
    LEFT JOIN jsonb_to_recordset(p_kit_selection)
      AS new_entry(name text, qty int, unit_price numeric)
      ON new_entry.name = old_entry.name
    WHERE COALESCE(new_entry.qty, 0) < old_entry.qty
       OR new_entry.unit_price IS DISTINCT FROM old_entry.unit_price
  ) THEN
    RAISE EXCEPTION 'Уже выданную комплектацию нельзя уменьшить или переоценить';
  END IF;

  SELECT COALESCE(SUM(entry.qty * entry.unit_price), 0)
  INTO v_old_kit_per_shift
  FROM jsonb_to_recordset(COALESCE(v_item.kit_selection, '[]'::jsonb))
    AS entry(name text, qty int, unit_price numeric);

  SELECT COALESCE(SUM(entry.qty * entry.unit_price), 0)
  INTO v_new_kit_per_shift
  FROM jsonb_to_recordset(p_kit_selection)
    AS entry(name text, qty int, unit_price numeric);

  v_units := GREATEST(COALESCE(v_item.day_units, 0) + COALESCE(v_item.night_units, 0), 1);

  UPDATE public.order_items
  SET
    kit_selection = p_kit_selection,
    selected_kit_items = COALESCE(p_selected_kit_items, '{}'::text[]),
    subtotal = CASE
      WHEN manual_subtotal IS NOT NULL THEN subtotal
      ELSE subtotal + ((v_new_kit_per_shift - v_old_kit_per_shift) * v_units)
    END
  WHERE id = p_order_item_id
  RETURNING * INTO v_updated;

  UPDATE public.orders o
  SET total_amount = COALESCE((
    SELECT SUM(oi.subtotal)
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
  ), 0) + o.delivery_fee
  WHERE o.id = p_order_id;

  RETURN to_jsonb(v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.update_order_item_kit_atomic(
  uuid, uuid, jsonb, text[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_item_kit_atomic(
  uuid, uuid, jsonb, text[]
) TO service_role;
