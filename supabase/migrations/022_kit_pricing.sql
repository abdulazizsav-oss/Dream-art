-- Комплектация как полноценная система: цена + количество.
--
-- equipment.kit       — каталог комплекта техники: [{name, price, default_qty, max_qty}]
--                       price — за смену; 0 = входит в базовую цену (стандарт), >0 = платный доп.
-- order_items.kit_selection — выбранный комплект в заказе: [{name, qty, unit_price}] (цены заморожены).
--
-- Изменения чисто аддитивные. Существующий строковый учёт
-- (selected/returned/missing_kit_items) и история недосдачи не трогаются —
-- имена выводятся из kit_selection на стороне приложения.

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS kit jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS kit_selection jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Бэкфилл каталога из текущих тегов kit_items: каждый тег → бесплатная единица.
UPDATE public.equipment
SET kit = COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'name', t,
    'price', 0,
    'default_qty', 1,
    'max_qty', 1
  ))
  FROM unnest(kit_items) AS t
), '[]'::jsonb)
WHERE (kit IS NULL OR kit = '[]'::jsonb)
  AND COALESCE(array_length(kit_items, 1), 0) > 0;

COMMENT ON COLUMN public.equipment.kit IS
  'Каталог комплекта: [{name, price (за смену), default_qty, max_qty}]. price=0 — входит в базовую цену.';
COMMENT ON COLUMN public.order_items.kit_selection IS
  'Выбранный комплект заказа: [{name, qty, unit_price}] (цены заморожены на момент заказа).';
