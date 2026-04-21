-- Actual open/close timestamps for orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS actual_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS actual_end_at   timestamptz;

-- Backfill for existing rows: use created_at as actual open time, updated_at for closed orders
UPDATE orders SET actual_start_at = created_at WHERE actual_start_at IS NULL;
UPDATE orders SET actual_end_at = updated_at
  WHERE status = 'returned' AND actual_end_at IS NULL;

-- Per-item kit return tracking
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS returned_kit_items text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS missing_kit_items  text[] DEFAULT '{}';

-- Updated return RPC: accepts returned/missing kit items per order_item + writes actual_end_at
CREATE OR REPLACE FUNCTION return_order_atomic(
  p_order_id uuid,
  p_items jsonb,
  p_actual_return_date date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_item jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE order_items
    SET condition_on_return = v_item->>'condition_on_return',
        return_photo_urls   = COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(v_item->'return_photo_urls')),
          '{}'::text[]
        ),
        returned_kit_items  = COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(v_item->'returned_kit_items')),
          '{}'::text[]
        ),
        missing_kit_items   = COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(v_item->'missing_kit_items')),
          '{}'::text[]
        )
    WHERE id = (v_item->>'order_item_id')::uuid;
  END LOOP;

  UPDATE orders
  SET status = 'returned',
      actual_return_date = COALESCE(p_actual_return_date, CURRENT_DATE),
      actual_end_at = now()
  WHERE id = p_order_id;
END;
$$;
