-- Disposable PostgreSQL 17 contract for TaxPay-to-Office correction parent parity.
BEGIN;

DO $ingest_parent$
DECLARE
  v_event jsonb;
  v_result jsonb;
  v_parent uuid := '80000000-0000-4000-8000-000000000041';
  v_inquiry uuid := '80000000-0000-4000-8000-000000000002';
  v_stored uuid;
  v_kind text;
BEGIN
  v_event:=pg_catalog.jsonb_build_object(
    'schemaVersion','1.0.0','eventId','80000000-0000-4000-8000-000000000001',
    'requestId',v_inquiry,'origin','TAXPAY_SQL',
    'eventType','CORRECTION_SUBMITTED','revision',1,
    'occurredAt','2026-11-12T17:00:00.000Z',
    'payload',pg_catalog.jsonb_build_object(
      'originalReference','SYN-PARENT-0001',
      'originalPaymentId',v_parent,
      'originalPaymentKind','TAXPAY_STORY_PAYMENT',
      'reason','Synthetic parent-link correction test',
      'requestedOutcome','Review the linked synthetic payment',
      'evidenceState','PENDING_EVIDENCE','claimantVerified',false,
      'originalReceiptVerified',false,'mayChangeFinancialRecords',false,
      'changeKind',NULL,'oldValue',NULL,'newValue',NULL,
      'createdAt','2026-11-12T17:00:00.000Z'));
  v_result:=public.payment_v1_internal_ingest_correction(v_event);
  IF v_result->>'stored'<>'true' OR v_result->>'duplicate'<>'false' THEN
    RAISE EXCEPTION 'Parent-linked correction event was not stored';
  END IF;
  SELECT source_payment_id,source_payment_kind INTO v_stored,v_kind
    FROM payment_sync.correction_mirrors WHERE inquiry_id=v_inquiry;
  IF v_stored IS DISTINCT FROM v_parent OR v_kind IS DISTINCT FROM 'TAXPAY_STORY_PAYMENT' THEN
    RAISE EXCEPTION 'Office mirror did not preserve the source payment parent ID';
  END IF;

  BEGIN
    v_event:=pg_catalog.jsonb_set(v_event,'{eventId}','"80000000-0000-4000-8000-000000000003"');
    v_event:=pg_catalog.jsonb_set(v_event,'{requestId}','"80000000-0000-4000-8000-000000000004"');
    v_event:=pg_catalog.jsonb_set(v_event,'{payload,originalPaymentId}','"not-a-uuid"');
    PERFORM public.payment_v1_internal_ingest_correction(v_event);
    RAISE EXCEPTION 'TEST_UNEXPECTED_INVALID_PARENT_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='TEST_UNEXPECTED_INVALID_PARENT_ACCEPTED' THEN RAISE; END IF;
    IF SQLERRM IS DISTINCT FROM 'Invalid correction source payment parent' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM payment_sync.correction_mirrors
      WHERE inquiry_id='80000000-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'Malformed source parent created an Office correction mirror';
  END IF;
END;
$ingest_parent$;

DO $ingest_legacy$
DECLARE v_event jsonb; v_result jsonb; v_parent uuid; v_kind text;
BEGIN
  v_event:=pg_catalog.jsonb_build_object(
    'schemaVersion','1.0.0','eventId','80000000-0000-4000-8000-000000000005',
    'requestId','80000000-0000-4000-8000-000000000006','origin','TAXPAY_SQL',
    'eventType','CORRECTION_SUBMITTED','revision',1,
    'occurredAt','2026-11-12T17:01:00.000Z',
    'payload',pg_catalog.jsonb_build_object(
      'originalReference','SYN-LEGACY-0001',
      'reason','Synthetic legacy inquiry without a parent',
      'requestedOutcome','Keep old correction history readable',
      'evidenceState','PENDING_EVIDENCE','claimantVerified',false,
      'originalReceiptVerified',false,'mayChangeFinancialRecords',false,
      'changeKind',NULL,'oldValue',NULL,'newValue',NULL,
      'createdAt','2026-11-12T17:01:00.000Z'));
  v_result:=public.payment_v1_internal_ingest_correction(v_event);
  SELECT source_payment_id,source_payment_kind INTO v_parent,v_kind
    FROM payment_sync.correction_mirrors
    WHERE inquiry_id='80000000-0000-4000-8000-000000000006';
  IF v_result->>'stored'<>'true' OR v_parent IS NOT NULL OR v_kind IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy correction mirror was not preserved as unlinked history';
  END IF;
