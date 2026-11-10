-- Align Office mirror request size to TaxPay's one-transaction multi-allocation
-- contract; preserve the existing <=16k restriction for all other services.
-- Never mutate existing payment/receipt rows or cross-project databases.
DO $office_combined_limit$
DECLARE
  v_source text;
  v_old text := 'length(p_input::text)>16000';
  v_new text := 'length(p_input::text) > (CASE WHEN p_input->>''service'' = ''OTHER_TAX_PAYMENT'' AND p_input->''data''->''details''->>''combinedPayment'' = ''true'' THEN 800000 ELSE 16000 END)';
BEGIN
  v_source := pg_get_functiondef('public.demo_story1_mirror(jsonb)'::regprocedure);
  IF position(v_old IN v_source)=0 AND position(v_new IN v_source)=0 THEN
    RAISE EXCEPTION 'OFFICE_MIRROR_UNEXPECTED_SOURCE';
  END IF;
  IF position(v_old IN v_source)>0 THEN
    EXECUTE replace(v_source,v_old,v_new);
  END IF;
END $office_combined_limit$;
