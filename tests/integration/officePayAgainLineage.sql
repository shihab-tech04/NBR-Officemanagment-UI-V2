-- WS3 Office Pay Again owner/receipt/allocations and negative-role acceptance.
-- All data and fictional Auth fixtures are local PostgreSQL CI and rolled back.
-- Never use this script on the original hosted Office project.
BEGIN;
CREATE SCHEMA IF NOT EXISTS payment_sync;
CREATE TABLE IF NOT EXISTS payment_sync.settings(
  singleton boolean PRIMARY KEY, origin text NOT NULL
);
INSERT INTO payment_sync.settings(singleton,origin)
 VALUES(true,'OFFICE_SQL') ON CONFLICT(singleton) DO UPDATE SET origin='OFFICE_SQL';
CREATE TABLE IF NOT EXISTS payment_sync.officer_roles(
 user_uid uuid PRIMARY KEY REFERENCES auth.users(id),
 role text NOT NULL CHECK(role IN ('MAKER','REVIEWER','APPROVER')),
 active boolean NOT NULL DEFAULT true
);
INSERT INTO auth.users(id,email)
VALUES('d1000000-0000-4000-8000-000000000001','ws3-office-officer@example.invalid'),
      ('d1000000-0000-4000-8000-000000000002','ws3-non-officer@example.invalid')
ON CONFLICT(id) DO NOTHING;
INSERT INTO payment_sync.officer_roles(user_uid,role,active)
 VALUES('d1000000-0000-4000-8000-000000000001','MAKER',true)
ON CONFLICT(user_uid) DO UPDATE SET role='MAKER',active=true;

CREATE TEMP TABLE ws3_pay_again_office_state(
 source_id uuid NOT NULL,repeat_id uuid NOT NULL,pending_id uuid NOT NULL,
 missing_source_id uuid NOT NULL,source_ref text NOT NULL,repeat_ref text NOT NULL
) ON COMMIT DROP;
-- Read-only fixture metadata is available to both disposable JWT roles.
GRANT SELECT ON ws3_pay_again_office_state TO authenticated;
DO $fixtures$
DECLARE
 v_source_id uuid:=gen_random_uuid();
 v_repeat_id uuid:=gen_random_uuid();
 v_pending_id uuid:=gen_random_uuid();
 v_missing_id uuid:=gen_random_uuid();
 v_source_ref text:='SIM-'||gen_random_uuid()::text;
 v_repeat_ref text:='SIM-'||gen_random_uuid()::text;
 v_details jsonb;
 v_data jsonb;
 v_repeat_data jsonb;
 v_input jsonb;
 v_pending_data jsonb;
 v_result jsonb;
