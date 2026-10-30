-- Office intake and review for TaxPay's existing evidence-pending correction
-- inquiries. Review decisions travel over the existing signed command bridge.
-- This migration never changes a payment, receipt, challan, credit or ledger.
BEGIN;

CREATE SCHEMA IF NOT EXISTS payment_sync;
REVOKE ALL ON SCHEMA payment_sync FROM PUBLIC,anon,authenticated;

CREATE TABLE payment_sync.correction_mirrors (
  inquiry_id uuid PRIMARY KEY,
  source_event_id uuid NOT NULL UNIQUE,
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  source_revision integer NOT NULL CHECK (source_revision = 1),
  inquiry_payload jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(inquiry_payload)='object'),
  review_state text NOT NULL DEFAULT 'PENDING_OFFICER'
    CHECK (review_state IN ('PENDING_OFFICER','MAKER_ACKNOWLEDGED',
      'REVIEWER_VERIFIED','APPROVER_CLOSED','REJECTED')),
  review_revision integer NOT NULL DEFAULT 1 CHECK (review_revision >= 1),
  review_updated_at timestamptz NOT NULL DEFAULT now(),
  pending_message_id uuid,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX correction_mirrors_open_recent_idx
  ON payment_sync.correction_mirrors(review_state,received_at DESC);

