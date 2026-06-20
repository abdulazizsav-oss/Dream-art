-- Ручная цена позиции заказа (override авто-расчёта по сменам).
--
-- Если manual_subtotal задан — итог по позиции «заморожен» на этой сумме и не
-- пересчитывается ни в preview, ни при закрытии заказа (actual_start_at → now()).
-- NULL — обычный авто-расчёт день/ночь.
--
-- Изменение чисто аддитивное и обратимое: для отката достаточно
--   ALTER TABLE order_items DROP COLUMN manual_subtotal;
--
-- create_order_atomic трогать не нужно: ручная сумма уже приходит в subtotal
-- (фронт замораживает её через recalculateOrderItems), а колонка manual_subtotal
-- проставляется отдельным UPDATE в POST /api/orders. Это сделано намеренно,
-- чтобы не переписывать боевую RPC-функцию.

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS manual_subtotal numeric(12,2);

COMMENT ON COLUMN public.order_items.manual_subtotal IS
  'Ручная цена позиции. NOT NULL → итог заморожен на этой сумме, авто-расчёт смен игнорируется.';