BEGIN
  v_details:=pg_catalog.jsonb_build_object(
    'payerId','user1','payerTin','111111111111','payerName','WS3 CI payer',
    'payerMode','OTHER','combinedPayment',true,'allocationContractVersion',3,
    'allocationCount',2,'taxpayerCount',2,'receiptReference',v_source_ref,
    'challanRemarks',E'বাংলায় দীর্ঘ মন্তব্য সংরক্ষণ পরীক্ষা।\\nMultiline text longer than twenty characters',
    'allocations',pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('allocationId','ws3-original-A',
        'taxpayerTin','222222222222','taxpayerName','WS3 CI recipient A',
        'headId',121,'assessmentYear','2026-27','amountMinor',1500,
        'serviceCode','ADVANCE_TAX','isWithholding',false),
      pg_catalog.jsonb_build_object('allocationId','ws3-original-B',
        'taxpayerTin','333333333333','taxpayerName','WS3 CI recipient B',
        'headId',145,'assessmentYear','2025-26','amountMinor',3500,
        'serviceCode','ASSESSED_DEMAND','isWithholding',false)
    ),
    'receiptSnapshot',pg_catalog.jsonb_build_object(
      'challanNo',v_source_ref,'paymentCategory','OTHER_TAX_PAYMENT',
      'totalAmount',50,'items','[]'::jsonb,'allocationItems','[]'::jsonb)
  );
  v_data:=pg_catalog.jsonb_build_object('origin','TAXPAY_UI',
    'service','OTHER_TAX_PAYMENT','amountMinor',5000,'details',v_details);
  v_input:=pg_catalog.jsonb_build_object(
    'id',v_source_id,'sessionId',gen_random_uuid(),
    'service','OTHER_TAX_PAYMENT','amountMinor',5000,
    'status','SIMULATED_SUCCESS','createdAt',now(),'data',v_data);
  v_result:=public.demo_story1_mirror(v_input);
  IF v_result->>'id' IS DISTINCT FROM v_source_id::text
  THEN RAISE EXCEPTION 'OFFICE_LINEAGE_SOURCE_MIRROR_FAILED'; END IF;

  v_repeat_data:=pg_catalog.jsonb_set(v_data,'{details,sourcePaymentId}',
    pg_catalog.to_jsonb(v_source_id::text),true);
  v_repeat_data:=pg_catalog.jsonb_set(v_repeat_data,'{details,receiptReference}',
    pg_catalog.to_jsonb(v_repeat_ref),true);
  v_repeat_data:=pg_catalog.jsonb_set(v_repeat_data,
    '{details,receiptSnapshot,challanNo}',pg_catalog.to_jsonb(v_repeat_ref),true);
  v_repeat_data:=pg_catalog.jsonb_set(v_repeat_data,
    '{details,allocations,0,allocationId}',
    pg_catalog.to_jsonb('ws3-repeat-A'::text),true);
  v_repeat_data:=pg_catalog.jsonb_set(v_repeat_data,
    '{details,allocations,1,allocationId}',
    pg_catalog.to_jsonb('ws3-repeat-B'::text),true);
  v_input:=pg_catalog.jsonb_set(v_input,'{id}',
    pg_catalog.to_jsonb(v_repeat_id::text));
  v_input:=pg_catalog.jsonb_set(v_input,'{data}',v_repeat_data);
  v_result:=public.demo_story1_mirror(v_input);
  IF v_result->>'id' IS DISTINCT FROM v_repeat_id::text
  THEN RAISE EXCEPTION 'OFFICE_LINEAGE_REPEAT_MIRROR_FAILED'; END IF;
  IF public.demo_story1_mirror(v_input)->>'replayed' IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'OFFICE_LINEAGE_REPLAY_NOT_IDEMPOTENT'; END IF;

  -- The out-of-order repeat must never fabricate its still-unmirrored source.
  v_pending_data:=pg_catalog.jsonb_set(v_repeat_data,'{details,sourcePaymentId}',
    pg_catalog.to_jsonb(v_missing_id::text));
  v_input:=pg_catalog.jsonb_set(v_input,'{id}',
    pg_catalog.to_jsonb(v_pending_id::text));
  v_input:=pg_catalog.jsonb_set(v_input,'{data}',v_pending_data);
  v_result:=public.demo_story1_mirror(v_input);
  IF v_result->>'id' IS DISTINCT FROM v_pending_id::text
  THEN RAISE EXCEPTION 'OFFICE_LINEAGE_PENDING_MIRROR_FAILED'; END IF;

  INSERT INTO ws3_pay_again_office_state
  VALUES(v_source_id,v_repeat_id,v_pending_id,v_missing_id,v_source_ref,v_repeat_ref);
END;
$fixtures$;

DO $grant_check$
BEGIN
 IF has_function_privilege('anon',
     'public.payment_v1_office_guarded_pay_again_lineage(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated',
     'public.payment_v1_office_guarded_pay_again_lineage(uuid)','EXECUTE')
    OR has_table_privilege('anon','demo_payment.story_payments','SELECT')
    OR has_function_privilege('anon',
     'public.payment_v1_office_guarded_challan_remarks(uuid)','EXECUTE')
    OR NOT has_function_privilege('authenticated',
     'public.payment_v1_office_guarded_challan_remarks(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'OFFICE_LINEAGE_PUBLIC_PERMISSION_LEAK'; END IF;
END;
$grant_check$;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'd1000000-0000-4000-8000-000000000002',true);
DO $outsider$
DECLARE v_denied boolean:=false;
BEGIN
 BEGIN
   PERFORM public.payment_v1_office_guarded_pay_again_lineage(
     (SELECT repeat_id FROM ws3_pay_again_office_state));
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'OFFICE_LINEAGE_NON_OFFICER_GRANTED'; END IF;
 v_denied:=false;
 BEGIN
   PERFORM public.payment_v1_office_guarded_challan_remarks(
     (SELECT source_id FROM ws3_pay_again_office_state));
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
 IF NOT v_denied THEN RAISE EXCEPTION 'OFFICE_REMARKS_NON_OFFICER_GRANTED'; END IF;
END;
$outsider$;

