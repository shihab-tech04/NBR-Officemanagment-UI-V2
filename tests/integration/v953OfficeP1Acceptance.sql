-- F-177/US-180 & F-178/US-181: real PostgreSQL 17 integration assertions.
-- All records are invented disposable fixtures and are rolled back.
BEGIN;
INSERT INTO demo_payment.story_payments
  (id,service_code,amount_minor,status,created_at,data)
VALUES (
 '91000000-0000-4000-8000-000000000001',
 'OTHER_TAX_PAYMENT',222,'SIMULATED_SUCCESS','2026-11-15T12:00:00Z',
 jsonb_build_object('origin','TAXPAY_UI','details',jsonb_build_object(
  'taxpayerTin','111111111111','assessmentYear','2026-27',
  'receiptReference','DISPOSABLE-ONLY-001',
  'challanRemarks','বাংলা মন্তব্য ৩০ অক্ষরের বেশি। English note over twenty characters.'||
                   chr(10)||'Next line preserved.',
  'allocations',jsonb_build_array(jsonb_build_object(
    'taxpayerTin','111111111111','allocationId','safe-test-allocation',
    'assessmentYear','2026-27','amountMinor','222','dhara','175'))))
);
INSERT INTO office_ledger_private.source_events
  (source_system,source_record_id,taxpayer_tin,dhara,payment_source,
   amount_minor,assessment_year,event_date,original_reference,entry_kind)
SELECT s,'DISPOSABLE-'||s,'111111111111','175','Disposable '||s,
       100,'2026-27','2026-11-15T12:00:00Z','DISPOSABLE-'||s,'DEDUCTION'
FROM unnest(ARRAY[
 'BRTA','E_TDS','IBAS_PLUS_PLUS','NSD',
 'SUB_REGISTRAR_OFFICE','BANK','SA_CODER']) AS t(s);
INSERT INTO office_ledger_private.source_events
  (source_system,source_record_id,source_revision,taxpayer_tin,dhara,payment_source,
   amount_minor,assessment_year,event_date,original_reference,entry_kind)
VALUES ('BRTA','DISPOSABLE-BRTA',2,'111111111111','177',
        'Disposable corrected BRTA',175,'2026-27','2026-11-15T12:01:00Z',
        'DISPOSABLE-UPDATED-BRTA','DEDUCTION');
INSERT INTO office_ledger_private.source_events
  (source_system,source_record_id,taxpayer_tin,dhara,payment_source,
   amount_minor,assessment_year,event_date,original_reference,entry_kind,
   verification_status,evidence_sha256,canonical_credit_ref,canonical_credit_line_id,
   reconciliation_provenance)
VALUES ('BANK','DISPOSABLE-VERIFIED-CREDIT','111111111111','175',
        'Disposable Bank',900,'2026-27','2026-11-15T12:02:00Z',
        'DISPOSABLE-VERIFIED-BANK','CREDIT','VERIFIED',
        repeat('a',64),'DISPOSABLE-TREASURY-001','DISPOSABLE-LINE-001',
        '{"officialSourceRecordId":"DISPOSABLE-BANK-CREDIT","verifiedAt":"2026-11-15T12:02:00Z"}'::jsonb);
INSERT INTO payment_sync.officer_roles(user_uid,role,active)
VALUES ('91000000-0000-4000-8000-000000000002','REVIEWER',true);

DO $v953_acceptance$
DECLARE
 v_rows jsonb; v_mine jsonb; v_empty jsonb; v_remarks jsonb;
 v_original text;
 v_denied boolean:=false;
 v_seen integer;
