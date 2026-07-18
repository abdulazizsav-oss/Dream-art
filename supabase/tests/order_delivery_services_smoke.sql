BEGIN;

INSERT INTO public.clients (id, full_name)
VALUES ('10000000-0000-4000-8000-000000000001', 'Smoke client');

INSERT INTO public.equipment_categories (id, name, slug)
VALUES ('10000000-0000-4000-8000-000000000002', 'Smoke', 'smoke');

INSERT INTO public.equipment (
  id, category_id, name, daily_rate, day_rate, night_rate, kit
) VALUES (
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000002',
  'Smoke camera',
  100000,
  100000,
  100000,
  '[{"name":"Крышка","price":0,"default_qty":0,"max_qty":1}]'::jsonb
);

CREATE TEMP TABLE smoke_order (order_id uuid, item_id uuid) ON COMMIT DROP;

INSERT INTO smoke_order (order_id)
SELECT public.create_order_atomic_v3(
  '10000000-0000-4000-8000-000000000001',
  '2026-07-18',
  '2026-07-18',
  '',
  '',
  0,
  '',
  NULL,
  jsonb_build_array(jsonb_build_object(
    'equipment_id', '10000000-0000-4000-8000-000000000003',
    'daily_rate', 100000,
    'days', 1,
    'subtotal', 100000,
    'shift_type', 'day',
    'rate_source', 'auto',
    'day_rate_snapshot', 100000,
    'night_rate_snapshot', 100000,
    'day_units', 1,
    'night_units', 0,
    'condition_on_issue', 'Хорошее',
    'selected_kit_items', '[]'::jsonb,
    'kit_selection', '[]'::jsonb
  )),
  true,
  false
);

UPDATE smoke_order s
SET item_id = oi.id
FROM public.order_items oi
WHERE oi.order_id = s.order_id;

DO $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT o.* INTO v_order
  FROM public.orders o
  JOIN smoke_order s ON s.order_id = o.id;

  IF NOT v_order.delivery_to_client OR v_order.delivery_from_client THEN
    RAISE EXCEPTION 'create v3 saved wrong delivery flags';
  END IF;
  IF v_order.delivery_fee <> 50000 OR v_order.total_amount <> 150000 THEN
    RAISE EXCEPTION 'create v3 calculated wrong totals';
  END IF;
END;
$$;

SELECT public.update_order_item_kit_atomic(
  s.order_id,
  s.item_id,
  '[{"name":"Крышка","qty":1,"unit_price":0}]'::jsonb,
  ARRAY['Крышка']::text[]
)
FROM smoke_order s;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.order_items oi
    JOIN smoke_order s ON s.item_id = oi.id
    WHERE oi.selected_kit_items = ARRAY['Крышка']::text[]
  ) THEN
    RAISE EXCEPTION 'kit editor did not persist selected accessory';
  END IF;
END;
$$;

SELECT public.return_order_items_with_payments_atomic_v3(
  s.order_id,
  jsonb_build_array(jsonb_build_object(
    'order_item_id', s.item_id,
    'condition_on_return', 'Хорошее',
    'return_photo_urls', '[]'::jsonb,
    'returned_kit_items', '["Крышка"]'::jsonb,
    'missing_kit_items', '[]'::jsonb,
    'final_subtotal', 100000,
    'final_day_units', 1,
    'final_night_units', 0,
    'shift_type', 'day'
  )),
  '[]'::jsonb,
  NULL,
  NULL,
  now(),
  true,
  true
)
FROM smoke_order s;

DO $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT o.* INTO v_order
  FROM public.orders o
  JOIN smoke_order s ON s.order_id = o.id;

  IF v_order.status <> 'returned' THEN
    RAISE EXCEPTION 'return v3 did not close order';
  END IF;
  IF NOT v_order.delivery_to_client OR NOT v_order.delivery_from_client THEN
    RAISE EXCEPTION 'return v3 did not preserve/add delivery flags';
  END IF;
  IF v_order.delivery_fee <> 100000 OR v_order.total_amount <> 200000 THEN
    RAISE EXCEPTION 'return v3 calculated wrong delivery totals';
  END IF;
END;
$$;

ROLLBACK;