END;
$ingest_legacy$;

INSERT INTO payment_sync.control_outbox(
  message_id,request_id,target_origin,payload,delivery_state,attempts,acknowledged_at
) VALUES
  ('80000000-0000-4000-8000-000000000021','80000000-0000-4000-8000-000000000002',
   'TAXPAY_SQL','{"occurredAt":"2026-11-12T17:02:00Z"}','ACKNOWLEDGED',1,'2026-11-12T17:02:00Z'),
  ('80000000-0000-4000-8000-000000000022','80000000-0000-4000-8000-000000000002',
   'TAXPAY_SQL','{"occurredAt":"2026-11-12T17:03:00Z"}','ACKNOWLEDGED',1,'2026-11-12T17:03:00Z'),
  ('80000000-0000-4000-8000-000000000023','80000000-0000-4000-8000-000000000002',
   'TAXPAY_SQL','{"occurredAt":"2026-11-12T17:04:00Z"}','PENDING',1,NULL);
INSERT INTO payment_sync.officer_decisions(
  request_id,officer_uid,officer_role,action_code,reason,idempotency_key,message_id
) VALUES
  ('80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000011',
   'MAKER','MAKER_ACKNOWLEDGE','Synthetic accepted maker event',
   '80000000-0000-4000-8000-000000000031','80000000-0000-4000-8000-000000000021'),
  ('80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000012',
   'REVIEWER','REVIEWER_VERIFY','Synthetic accepted reviewer event',
   '80000000-0000-4000-8000-000000000032','80000000-0000-4000-8000-000000000022'),
  ('80000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000013',
   'APPROVER','APPROVER_CLOSE','Synthetic pending attempt',
   '80000000-0000-4000-8000-000000000033','80000000-0000-4000-8000-000000000023');
UPDATE payment_sync.correction_mirrors
SET review_state='REVIEWER_VERIFIED',review_revision=3,review_updated_at='2026-11-12T17:03:00Z',
    pending_message_id='80000000-0000-4000-8000-000000000023'
