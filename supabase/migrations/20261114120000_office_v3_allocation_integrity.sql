-- F-113/F-114/F-117/F-126: fail closed on malformed new v3 combined
-- payment allocations before the separate Office mirror inserts its parent.
-- Existing/legacy rows and v1/v2 replay remain unchanged.
-- The trusted TaxPay Edge source proof remains mandatory independently.
BEGIN;

CREATE OR REPLACE FUNCTION demo_payment.check_new_v3_combined_allocations()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO ''
AS $allocation_integrity$
DECLARE
  v_lines jsonb;
  v_line jsonb;
  v_id text;
  v_ids text[] := ARRAY[]::text[];
  v_amount text;
  v_total numeric := 0;
BEGIN
  IF NEW.service_code IS DISTINCT FROM 'OTHER_TAX_PAYMENT'
     OR NEW.data->>'origin' IS DISTINCT FROM 'TAXPAY_UI'
     OR NEW.data#>>'{details,allocationContractVersion}' IS DISTINCT FROM '3'
  THEN
    RETURN NEW;
  END IF;

  v_lines := NEW.data#>'{details,allocations}';
  IF pg_catalog.jsonb_typeof(v_lines) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(v_lines) = 0
     OR NEW.amount_minor <= 0
     OR NEW.data->>'amountMinor' IS DISTINCT FROM NEW.amount_minor::text
  THEN
    RAISE EXCEPTION 'INVALID_V3_ALLOCATION';
  END IF;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(v_lines) AS a(value)
  LOOP
    v_id := v_line->>'allocationId';
    v_amount := v_line->>'amountMinor';
    IF pg_catalog.jsonb_typeof(v_line) IS DISTINCT FROM 'object'
       OR pg_catalog.jsonb_typeof(v_line->'allocationId') IS DISTINCT FROM 'string'
       OR pg_catalog.length(pg_catalog.btrim(coalesce(v_id,''))) = 0
       OR v_id = ANY(v_ids)
       OR v_amount IS NULL
       OR v_amount !~ '^[1-9][0-9]{0,18}$'
       OR pg_catalog.jsonb_typeof(v_line->'serviceCode') IS DISTINCT FROM 'string'
       OR coalesce(v_line->>'serviceCode','') = ''
       OR pg_catalog.jsonb_typeof(v_line->'isWithholding') IS DISTINCT FROM 'boolean'
       OR coalesce(v_line->>'assessmentYear','') = ''
       OR coalesce(v_line->>'taxpayerTin','') = ''
       OR coalesce(v_line->>'headId','') !~ '^[1-9][0-9]*$'
    THEN
      RAISE EXCEPTION 'INVALID_V3_ALLOCATION';
    END IF;
    IF v_amount::numeric > 9223372036854775807::numeric THEN
      RAISE EXCEPTION 'INVALID_V3_ALLOCATION';
    END IF;
    v_ids := pg_catalog.array_append(v_ids,v_id);
    v_total := v_total + v_amount::numeric;
  END LOOP;

  IF v_total <> NEW.amount_minor::numeric THEN
    RAISE EXCEPTION 'INVALID_V3_ALLOCATION';
  END IF;
  RETURN NEW;
END;
$allocation_integrity$;

REVOKE ALL ON FUNCTION demo_payment.check_new_v3_combined_allocations()
  FROM PUBLIC,anon,authenticated;

CREATE TRIGGER office_v3_allocation_integrity_before_insert
  BEFORE INSERT ON demo_payment.story_payments
  FOR EACH ROW EXECUTE FUNCTION demo_payment.check_new_v3_combined_allocations();

COMMENT ON FUNCTION demo_payment.check_new_v3_combined_allocations() IS
  'Rejects missing/duplicate source allocation IDs, malformed v3 line identities and parent-vs-allocation amount drift before a new Office combined mirror insert. Existing rows and v1/v2 replay are unchanged.';

COMMIT;