BEGIN
 -- T01: authorized officer, seven distinct sources, immutable original payment
 -- and correct currency units; no fabricated credit from either payment/deduction.
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',
    '91000000-0000-4000-8000-000000000002',true);
 v_rows:=public.payment_v1_office_guarded_taxpayer_ledger('111111111111',100,0);
 IF jsonb_array_length(v_rows->'items')<>9 THEN
   RAISE EXCEPTION 'F177_T01_SOURCE_AND_PARENT_ROW_COUNT';
 END IF;
 SELECT count(DISTINCT item->>'sourceSystem') INTO v_seen
 FROM jsonb_array_elements(v_rows->'items') AS t(item)
 WHERE item->>'sourceSystem'<>'SOHOJKOR';
 IF v_seen<>7 THEN RAISE EXCEPTION 'F177_T01_SEVEN_SOURCES_REQUIRED'; END IF;
 IF v_rows->>'verifiedExternalCreditMinor'<>'900' OR
    v_rows->>'mirroredSohojkorCreditVerified'<>'false'
 THEN RAISE EXCEPTION 'F177_T01_CREDIT_MUST_BE_SOURCE_VERIFIED_ONLY'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM jsonb_array_elements(v_rows->'items') t(item)
   WHERE item->>'sourceSystem'='BRTA' AND item->>'sourceRevision'='2'
     AND item->>'dhara'='177' AND item->>'amountMinor'='175'
 ) THEN RAISE EXCEPTION 'F177_T01_LATEST_REVISION_MISSING'; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM jsonb_array_elements(v_rows->'items') t(item)
   WHERE item->>'sourceSystem'='SOHOJKOR'
     AND item->>'sourceRecordId'='91000000-0000-4000-8000-000000000001'
     AND item->>'sourceAllocationId'='safe-test-allocation'
     AND item->>'amountMinor'='222' AND item->>'financialStatus'='UNVERIFIED'
 ) THEN RAISE EXCEPTION 'F177_T04_ORIGINAL_ALLOCATION_PARITY'; END IF;
 v_empty:=public.payment_v1_office_guarded_taxpayer_ledger('222222222222',100,0);
 IF jsonb_array_length(v_empty->'items')<>0 OR
    v_empty->>'verifiedExternalCreditMinor'<>'0'
 THEN RAISE EXCEPTION 'F177_T02_CROSS_TIN_LEAK'; END IF;

 -- T02: anonymous and an unrelated authenticated identity cannot use
 -- either guarded RPC, even if the prototype UI shows an Office route.
 IF has_function_privilege('anon',
  'public.payment_v1_office_guarded_taxpayer_ledger(text,integer,integer)',
  'EXECUTE') OR has_function_privilege('anon',
  'public.payment_v1_office_guarded_challan_remarks(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'F177_F178_ANON_EXECUTE'; END IF;
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',
    '91000000-0000-4000-8000-000000000003',true);
 BEGIN
   PERFORM public.payment_v1_office_guarded_taxpayer_ledger('111111111111');
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'F177_T02_OFFICER_AUTH_BYPASS'; END IF;
 v_denied:=false;
 BEGIN
   PERFORM public.payment_v1_office_guarded_challan_remarks(
       '91000000-0000-4000-8000-000000000001');
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'F178_T02_OFFICER_AUTH_BYPASS'; END IF;

 -- F-178 T01/T04: over-20-char mixed EN/BN Unicode and embedded newline
 -- remain byte-for-byte identical in the Office source mirror readback.
 PERFORM pg_catalog.set_config('request.jwt.claim.sub',
    '91000000-0000-4000-8000-000000000002',true);
 SELECT data#>>'{details,challanRemarks}' INTO v_original
 FROM demo_payment.story_payments
 WHERE id='91000000-0000-4000-8000-000000000001';
 v_remarks:=public.payment_v1_office_guarded_challan_remarks(
   '91000000-0000-4000-8000-000000000001');
 IF char_length(v_original)<=20 OR position(chr(10) IN v_original)=0
    OR v_remarks->>'challanRemarks' IS DISTINCT FROM v_original
    OR v_remarks->>'receiptReference' IS DISTINCT FROM 'DISPOSABLE-ONLY-001'
 THEN RAISE EXCEPTION 'F178_T01_T04_UNICODE_MULTILINE_ROUNDTRIP'; END IF;

 -- T03: source revisions are append-only and duplicate replay is rejected.
 BEGIN
   UPDATE office_ledger_private.source_events SET amount_minor=987
   WHERE source_system='BRTA' AND source_record_id='DISPOSABLE-BRTA'
     AND source_revision=2;
   RAISE EXCEPTION 'F177_T03_UNEXPECTED_MUTATION';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='F177_T03_UNEXPECTED_MUTATION' THEN RAISE; END IF;
   IF SQLERRM<>'EXTERNAL_LEDGER_EVENT_IMMUTABLE' THEN RAISE; END IF;
 END;
 BEGIN
   INSERT INTO office_ledger_private.source_events
     (source_system,source_record_id,source_revision,taxpayer_tin,
      payment_source,amount_minor,event_date,entry_kind)
   VALUES ('BRTA','DISPOSABLE-BRTA',2,'111111111111','Duplicate',9,
           now(),'DEDUCTION');
   RAISE EXCEPTION 'F177_T03_UNEXPECTED_DUPLICATE_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 -- T02: invalid verified credit cannot be created with source assertion alone.
 BEGIN
   INSERT INTO office_ledger_private.source_events
     (source_system,source_record_id,taxpayer_tin,payment_source,
      amount_minor,event_date,entry_kind,verification_status)
   VALUES ('BANK','FORGED-UNVERIFIED','111111111111','Forged',999,
           now(),'CREDIT','VERIFIED');
   RAISE EXCEPTION 'F177_T02_UNEXPECTED_UNPROVEN_CREDIT';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 -- Verified ledger entries require an attributable Dhara; missing mappings
 -- stay pending/unverified instead of being promoted into official credits.
 BEGIN
   INSERT INTO office_ledger_private.source_events
     (source_system,source_record_id,taxpayer_tin,dhara,payment_source,
      amount_minor,event_date,entry_kind,verification_status,
      evidence_sha256,reconciliation_provenance)
   VALUES ('E_TDS','MISSING-DHARA','111111111111',NULL,'e-TDS',
           200,now(),'DEPOSIT','VERIFIED',repeat('b',64),
           '{"officialSourceRecordId":"MISSING-DHARA","verifiedAt":"2026-11-15T12:00:00Z"}'::jsonb);
   RAISE EXCEPTION 'F177_T02_UNEXPECTED_MISSING_DHARA_VERIFIED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 -- A blank provenance source label is not an attributable tax payment source.
 BEGIN
   INSERT INTO office_ledger_private.source_events
     (source_system,source_record_id,taxpayer_tin,payment_source,
      amount_minor,event_date,entry_kind)
   VALUES ('NSD','BLANK-PAYMENT-SOURCE','111111111111','   ',
           1,now(),'DEDUCTION');
   RAISE EXCEPTION 'F177_T02_UNEXPECTED_BLANK_SOURCE_ACCEPTED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 RAISE NOTICE 'F177_F178_DISPOSABLE_PG17_ACCEPTANCE_PASS';
END $v953_acceptance$;
ROLLBACK;
