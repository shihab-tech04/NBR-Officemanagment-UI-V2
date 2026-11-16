-- P6 disposable SQL acceptance: authorized Office-initiated correction
-- must queue an immutable review-only command, not modify original money.
BEGIN;
INSERT INTO demo_payment.story_payments(
 id,session_id,service_code,amount_minor,data,status,created_at)
VALUES(
 '80000000-0000-4000-8000-000000000041',
 '80000000-0000-4000-8000-000000000042',
 'OTHER_TAX_PAYMENT',700,
 jsonb_build_object('origin','TAXPAY_UI','details',jsonb_build_object(
   'receiptReference','SYN-PARENT-0001','taxpayerTin','111111111111',
   'allocations',jsonb_build_array(jsonb_build_object(
     'allocationId','alloc-for-office-initiation',
     'taxpayerTin','111111111111','amountMinor',700)))),
 'SIMULATED_SUCCESS','2026-11-16T02:00:00Z'
);
CREATE TEMP TABLE phase6_original AS
 SELECT id,status,data FROM demo_payment.story_payments
 WHERE id='80000000-0000-4000-8000-000000000041'::uuid;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000011',true);
DO $maker$
DECLARE v jsonb; v_retry jsonb;
BEGIN
 v:=public.payment_v1_office_initiate_correction(
  '80000000-0000-4000-8000-000000000041',
  '111111111111','SYN-PARENT-0001',
  'A correction is needed for the linked original payment',
  'Review the existing assessment year but do not change the payment',
  E'বাংলা সহায়ক প্রমাণ\\nOffice supporting evidence is longer than twenty characters',
  '80000000-0000-4000-8000-000000000071');
 IF v->>'queued'<>'true' OR v->>'replayed'<>'false'
    OR v->>'status'<>'AWAITING_TAXPAYER_SOURCE_VERIFICATION' THEN
   RAISE EXCEPTION 'OFFICE_INITIATION_NOT_DURABLY_QUEUED';
 END IF;
 v_retry:=public.payment_v1_office_initiate_correction(
  '80000000-0000-4000-8000-000000000041',
  '111111111111','SYN-PARENT-0001',
  'A correction is needed for the linked original payment',
  'Review the existing assessment year but do not change the payment',
  E'বাংলা সহায়ক প্রমাণ\\nOffice supporting evidence is longer than twenty characters',
  '80000000-0000-4000-8000-000000000071');
 IF v_retry->>'caseId' IS DISTINCT FROM v->>'caseId'
    OR v_retry->>'replayed'<>'true' THEN
   RAISE EXCEPTION 'OFFICE_INITIATION_IDEMPOTENT_RETRY_FAILED';
 END IF;
 BEGIN
  PERFORM public.payment_v1_office_initiate_correction(
   '80000000-0000-4000-8000-000000000041',
   '222222222222','SYN-PARENT-0001',
   'Forged taxpayer correction changes the recipient',
   'Change the recipient without the original verified allocation',
   'Evidence supplied but not tied to the original payment',
   '80000000-0000-4000-8000-000000000072');
  RAISE EXCEPTION 'FORGED_OFFICE_INITIATION_WAS_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='FORGED_OFFICE_INITIATION_WAS_ACCEPTED' THEN RAISE; END IF;
 END;
END;
$maker$;
SELECT pg_catalog.set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000012',true);
DO $outsider$
BEGIN
 BEGIN
  PERFORM public.payment_v1_office_initiate_correction(
   '80000000-0000-4000-8000-000000000041',
   '111111111111','SYN-PARENT-0001',
   'Outsider lacks an authorized officer role',
   'A reviewer must not be allowed to initiate this case',
   'This request must be denied before any command is enqueued',
   '80000000-0000-4000-8000-000000000073');
  RAISE EXCEPTION 'NON_OFFICER_INITIATION_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='NON_OFFICER_INITIATION_ACCEPTED' THEN RAISE; END IF;
 END;
END;
$outsider$;
RESET ROLE;
DO $verify$
DECLARE v_count int; v_commands int; v_mirror jsonb; v_history jsonb;
BEGIN
 SELECT count(*) INTO v_count FROM payment_sync.office_initiated_corrections;
 SELECT count(*) INTO v_commands
 FROM payment_sync.control_outbox o
 WHERE o.payload->>'commandType'='OFFICE_CORRECTION_INITIATED';
 IF v_count<>1 OR v_commands<>1 THEN
  RAISE EXCEPTION 'OFFICE_INITIATION_DUPLICATE_OR_MISSING';
 END IF;
 SELECT o.payload INTO v_mirror FROM payment_sync.control_outbox o
 WHERE o.payload->>'commandType'='OFFICE_CORRECTION_INITIATED';
 IF v_mirror->>'sourcePaymentId'<>'80000000-0000-4000-8000-000000000041'
    OR v_mirror->>'origin'<>'OFFICE_SQL'
    OR v_mirror->>'taxpayerTin'<>'111111111111' THEN
    RAISE EXCEPTION 'OFFICE_INITIATION_SIGNED_PAYLOAD_INCORRECT';
 END IF;
 IF EXISTS(
  SELECT 1 FROM demo_payment.story_payments p
  FULL JOIN phase6_original original ON original.id=p.id
  WHERE p.id='80000000-0000-4000-8000-000000000041'
    AND (p.data IS DISTINCT FROM original.data OR p.status IS DISTINCT FROM original.status)
 ) THEN RAISE EXCEPTION 'OFFICE_INITIATION_MUTATED_PAYMENT'; END IF;
 IF has_function_privilege('anon','public.payment_v1_office_initiate_correction(uuid,text,text,text,text,text,uuid)','EXECUTE')
   OR NOT has_function_privilege('authenticated','public.payment_v1_office_initiate_correction(uuid,text,text,text,text,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'OFFICE_INITIATION_RLS_GRANT_REGRESSION'; END IF;
END;
$verify$;
ROLLBACK;
