-- Disposable cross-app correction review contract. No production data or
-- financial tables are used; every review fixture is rolled back.
BEGIN;

-- The PostgreSQL 17 workflow applies the prerequisite fixture, then the source migration, before this test.
CREATE TEMP TABLE correction_test_state(
  stage text PRIMARY KEY,message_id uuid NOT NULL,claim_token uuid
) ON COMMIT DROP;
GRANT SELECT,INSERT,UPDATE ON correction_test_state TO authenticated,service_role;

DO $ingest$
DECLARE v_event jsonb; v_result jsonb; v_payload jsonb;
BEGIN
  v_event := pg_catalog.jsonb_build_object(
    'schemaVersion','1.0.0','eventId','80000000-0000-4000-8000-000000000001',
    'requestId','80000000-0000-4000-8000-000000000002','origin','TAXPAY_SQL',
    'eventType','CORRECTION_SUBMITTED','revision',1,
    'occurredAt','2026-10-29T17:00:00.000Z','payload',pg_catalog.jsonb_build_object(
      'originalReference','SYN-CORR-0001','reason','Synthetic correction review test request',
      'requestedOutcome','Review the synthetic reference only',
      'evidenceState','PENDING_EVIDENCE','claimantVerified',false,
      'originalReceiptVerified',false,'mayChangeFinancialRecords',false,
      'changeKind','CIRCLE','oldValue','Circle A','newValue','Circle B',
      'createdAt','2026-10-29T17:00:00.000Z'));
  v_result := public.payment_v1_internal_ingest_correction(v_event);
  IF v_result->>'stored'<>'true' OR v_result->>'duplicate'<>'false' THEN
    RAISE EXCEPTION 'Correction intake was not stored';
  END IF;
  v_result := public.payment_v1_internal_ingest_correction(v_event);
  IF v_result->>'duplicate'<>'true' THEN RAISE EXCEPTION 'Correction intake replay was not idempotent'; END IF;
  SELECT inquiry_payload INTO v_payload FROM payment_sync.correction_mirrors
    WHERE inquiry_id='80000000-0000-4000-8000-000000000002';
  IF v_payload IS NULL OR v_payload ? 'requesterUid' OR v_payload ? 'requester_uid'
     OR v_payload ? 'taxpayerTin' OR v_payload ? 'tin' THEN
    RAISE EXCEPTION 'Office correction mirror is missing or over-scoped';
  END IF;
  IF has_table_privilege('authenticated','payment_sync.correction_mirrors','SELECT')
     OR has_function_privilege('anon',
       'public.payment_v1_correction_queue(integer)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'Private correction mirror or officer RPC grants are too broad';
  END IF;
END;
$ingest$;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000011',true);
DO $maker$
DECLARE v_queue jsonb; v_action jsonb; v_repeat jsonb;
BEGIN
  v_queue := public.payment_v1_correction_queue(200);
  IF v_queue->>'role'<>'MAKER' OR
     v_queue->'items'->0->'availableActions'<>'["MAKER_ACKNOWLEDGE"]'::jsonb THEN
    RAISE EXCEPTION 'Maker did not receive only the maker-stage action';
  END IF;
  v_action := public.payment_v1_correction_officer_action(
    '80000000-0000-4000-8000-000000000002','MAKER_ACKNOWLEDGE',
    'Synthetic maker acknowledgment for correction review test',
    '80000000-0000-4000-8000-000000000021');
  v_repeat := public.payment_v1_correction_officer_action(
    '80000000-0000-4000-8000-000000000002','MAKER_ACKNOWLEDGE',
    'Synthetic maker acknowledgment for correction review test',
    '80000000-0000-4000-8000-000000000021');
  IF v_action->>'queued'<>'true' OR v_repeat->>'replayed'<>'true'
     OR v_action->>'messageId' IS DISTINCT FROM v_repeat->>'messageId' THEN
    RAISE EXCEPTION 'Maker decision persistence or idempotent replay failed';
  END IF;
  INSERT INTO correction_test_state(stage,message_id)
    VALUES('MAKER', (v_action->>'messageId')::uuid);
END;
$maker$;

SELECT pg_catalog.set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000012',true);
DO $pending$
DECLARE v_queue jsonb;
BEGIN
  v_queue := public.payment_v1_correction_queue(200);
  IF v_queue->'items'->0->>'pendingDelivery'<>'true'
     OR v_queue->'items'->0->'availableActions'<>'[]'::jsonb THEN
    RAISE EXCEPTION 'Office exposed another review stage before TaxPay confirmation';
  END IF;
END;
$pending$;

RESET ROLE;
UPDATE correction_test_state SET claim_token='80000000-0000-4000-8000-000000000031' WHERE stage='MAKER';
UPDATE payment_sync.control_outbox o SET claim_token=s.claim_token,delivery_state='IN_FLIGHT',attempts=attempts+1
  FROM correction_test_state s WHERE s.stage='MAKER' AND o.message_id=s.message_id;
SET LOCAL ROLE service_role;
SELECT public.payment_v1_internal_ack_correction_command(
  (SELECT message_id FROM correction_test_state WHERE stage='MAKER'),
  (SELECT claim_token FROM correction_test_state WHERE stage='MAKER'),true,
  'MAKER_ACKNOWLEDGED',NULL);

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000012',true);
DO $reviewer$
DECLARE v_queue jsonb; v_action jsonb;
BEGIN
  v_queue := public.payment_v1_correction_queue(200);
  IF v_queue->>'role'<>'REVIEWER' OR
     v_queue->'items'->0->'availableActions'<>'["REVIEWER_VERIFY","REJECT"]'::jsonb THEN
    RAISE EXCEPTION 'Reviewer queue did not reflect the confirmed Maker state';
  END IF;
  v_action := public.payment_v1_correction_officer_action(
    '80000000-0000-4000-8000-000000000002','REVIEWER_VERIFY',
    'Synthetic reviewer verification for correction review test',
    '80000000-0000-4000-8000-000000000022');
  INSERT INTO correction_test_state(stage,message_id)
    VALUES('REVIEWER',(v_action->>'messageId')::uuid);
END;
$reviewer$;

RESET ROLE;
UPDATE correction_test_state SET claim_token='80000000-0000-4000-8000-000000000032' WHERE stage='REVIEWER';
UPDATE payment_sync.control_outbox o SET claim_token=s.claim_token,delivery_state='IN_FLIGHT',attempts=attempts+1
  FROM correction_test_state s WHERE s.stage='REVIEWER' AND o.message_id=s.message_id;
SET LOCAL ROLE service_role;
SELECT public.payment_v1_internal_ack_correction_command(
  (SELECT message_id FROM correction_test_state WHERE stage='REVIEWER'),
  (SELECT claim_token FROM correction_test_state WHERE stage='REVIEWER'),true,
  'REVIEWER_VERIFIED',NULL);

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000013',true);
DO $approver$
DECLARE v_queue jsonb; v_action jsonb;
BEGIN
  v_queue := public.payment_v1_correction_queue(200);
  IF v_queue->>'role'<>'APPROVER' OR
     v_queue->'items'->0->'availableActions'<>'["APPROVER_CLOSE","REJECT"]'::jsonb THEN
    RAISE EXCEPTION 'Approver queue did not reflect the confirmed Reviewer state';
  END IF;
  v_action := public.payment_v1_correction_officer_action(
    '80000000-0000-4000-8000-000000000002','APPROVER_CLOSE',
    'Synthetic approver closure for correction review test',
    '80000000-0000-4000-8000-000000000023');
  INSERT INTO correction_test_state(stage,message_id)
    VALUES('APPROVER',(v_action->>'messageId')::uuid);
END;
$approver$;

RESET ROLE;
UPDATE correction_test_state SET claim_token='80000000-0000-4000-8000-000000000033' WHERE stage='APPROVER';
UPDATE payment_sync.control_outbox o SET claim_token=s.claim_token,delivery_state='IN_FLIGHT',attempts=attempts+1
  FROM correction_test_state s WHERE s.stage='APPROVER' AND o.message_id=s.message_id;
SET LOCAL ROLE service_role;
SELECT public.payment_v1_internal_ack_correction_command(
  (SELECT message_id FROM correction_test_state WHERE stage='APPROVER'),
  (SELECT claim_token FROM correction_test_state WHERE stage='APPROVER'),true,
  'APPROVER_CLOSED',NULL);

RESET ROLE;
DO $final$
DECLARE v_state text; v_revision integer; v_count integer;
BEGIN
  SELECT review_state,review_revision INTO v_state,v_revision
    FROM payment_sync.correction_mirrors
    WHERE inquiry_id='80000000-0000-4000-8000-000000000002';
  SELECT count(*) INTO v_count FROM payment_sync.officer_decisions
    WHERE request_id='80000000-0000-4000-8000-000000000002';
  IF v_state IS DISTINCT FROM 'APPROVER_CLOSED' OR v_revision<>4 OR v_count<>3 THEN
    RAISE EXCEPTION 'Office decision/readback state or revision sequence failed';
  END IF;
END;
$final$;
ROLLBACK;