CREATE TABLE payment_sync.correction_inbox (
  event_id uuid PRIMARY KEY,
  inquiry_id uuid NOT NULL,
  source_origin text NOT NULL CHECK (source_origin='TAXPAY_SQL'),
  payload_fingerprint text NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payment_sync.correction_mirrors ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_sync.correction_mirrors FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_sync.correction_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_sync.correction_inbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON payment_sync.correction_mirrors,payment_sync.correction_inbox
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.payment_v1_internal_ingest_correction(p_event jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_local text; v_event uuid; v_inquiry uuid; v_fingerprint text;
  v_payload jsonb; v_previous text; v_reference text; v_reason text;
  v_outcome text; v_kind text; v_old text; v_new text;
  v_inserted integer;
BEGIN
  SELECT origin INTO v_local FROM payment_sync.settings WHERE singleton;
  IF v_local IS DISTINCT FROM 'OFFICE_SQL' THEN
    RAISE EXCEPTION 'Office-only correction ingestion';
  END IF;
  IF p_event IS NULL OR pg_catalog.jsonb_typeof(p_event) IS DISTINCT FROM 'object'
     OR pg_catalog.octet_length(p_event::text)>350000
     OR p_event->>'schemaVersion' IS DISTINCT FROM '1.0.0'
     OR p_event->>'origin' IS DISTINCT FROM 'TAXPAY_SQL'
     OR p_event->>'eventType' IS DISTINCT FROM 'CORRECTION_SUBMITTED'
     OR pg_catalog.jsonb_typeof(p_event->'revision') IS DISTINCT FROM 'number'
     OR p_event->>'revision' IS DISTINCT FROM '1'
     OR pg_catalog.jsonb_typeof(p_event->'payload') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid TaxPay correction event';
  END IF;
  IF coalesce(p_event->>'eventId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR coalesce(p_event->>'requestId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR length(coalesce(p_event->>'occurredAt',''))<20 THEN
    RAISE EXCEPTION 'Invalid TaxPay correction identifiers';
  END IF;

  v_event := (p_event->>'eventId')::uuid;
  v_inquiry := (p_event->>'requestId')::uuid;
  v_payload := p_event->'payload';
  v_reference := v_payload->>'originalReference';
  v_reason := v_payload->>'reason';
  v_outcome := v_payload->>'requestedOutcome';
  v_kind := v_payload->>'changeKind';
  v_old := v_payload->>'oldValue';
  v_new := v_payload->>'newValue';
  IF v_reference IS NULL OR v_reference !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{5,79}$'
     OR v_reason IS NULL OR length(btrim(v_reason)) NOT BETWEEN 10 AND 1000
     OR v_outcome IS NULL OR length(btrim(v_outcome)) NOT BETWEEN 10 AND 600
     OR v_payload->>'evidenceState' IS DISTINCT FROM 'PENDING_EVIDENCE'
     OR v_payload->>'claimantVerified' IS DISTINCT FROM 'false'
     OR v_payload->>'originalReceiptVerified' IS DISTINCT FROM 'false'
     OR v_payload->>'mayChangeFinancialRecords' IS DISTINCT FROM 'false'
     OR v_payload ? 'requesterUid' OR v_payload ? 'requester_uid'
     OR v_payload ? 'taxpayerTin' OR v_payload ? 'tin' THEN
    RAISE EXCEPTION 'Invalid or over-scoped correction payload';
  END IF;
  IF v_kind IS NULL THEN
    IF v_old IS NOT NULL OR v_new IS NOT NULL THEN
      RAISE EXCEPTION 'Incomplete correction proposal';
    END IF;
  ELSIF v_kind NOT IN ('ASSESSMENT_YEAR','CIRCLE','PAYMENT_HEAD','ATTRIBUTION')
     OR v_old IS NULL OR v_new IS NULL
     OR length(btrim(v_old)) NOT BETWEEN 1 AND 120
     OR length(btrim(v_new)) NOT BETWEEN 1 AND 120
     OR lower(btrim(v_old))=lower(btrim(v_new)) THEN
    RAISE EXCEPTION 'Invalid correction proposal';
  END IF;
  IF coalesce(v_payload->>'createdAt','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T' THEN
    RAISE EXCEPTION 'Invalid correction created timestamp';
  END IF;

  v_fingerprint := pg_catalog.md5(p_event::text);
  INSERT INTO payment_sync.correction_inbox(event_id,inquiry_id,source_origin,payload_fingerprint)
  VALUES(v_event,v_inquiry,'TAXPAY_SQL',v_fingerprint)
  ON CONFLICT(event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted=0 THEN
    SELECT payload_fingerprint INTO v_previous FROM payment_sync.correction_inbox
      WHERE event_id=v_event;
    IF v_previous IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'Conflicting correction event replay';
    END IF;
    RETURN pg_catalog.jsonb_build_object('eventId',v_event,'requestId',v_inquiry,
      'stored',true,'duplicate',true);
  END IF;

  INSERT INTO payment_sync.correction_mirrors(
    inquiry_id,source_event_id,payload_fingerprint,source_revision,inquiry_payload)
  VALUES(v_inquiry,v_event,v_fingerprint,1,v_payload)
  ON CONFLICT(inquiry_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted=0 THEN
    RAISE EXCEPTION 'Correction inquiry already exists with a different source event';
  END IF;
  RETURN pg_catalog.jsonb_build_object('eventId',v_event,'requestId',v_inquiry,
    'stored',true,'duplicate',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.payment_v1_correction_queue(p_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_actor uuid := auth.uid(); v_role text; v_items jsonb;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated Office officer required'; END IF;
  SELECT r.role INTO v_role FROM payment_sync.officer_roles r
    WHERE r.user_uid=v_actor AND r.active AND r.role IN ('MAKER','REVIEWER','APPROVER');
  IF v_role IS NULL THEN RAISE EXCEPTION 'Active payment officer role required'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid page size'; END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(x.item ORDER BY x.received_at DESC),'[]'::jsonb)
    INTO v_items FROM (
      SELECT m.received_at,pg_catalog.jsonb_build_object(
        'requestId',m.inquiry_id,
        'originalReference',m.inquiry_payload->>'originalReference',
        'reason',m.inquiry_payload->>'reason',
        'requestedOutcome',m.inquiry_payload->>'requestedOutcome',
        'evidenceState',m.inquiry_payload->>'evidenceState',
        'changeKind',m.inquiry_payload->>'changeKind',
        'oldValue',m.inquiry_payload->>'oldValue',
        'newValue',m.inquiry_payload->>'newValue',
        'createdAt',m.inquiry_payload->>'createdAt',
        'reviewState',m.review_state,'reviewRevision',m.review_revision,
        'reviewUpdatedAt',m.review_updated_at,
        'pendingDelivery',(o.delivery_state IS NOT NULL AND o.delivery_state<>'ACKNOWLEDGED'),
        'deliveryState',o.delivery_state,'lastDeliveryError',o.last_error,
        'availableActions',CASE
          WHEN o.delivery_state IS NOT NULL AND o.delivery_state<>'ACKNOWLEDGED' THEN '[]'::jsonb
          WHEN m.review_state IN ('APPROVER_CLOSED','REJECTED') THEN '[]'::jsonb
          WHEN v_role='MAKER' AND m.review_state='PENDING_OFFICER'
            THEN '["MAKER_ACKNOWLEDGE"]'::jsonb
          WHEN v_role='REVIEWER' AND m.review_state='MAKER_ACKNOWLEDGED'
            THEN '["REVIEWER_VERIFY","REJECT"]'::jsonb
          WHEN v_role='APPROVER' AND m.review_state='REVIEWER_VERIFIED'
            THEN '["APPROVER_CLOSE","REJECT"]'::jsonb
          WHEN v_role IN ('REVIEWER','APPROVER')
            THEN '["REJECT"]'::jsonb
          ELSE '[]'::jsonb END
      ) AS item
      FROM payment_sync.correction_mirrors m
      LEFT JOIN payment_sync.control_outbox o ON o.message_id=m.pending_message_id
      ORDER BY m.received_at DESC LIMIT p_limit
    ) x;
  RETURN pg_catalog.jsonb_build_object('role',v_role,'items',v_items);
END;
$function$;

CREATE OR REPLACE FUNCTION public.payment_v1_correction_officer_action(
  p_request_id uuid,p_action text,p_reason text,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_actor uuid := auth.uid(); v_origin text; v_role text; v_reason text;
  v_mirror payment_sync.correction_mirrors%ROWTYPE;
  v_prior record;
  v_message uuid := gen_random_uuid(); v_expected text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated Office officer required'; END IF;
  IF p_request_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Correction and idempotency identifiers required';
  END IF;
  SELECT origin INTO v_origin FROM payment_sync.settings WHERE singleton;
  IF v_origin IS DISTINCT FROM 'OFFICE_SQL' THEN RAISE EXCEPTION 'Office-only correction review'; END IF;
  IF p_action IS NULL OR p_action NOT IN
    ('MAKER_ACKNOWLEDGE','REVIEWER_VERIFY','APPROVER_CLOSE','REJECT') THEN
    RAISE EXCEPTION 'Unsupported correction review action';
  END IF;
  SELECT r.role INTO v_role FROM payment_sync.officer_roles r
    WHERE r.user_uid=v_actor AND r.active AND (
      (p_action='MAKER_ACKNOWLEDGE' AND r.role='MAKER') OR
      (p_action='REVIEWER_VERIFY' AND r.role='REVIEWER') OR
      (p_action='APPROVER_CLOSE' AND r.role='APPROVER') OR
      (p_action='REJECT' AND r.role IN ('REVIEWER','APPROVER')));
  IF v_role IS NULL THEN RAISE EXCEPTION 'Officer role cannot perform this action'; END IF;
  v_reason := nullif(pg_catalog.btrim(p_reason),'');
  IF v_reason IS NULL OR length(v_reason) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'A review reason between 5 and 1000 characters is required';
  END IF;

  SELECT * INTO v_mirror FROM payment_sync.correction_mirrors
    WHERE inquiry_id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Synchronized correction inquiry not found'; END IF;
  SELECT * INTO v_prior FROM payment_sync.officer_decisions d
    WHERE d.request_id=p_request_id AND d.officer_uid=v_actor
      AND d.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_prior.action_code<>p_action OR v_prior.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION 'Idempotency key used for a different correction action';
    END IF;
    RETURN pg_catalog.jsonb_build_object('messageId',v_prior.message_id,
      'requestId',p_request_id,'queued',true,'replayed',true);
  END IF;
  IF v_mirror.pending_message_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM payment_sync.control_outbox o
    WHERE o.message_id=v_mirror.pending_message_id AND o.delivery_state<>'ACKNOWLEDGED') THEN
    RAISE EXCEPTION 'A correction decision is still awaiting TaxPay confirmation';
  END IF;
  IF v_mirror.review_state IN ('APPROVER_CLOSED','REJECTED') THEN
    RAISE EXCEPTION 'Correction review is already closed';
  END IF;
  v_expected := CASE p_action
    WHEN 'MAKER_ACKNOWLEDGE' THEN 'PENDING_OFFICER'
    WHEN 'REVIEWER_VERIFY' THEN 'MAKER_ACKNOWLEDGED'
    WHEN 'APPROVER_CLOSE' THEN 'REVIEWER_VERIFIED'
    ELSE v_mirror.review_state END;
  IF v_mirror.review_state IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Correction review sequence mismatch';
  END IF;
  IF p_action='REVIEWER_VERIFY' AND EXISTS (
      SELECT 1 FROM payment_sync.officer_decisions d
      WHERE d.request_id=p_request_id AND d.action_code='MAKER_ACKNOWLEDGE'
        AND d.officer_uid=v_actor) OR
     p_action='APPROVER_CLOSE' AND EXISTS (
      SELECT 1 FROM payment_sync.officer_decisions d
      WHERE d.request_id=p_request_id AND d.action_code IN ('MAKER_ACKNOWLEDGE','REVIEWER_VERIFY')
        AND d.officer_uid=v_actor) OR
     p_action='REJECT' AND EXISTS (
      SELECT 1 FROM payment_sync.officer_decisions d
      WHERE d.request_id=p_request_id AND d.officer_uid=v_actor) THEN
    RAISE EXCEPTION 'Correction review stages require separate officers';
  END IF;

  INSERT INTO payment_sync.control_outbox(message_id,request_id,target_origin,payload)
  VALUES(v_message,p_request_id,'TAXPAY_SQL',pg_catalog.jsonb_build_object(
    'schemaVersion','1.0.0','commandType','CORRECTION_REVIEW',
    'messageId',v_message,'requestId',p_request_id,'origin','OFFICE_SQL',
    'action',p_action,'officerUid',v_actor,'officerRole',v_role,'reason',v_reason,
    'idempotencyKey',p_idempotency_key,'expectedReviewState',v_expected,'occurredAt',now()));
  INSERT INTO payment_sync.officer_decisions(request_id,officer_uid,officer_role,
    action_code,reason,idempotency_key,message_id)
  VALUES(p_request_id,v_actor,v_role,p_action,v_reason,p_idempotency_key,v_message);
  UPDATE payment_sync.correction_mirrors SET pending_message_id=v_message
    WHERE inquiry_id=p_request_id;
  RETURN pg_catalog.jsonb_build_object('messageId',v_message,
    'requestId',p_request_id,'queued',true,'replayed',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.payment_v1_internal_ack_correction_command(
  p_message_id uuid,p_claim_token uuid,p_success boolean,p_review_state text,p_error text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_payload jsonb; v_request uuid; v_action text; v_expected text; v_updated uuid;
BEGIN
  IF p_success IS NULL THEN RAISE EXCEPTION 'Delivery result required'; END IF;
  UPDATE payment_sync.control_outbox SET
    delivery_state=CASE WHEN p_success THEN 'ACKNOWLEDGED' ELSE 'FAILED' END,
    acknowledged_at=CASE WHEN p_success THEN now() ELSE NULL END,
    last_error=CASE WHEN p_success THEN NULL ELSE left(coalesce(p_error,'Delivery failed'),500) END,
    next_attempt_at=CASE WHEN p_success THEN next_attempt_at
      ELSE now()+pg_catalog.make_interval(secs=>least(3600,5*(2^least(attempts,9))::integer)) END,
    claim_token=NULL
  WHERE message_id=p_message_id AND claim_token=p_claim_token AND delivery_state='IN_FLIGHT'
  RETURNING payload,request_id INTO v_payload,v_request;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Unknown or stale correction command claim'; END IF;
  IF coalesce(v_payload->>'commandType','')<>'CORRECTION_REVIEW' OR
     v_payload->>'requestId' IS DISTINCT FROM v_request::text THEN
    RAISE EXCEPTION 'Command is not a correction review';
  END IF;
  IF p_success THEN
    v_action := v_payload->>'action';
    v_expected := CASE v_action
      WHEN 'MAKER_ACKNOWLEDGE' THEN 'MAKER_ACKNOWLEDGED'
      WHEN 'REVIEWER_VERIFY' THEN 'REVIEWER_VERIFIED'
      WHEN 'APPROVER_CLOSE' THEN 'APPROVER_CLOSED'
      WHEN 'REJECT' THEN 'REJECTED' ELSE NULL END;
    IF v_expected IS NULL OR p_review_state IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'TaxPay returned an unexpected correction state';
    END IF;
    UPDATE payment_sync.correction_mirrors SET review_state=p_review_state,
      review_revision=review_revision+1,review_updated_at=now(),pending_message_id=NULL
    WHERE inquiry_id=v_request AND pending_message_id=p_message_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Correction mirror no longer matches pending command'; END IF;
  END IF;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.payment_v1_internal_ingest_correction(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.payment_v1_correction_queue(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.payment_v1_correction_officer_action(uuid,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.payment_v1_internal_ack_correction_command(uuid,uuid,boolean,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payment_v1_internal_ingest_correction(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_v1_correction_queue(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payment_v1_correction_officer_action(uuid,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payment_v1_internal_ack_correction_command(uuid,uuid,boolean,text,text) TO service_role;

COMMENT ON TABLE payment_sync.correction_mirrors IS
  'Office-side correction inquiry mirror with review status only; no financial mutation.';
COMMENT ON TABLE payment_sync.correction_inbox IS
  'Durable replay-protected receipt of TaxPay correction submission events.';
COMMIT;