SELECT pg_catalog.set_config('request.jwt.claim.sub',
  'd1000000-0000-4000-8000-000000000001',true);
DO $officer$
DECLARE v jsonb;v_pending jsonb;v_remarks jsonb;v_repeat_remarks jsonb;
  v_state ws3_pay_again_office_state%ROWTYPE;
BEGIN
 SELECT * INTO v_state FROM ws3_pay_again_office_state;
 v_remarks:=public.payment_v1_office_guarded_challan_remarks(v_state.source_id);
 v_repeat_remarks:=public.payment_v1_office_guarded_challan_remarks(v_state.repeat_id);
 IF v_remarks->>'paymentId' IS DISTINCT FROM v_state.source_id::text
    OR v_remarks->>'receiptReference' IS DISTINCT FROM v_state.source_ref
    OR v_remarks->>'challanRemarks' IS DISTINCT FROM E'বাংলায় দীর্ঘ মন্তব্য সংরক্ষণ পরীক্ষা।\\nMultiline text longer than twenty characters'
    OR v_repeat_remarks->>'challanRemarks' IS DISTINCT FROM v_remarks->>'challanRemarks'
 THEN RAISE EXCEPTION 'OFFICE_REMARKS_ORIGINAL_REPEAT_PARITY_FAILED'; END IF;
 v:=public.payment_v1_office_guarded_pay_again_lineage(v_state.repeat_id);
 IF v->>'paymentId' IS DISTINCT FROM v_state.repeat_id::text OR
    v->>'sourcePaymentId' IS DISTINCT FROM v_state.source_id::text OR
    v->>'sourceMirrored' IS DISTINCT FROM 'true' OR
    v->>'payerId' IS DISTINCT FROM 'user1' OR
    v->>'sourceReceiptReference' IS DISTINCT FROM v_state.source_ref OR
    v->>'repeatReceiptReference' IS DISTINCT FROM v_state.repeat_ref OR
    v->>'sourceCertificateReference' IS DISTINCT FROM 'SK-PC-'||v_state.source_id::text OR
    v->>'repeatCertificateReference' IS DISTINCT FROM 'SK-PC-'||v_state.repeat_id::text OR
    v->>'sourceAmountMinor' IS DISTINCT FROM '5000' OR
    v->>'repeatAmountMinor' IS DISTINCT FROM '5000' OR
    pg_catalog.jsonb_array_length(v->'sourceAllocations')<>2 OR
    pg_catalog.jsonb_array_length(v->'repeatAllocations')<>2 OR
    v#>>'{sourceAllocations,0,allocationId}' IS DISTINCT FROM 'ws3-original-A' OR
    v#>>'{sourceAllocations,1,allocationId}' IS DISTINCT FROM 'ws3-original-B' OR
    v#>>'{repeatAllocations,0,allocationId}' IS DISTINCT FROM 'ws3-repeat-A' OR
    v#>>'{repeatAllocations,1,allocationId}' IS DISTINCT FROM 'ws3-repeat-B' OR
    v#>>'{sourceAllocations,1,assessmentYear}' IS DISTINCT FROM '2025-26' OR
    v#>>'{repeatAllocations,1,amountMinor}' IS DISTINCT FROM '3500'
 THEN RAISE EXCEPTION 'OFFICE_PAY_AGAIN_LINEAGE_READBACK_MISMATCH'; END IF;

 v_pending:=public.payment_v1_office_guarded_pay_again_lineage(v_state.pending_id);
 IF v_pending->>'sourceMirrored' IS DISTINCT FROM 'false' OR
    v_pending->>'sourcePaymentId' IS DISTINCT FROM v_state.missing_source_id::text OR
    v_pending ? 'sourceAllocations' OR v_pending ? 'sourceReceiptReference'
 THEN RAISE EXCEPTION 'OFFICE_MISSING_SOURCE_WAS_FABRICATED'; END IF;
 IF public.payment_v1_office_guarded_pay_again_lineage(v_state.source_id) IS NOT NULL
 THEN RAISE EXCEPTION 'OFFICE_NON_REPEAT_WAS_MISIDENTIFIED'; END IF;
 RAISE NOTICE 'PASS WS3 Office guarded Pay Again: separate original/new parent, source and repeat allocation IDs, exact amount/AY, historic/new receipt and certificate references, pending mirror recovery, multiline BN/EN remarks and outsider denial';
END;
$officer$;
RESET ROLE;
ROLLBACK;