WHERE inquiry_id='80000000-0000-4000-8000-000000000002';
UPDATE payment_sync.correction_mirrors
SET received_at='2026-11-12T17:00:00Z'
WHERE inquiry_id IN (
  '80000000-0000-4000-8000-000000000002',
  '80000000-0000-4000-8000-000000000006'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000011',true);
DO $queue_parent$
DECLARE
  v_queue jsonb;
  v_item jsonb;
  v_page_one jsonb;
  v_page_two jsonb;
  v_cursor jsonb;
  v_request_id text;
BEGIN
  v_queue:=public.payment_v1_correction_queue(20);
  IF v_queue->>'role'<>'MAKER' OR jsonb_array_length(v_queue->'items')<>2 THEN
    RAISE EXCEPTION 'Authenticated Office queue did not return both correction mirrors';
  END IF;
  SELECT value INTO v_item
    FROM jsonb_array_elements(v_queue->'items') AS item(value)
    WHERE value->>'requestId'='80000000-0000-4000-8000-000000000002';
  IF v_item->>'sourcePaymentId'<>'80000000-0000-4000-8000-000000000041'
     OR v_item->>'sourcePaymentKind'<>'TAXPAY_STORY_PAYMENT' THEN
    RAISE EXCEPTION 'Office correction queue omitted the exact source payment parent';
  END IF;
  IF jsonb_array_length(v_item->'decisionHistory')<>2
     OR v_item->'decisionHistory'->0->>'action'<>'MAKER_ACKNOWLEDGE'
     OR v_item->'decisionHistory'->0->>'occurredAt'<>'2026-11-12T17:02:00Z'
     OR v_item->'decisionHistory'->1->>'action'<>'REVIEWER_VERIFY'
     OR v_item->'decisionHistory'->1->>'occurredAt'<>'2026-11-12T17:03:00Z'
     OR v_item->'decisionHistory'->1->>'deliveryState'<>'ACKNOWLEDGED' THEN
    RAISE EXCEPTION 'Office correction queue omitted ordered acknowledged decision history';
  END IF;
  IF v_item->>'pendingDelivery'<>'true' OR v_item->>'deliveryState'<>'PENDING' THEN
    RAISE EXCEPTION 'Correction queue did not preserve pending decision delivery state';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_item->'decisionHistory') AS h(value)
    WHERE h.value->>'action'='APPROVER_CLOSE'
  ) THEN
    RAISE EXCEPTION 'Unacknowledged correction decision leaked into verified history';
  END IF;
  SELECT value INTO v_item
    FROM jsonb_array_elements(v_queue->'items') AS item(value)
    WHERE value->>'requestId'='80000000-0000-4000-8000-000000000006';
  IF v_item->'sourcePaymentId'<>'null'::jsonb
     OR v_item->'sourcePaymentKind'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Legacy queue item was incorrectly assigned a payment parent';
  END IF;
  IF jsonb_array_length(v_item->'decisionHistory')<>0 THEN
    RAISE EXCEPTION 'Legacy correction unexpectedly inherited another case history';
  END IF;
  v_page_one:=public.payment_v1_correction_queue_page(1,NULL,NULL);
  IF v_page_one->>'role'<>'MAKER' OR jsonb_array_length(v_page_one->'items')<>1
     OR jsonb_typeof(v_page_one->'nextCursor')<>'object' THEN
    RAISE EXCEPTION 'Correction page one did not provide an authorized next cursor';
  END IF;
  SELECT value->>'requestId' INTO v_request_id
    FROM jsonb_array_elements(v_page_one->'items') AS item(value);
  IF v_request_id<>'80000000-0000-4000-8000-000000000006' THEN
    RAISE EXCEPTION 'Correction first-page UUID tiebreaker is not deterministic';
  END IF;
  v_cursor:=v_page_one->'nextCursor';
  v_page_two:=public.payment_v1_correction_queue_page(
    1,(v_cursor->>'receivedAt')::timestamptz,(v_cursor->>'requestId')::uuid);
  IF jsonb_array_length(v_page_two->'items')<>1 OR v_page_two->'nextCursor'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Correction page two overlapped or omitted the final page';
  END IF;
  SELECT value->>'requestId' INTO v_request_id
    FROM jsonb_array_elements(v_page_two->'items') AS item(value);
  IF v_request_id<>'80000000-0000-4000-8000-000000000002' THEN
    RAISE EXCEPTION 'Correction page two returned a duplicate or skipped case';
  END IF;
  SELECT value INTO v_item FROM jsonb_array_elements(v_page_two->'items') AS item(value);
  IF v_item->>'sourceEventId'<>'80000000-0000-4000-8000-000000000001'
     OR v_item->>'sourceEventType'<>'CORRECTION_SUBMITTED' THEN
    RAISE EXCEPTION 'Paged correction history lost the original Taxpayer SQL source event identity';
  END IF;
  IF jsonb_array_length(v_item->'decisionHistory')<>2
     OR v_item->'decisionHistory'->0->>'action'<>'MAKER_ACKNOWLEDGE'
     OR v_item->'decisionHistory'->1->>'action'<>'REVIEWER_VERIFY' THEN
    RAISE EXCEPTION 'Paged correction history lost acknowledged chronology';
  END IF;
  BEGIN
    PERFORM public.payment_v1_correction_queue_page(
      1,NULL,'80000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'TEST_UNEXPECTED_PARTIAL_CURSOR_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='TEST_UNEXPECTED_PARTIAL_CURSOR_ACCEPTED' THEN RAISE; END IF;
    IF SQLERRM IS DISTINCT FROM 'Invalid correction queue cursor' THEN RAISE; END IF;
  END;
END;
$queue_parent$;

ROLLBACK;
