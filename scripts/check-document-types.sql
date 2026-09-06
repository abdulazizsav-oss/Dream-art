-- Run with psql -v ON_ERROR_STOP=1 (also safe inside a migration transaction).
-- Only a temporary table is written; real client records are never changed.
CREATE TEMP TABLE document_type_release_check (document_type text NOT NULL);
DO $$
DECLARE
  definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO STRICT definition
  FROM pg_constraint
  WHERE conrelid = 'public.clients'::regclass
    AND conname = 'clients_document_type_check';
  EXECUTE 'ALTER TABLE document_type_release_check ADD ' || definition;
END $$;

INSERT INTO document_type_release_check (document_type) VALUES
  ('passport_id'), ('passport_green'), ('zagranpassport'), ('passport_cover'),
  ('drivers_license'), ('passport_id_foreign'), ('passport_foreign');

DO $$
BEGIN
  BEGIN
    INSERT INTO document_type_release_check VALUES ('unknown_document_type');
    RAISE EXCEPTION 'Unknown document types must be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;

SELECT count(*) AS accepted_document_types FROM document_type_release_check;
DROP TABLE document_type_release_check;
