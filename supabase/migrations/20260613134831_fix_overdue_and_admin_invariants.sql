-- Keep overdue orders visible after mark_overdue_orders() changes their status.
CREATE OR REPLACE VIEW public.v_overdue_orders
WITH (security_invoker = true)
AS
SELECT
  o.id,
  o.order_number,
  o.client_id,
  o.status,
  o.start_date,
  o.end_date,
  o.total_amount,
  o.deposit_amount,
  o.deposit_returned,
  o.contract_pdf_url,
  o.notes,
  o.created_by,
  o.created_at,
  o.updated_at,
  c.full_name AS client_name,
  c.phone AS client_phone,
  c.telegram_chat_id,
  (CURRENT_DATE - o.end_date) AS days_overdue
FROM public.orders o
JOIN public.clients c ON o.client_id = c.id
WHERE o.status IN ('active', 'overdue')
  AND o.end_date < CURRENT_DATE;

-- New and updated orders must have a valid date range. NOT VALID keeps the
-- migration deployable if legacy bad rows need separate cleanup.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'orders_end_date_not_before_start_date'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_end_date_not_before_start_date
      CHECK (end_date >= start_date)
      NOT VALID;
  END IF;
END;
$$;

-- Database-level backstop: API checks give a friendly error, while this
-- trigger also protects against concurrent or out-of-band mutations.
CREATE OR REPLACE FUNCTION public.ensure_super_admin_remains()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.role = 'super_admin'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'super_admin') THEN
    -- Lock the remaining super-admin rows. Concurrent attempts either observe
    -- the committed role change or conflict, so both cannot remove each other.
    PERFORM id
    FROM public.user_profiles
    WHERE role = 'super_admin'
      AND id <> OLD.id
    ORDER BY id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Нельзя удалить или понизить последнего super_admin'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_super_admin_remains() FROM PUBLIC;

DROP TRIGGER IF EXISTS ensure_super_admin_remains ON public.user_profiles;
CREATE TRIGGER ensure_super_admin_remains
BEFORE UPDATE OF role OR DELETE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_super_admin_remains();
