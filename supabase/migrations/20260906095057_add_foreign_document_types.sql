-- Expand the existing check without rewriting client data. Keep every legacy type,
-- including passport_cover, which the UI already offered but the DB rejected.
SET lock_timeout = '5s';
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_document_type_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_document_type_check
  CHECK (document_type IN (
    'passport_id', 'passport_green', 'zagranpassport', 'passport_cover',
    'drivers_license', 'passport_id_foreign', 'passport_foreign'
  ));
RESET lock_timeout;
