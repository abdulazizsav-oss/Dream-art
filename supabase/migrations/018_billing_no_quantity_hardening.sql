-- Dream Art CRM
-- Billing/no-quantity hardening.
-- One equipment row is one physical unit; a single order cannot keep the same
-- equipment open twice at the same time.

CREATE UNIQUE INDEX IF NOT EXISTS order_items_one_open_equipment_per_order_idx
  ON public.order_items(order_id, equipment_id)
  WHERE returned = false;

-- Mutating order RPCs are server-only. Next.js API routes authenticate the user,
-- normalize billing server-side, then call these functions with service_role.
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.create_order_atomic(
    uuid, date, date, text, text, numeric, text, uuid, jsonb
  ) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.create_order_atomic(
    uuid, date, date, text, text, numeric, text, uuid, jsonb
  ) TO service_role;
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.add_order_items_atomic(
    uuid, jsonb, uuid
  ) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.add_order_items_atomic(
    uuid, jsonb, uuid
  ) TO service_role;
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.return_order_items_atomic(
    uuid, jsonb
  ) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.return_order_items_atomic(
    uuid, jsonb
  ) TO service_role;
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.return_order_atomic(
    uuid, jsonb, date
  ) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.return_order_atomic(
    uuid, jsonb, date
  ) TO service_role;
EXCEPTION WHEN undefined_function THEN
  NULL;
END $$;
