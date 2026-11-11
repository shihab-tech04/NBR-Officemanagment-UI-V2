-- Preserve one TaxPay -> Office receipt for large Return-only allocations.
-- Only the two already-validated combined categories use the 800k SQL mirror cap.
-- All legacy/uncombined services retain the 16k cap. Existing rows are untouched.
BEGIN;
DO $office_return_combined_limit$
DECLARE
  v_sql text;
  v_old text := 'length(p_input::text) > (CASE WHEN p_input->>''service'' = ''OTHER_TAX_PAYMENT'' AND p_input->''data''->''details''->>''combinedPayment'' = ''true'' THEN 800000 ELSE 16000 END)';
  v_new text := 'length(p_input::text) > (CASE WHEN p_input->>''service'' IN (''OTHER_TAX_PAYMENT'',''TAX_WITH_RETURN'') AND p_input->''data''->''details''->>''combinedPayment'' = ''true'' THEN 800000 ELSE 16000 END)';
BEGIN
  v_sql := pg_get_functiondef('public.demo_story1_mirror(jsonb)'::regprocedure);
  IF position(v_new IN v_sql)>0 THEN RETURN; END IF;
  IF position(v_old IN v_sql)=0 THEN
    RAISE EXCEPTION 'OFFICE_RETURN_MIRROR_SOURCE_UNEXPECTED';
  END IF;
  EXECUTE replace(v_sql,v_old,v_new);
  IF position(v_new IN pg_get_functiondef('public.demo_story1_mirror(jsonb)'::regprocedure))=0 THEN
    RAISE EXCEPTION 'OFFICE_RETURN_MIRROR_INSTALL_FAILED';
  END IF;
END $office_return_combined_limit$;
COMMIT;
