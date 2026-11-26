-- Loopback fixture only. No actual login or production user/record modifications.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at,is_anonymous)
VALUES('a05f8fc6-a134-4a43-9b94-54881d858783'::uuid,'shihabshajib01@gmail.com',now(),false);
INSERT INTO payment_sync.correction_mirrors(inquiry_id,source_event_id,payload_fingerprint,source_revision,inquiry_payload)
VALUES
 ('90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000011',md5('direct-approve'),1,
  '{"originalReference":"SYN-APPROVE","reason":"Test correction","requestedOutcome":"Correct the assessment year","caseKind":"CORRECTION_REVIEW"}'),
 ('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000012',md5('direct-reject'),1,
  '{"originalReference":"SYN-REJECT","reason":"Test correction","requestedOutcome":"Correct the assessment year","caseKind":"CORRECTION_REVIEW"}');
INSERT INTO demo_payment.story_payments(id,session_id,service_code,amount_minor,data,status,created_at)
VALUES('90000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000013','OTHER_TAX_PAYMENT',700,
 '{"origin":"TAXPAY_UI","details":{"receiptReference":"SYN-DIRECT-003","taxpayerTin":"111111111111"}}','SIMULATED_SUCCESS',now());
CREATE TEMP TABLE immutable_direct_payment AS SELECT * FROM demo_payment.story_payments;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000011',true);
DO $deny$
BEGIN
 BEGIN
  PERFORM public.payment_v1_correction_queue_page(20,NULL,NULL);
  RAISE EXCEPTION 'Legacy account unexpectedly gained access';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.payment_v1_correction_officer_action('90000000-0000-4000-8000-000000000001','APPROVE','Valid reason','90000000-0000-4000-8000-000000000021');
  RAISE EXCEPTION 'Legacy account unexpectedly approved';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$deny$;
SELECT set_config('request.jwt.claim.sub','a05f8fc6-a134-4a43-9b94-54881d858783',true);
DO $direct$
DECLARE q jsonb; a jsonb; b jsonb; c jsonb; h jsonb;
BEGIN
 q:=public.payment_v1_correction_queue_page(20,NULL,NULL);
 IF q->>'role' IS DISTINCT FROM 'SUPER_ADMIN' OR jsonb_array_length(q->'items')<>2 OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(q->'items') i WHERE i->>'reviewState' IS DISTINCT FROM 'PENDING' OR i->'availableActions' IS DISTINCT FROM '["APPROVE","REJECT"]'::jsonb
 ) THEN RAISE EXCEPTION 'Direct-admin queue mismatch'; END IF;
 a:=public.payment_v1_correction_officer_action('90000000-0000-4000-8000-000000000001','APPROVE','Valid reason','90000000-0000-4000-8000-000000000021');
 b:=public.payment_v1_correction_officer_action('90000000-0000-4000-8000-000000000001','APPROVE','Valid reason','90000000-0000-4000-8000-000000000021');
 IF a->>'queued' IS DISTINCT FROM 'true' OR b->>'replayed' IS DISTINCT FROM 'true' OR a->>'messageId' IS DISTINCT FROM b->>'messageId' THEN RAISE EXCEPTION 'Direct decision replay mismatch'; END IF;
 c:=public.payment_v1_correction_officer_action('90000000-0000-4000-8000-000000000002','REJECT','Valid rejection','90000000-0000-4000-8000-000000000022');
 IF c->>'queued' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Direct rejection not queued'; END IF;
 BEGIN
  PERFORM public.payment_v1_correction_officer_action('90000000-0000-4000-8000-000000000001','MAKER_ACKNOWLEDGE','Valid reason','90000000-0000-4000-8000-000000000023');
  RAISE EXCEPTION 'Legacy action unexpectedly accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'Unsupported correction review action' THEN RAISE; END IF;
 END;
 c:=public.payment_v1_office_initiate_correction('90000000-0000-4000-8000-000000000003','111111111111','SYN-DIRECT-003','Valid correction reason','Correct assessment year','Verified evidence note','90000000-0000-4000-8000-000000000024');
 IF c->>'queued' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Direct initiation not queued'; END IF;
 h:=public.payment_v1_office_initiated_correction_history(20);
 IF h->>'role' IS DISTINCT FROM 'SUPER_ADMIN' OR jsonb_array_length(h->'items')<>1 OR h->'items'->0->>'officerRole' IS DISTINCT FROM 'SUPER_ADMIN' THEN RAISE EXCEPTION 'Direct initiation history mismatch'; END IF;
END;
$direct$;
RESET ROLE;
DO $verify$
DECLARE m record; token uuid; expected text;
BEGIN
 IF (SELECT count(*) FROM payment_sync.officer_decisions)<>2 OR
 EXISTS(SELECT 1 FROM payment_sync.officer_decisions WHERE officer_role<>'SUPER_ADMIN' OR action_code NOT IN ('APPROVE','REJECT')) THEN RAISE EXCEPTION 'Unexpected decision or actor'; END IF;
 IF EXISTS (SELECT 1 FROM payment_sync.correction_mirrors WHERE review_state<>'PENDING_OFFICER') THEN RAISE EXCEPTION 'Decision displayed as final before source ACK'; END IF;
 FOR m IN SELECT * FROM payment_sync.control_outbox WHERE payload->>'commandType'='CORRECTION_REVIEW' LOOP
  token:=gen_random_uuid();
  UPDATE payment_sync.control_outbox SET delivery_state='IN_FLIGHT',claim_token=token WHERE message_id=m.message_id;
  expected:=CASE m.payload->>'action' WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END;
  BEGIN
   PERFORM public.payment_v1_internal_ack_correction_command(m.message_id,token,true,'REVIEWER_VERIFIED',NULL);
   RAISE EXCEPTION 'Incorrect source ACK accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM 'TaxPay returned an unexpected correction state' THEN RAISE; END IF;
  END;
  PERFORM public.payment_v1_internal_ack_correction_command(m.message_id,token,true,expected,NULL);
 END LOOP;
 IF (SELECT review_state FROM payment_sync.correction_mirrors WHERE inquiry_id='90000000-0000-4000-8000-000000000001') IS DISTINCT FROM 'APPROVED'
 OR (SELECT review_state FROM payment_sync.correction_mirrors WHERE inquiry_id='90000000-0000-4000-8000-000000000002') IS DISTINCT FROM 'REJECTED' THEN RAISE EXCEPTION 'Direct ACK state mismatch'; END IF;
 IF EXISTS((SELECT * FROM demo_payment.story_payments EXCEPT SELECT * FROM immutable_direct_payment) UNION ALL (SELECT * FROM immutable_direct_payment EXCEPT SELECT * FROM demo_payment.story_payments)) THEN RAISE EXCEPTION 'Original payment mutated'; END IF;
 IF has_function_privilege('anon','public.payment_v1_correction_officer_action(uuid,text,text,uuid)','execute') OR has_function_privilege('authenticated','public.payment_v1_internal_ack_correction_command(uuid,uuid,boolean,text,text)','execute') THEN RAISE EXCEPTION 'ACL regression'; END IF;
END;
$verify$;
ROLLBACK;
