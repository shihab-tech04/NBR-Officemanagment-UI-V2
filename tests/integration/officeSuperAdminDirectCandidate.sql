-- DISPOSABLE CANDIDATE ONLY: not an ordered migration or hosted deployment.
-- Existing verified Office identity is reused, not a new role/account grant.
-- Paired Taxpayer receivers and actual applied-change projection MUST precede promotion.
BEGIN;
CREATE OR REPLACE FUNCTION payment_sync.is_existing_correction_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $admin$
 SELECT EXISTS (
   SELECT 1 FROM auth.users u
   WHERE u.id=auth.uid() AND u.id='a05f8fc6-a134-4a43-9b94-54881d858783'::uuid
     AND lower(u.email)=lower('shihabshajib01@gmail.com')
     AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
     AND NOT coalesce(u.is_anonymous,false)
     AND (u.banned_until IS NULL OR u.banned_until<=now())
 );
$admin$;
REVOKE ALL ON FUNCTION payment_sync.is_existing_correction_super_admin() FROM PUBLIC,anon,authenticated,service_role;
-- Preserve historical events and exact existing records. Direct new actions add no legacy stage.
ALTER TABLE payment_sync.correction_mirrors DROP CONSTRAINT correction_mirrors_review_state_check;
ALTER TABLE payment_sync.correction_mirrors ADD CONSTRAINT correction_mirrors_review_state_check CHECK
 (review_state IN ('PENDING_OFFICER','MAKER_ACKNOWLEDGED','REVIEWER_VERIFIED','APPROVER_CLOSED','APPROVED','REJECTED'));
ALTER TABLE payment_sync.officer_decisions DROP CONSTRAINT officer_decisions_officer_role_check;
ALTER TABLE payment_sync.officer_decisions ADD CONSTRAINT officer_decisions_officer_role_check CHECK
 (officer_role IN ('MAKER','REVIEWER','APPROVER','SUPER_ADMIN'));
ALTER TABLE payment_sync.officer_decisions DROP CONSTRAINT officer_decisions_action_code_check;
ALTER TABLE payment_sync.officer_decisions ADD CONSTRAINT officer_decisions_action_code_check CHECK
 (action_code IN ('MAKER_ACKNOWLEDGE','REVIEWER_VERIFY','APPROVER_CLOSE','APPROVE','REJECT'));
ALTER TABLE payment_sync.office_initiated_corrections DROP CONSTRAINT office_initiated_corrections_officer_role_check;
ALTER TABLE payment_sync.office_initiated_corrections ADD CONSTRAINT office_initiated_corrections_officer_role_check CHECK
 (officer_role IN ('MAKER','APPROVER','SUPER_ADMIN'));

CREATE OR REPLACE FUNCTION public.payment_v1_correction_queue(p_limit integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE v_actor uuid := auth.uid(); v_role text; v_items jsonb;
BEGIN
  IF NOT payment_sync.is_existing_correction_super_admin() THEN RAISE EXCEPTION 'Verified Office Super Admin required' USING ERRCODE='42501'; END IF;
  v_role := 'SUPER_ADMIN';
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid page size'; END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(x.item ORDER BY x.received_at DESC),'[]'::jsonb)
    INTO v_items FROM (
      SELECT m.received_at,pg_catalog.jsonb_build_object(
        'requestId',m.inquiry_id,
        'sourceEventId',m.source_event_id,
        'sourceEventType','CORRECTION_SUBMITTED',
        'originalReference',m.inquiry_payload->>'originalReference',
        'caseKind',coalesce(m.inquiry_payload->>'caseKind','CORRECTION_REVIEW'),
        'sourcePaymentId',m.source_payment_id,
        'sourcePaymentKind',m.source_payment_kind,
        'targetAllocationId',m.target_allocation_id,
        'reason',m.inquiry_payload->>'reason',
        'evidenceNote',m.inquiry_payload->>'evidenceNote',
        'requestedOutcome',m.inquiry_payload->>'requestedOutcome',
        'evidenceState',m.inquiry_payload->>'evidenceState',
        'changeKind',m.inquiry_payload->>'changeKind',
        'oldValue',m.inquiry_payload->>'oldValue',
        'newValue',m.inquiry_payload->>'newValue',
        'createdAt',m.inquiry_payload->>'createdAt',
        'reviewState',CASE WHEN m.review_state IN ('PENDING_OFFICER','MAKER_ACKNOWLEDGED','REVIEWER_VERIFIED') THEN 'PENDING' ELSE m.review_state END,'reviewRevision',m.review_revision,
        'reviewUpdatedAt',m.review_updated_at,
        'decisionHistory',coalesce((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'messageId',d.message_id,
            'action',d.action_code,
            'role',d.officer_role,
            'officerUid',d.officer_uid,
            'reason',d.reason,
            'occurredAt',nullif(o_decision.payload->>'occurredAt',''),
            'deliveryState',o_decision.delivery_state
          ) ORDER BY nullif(o_decision.payload->>'occurredAt','')::timestamptz NULLS LAST,d.message_id)
          FROM payment_sync.officer_decisions d
          JOIN payment_sync.control_outbox o_decision ON o_decision.message_id=d.message_id
          WHERE d.request_id=m.inquiry_id AND o_decision.delivery_state='ACKNOWLEDGED'
        ),'[]'::jsonb),
        'pendingDelivery',(o.delivery_state IS NOT NULL AND o.delivery_state<>'ACKNOWLEDGED'),
        'deliveryState',o.delivery_state,'lastDeliveryError',o.last_error,
        'availableActions',CASE
          WHEN o.delivery_state IS NOT NULL AND o.delivery_state<>'ACKNOWLEDGED' THEN '[]'::jsonb
          WHEN m.review_state IN ('APPROVED','APPROVER_CLOSED','REJECTED') THEN '[]'::jsonb
        WHEN m.review_state IN ('PENDING_OFFICER','MAKER_ACKNOWLEDGED','REVIEWER_VERIFIED') THEN '["APPROVE","REJECT"]'::jsonb
        ELSE '[]'::jsonb END
      ) AS item
      FROM payment_sync.correction_mirrors m
      LEFT JOIN payment_sync.control_outbox o ON o.message_id=m.pending_message_id
      ORDER BY m.received_at DESC LIMIT p_limit
    ) x;
  RETURN pg_catalog.jsonb_build_object('role',v_role,'items',v_items);
END;
$function$;
CREATE OR REPLACE FUNCTION public.payment_v1_correction_queue_page(
  p_limit integer DEFAULT 100,
  p_after_received_at timestamptz DEFAULT NULL,
  p_after_request_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
  v_items jsonb;
  v_has_more boolean;
  v_last_received_at timestamptz;
  v_last_request_id uuid;
  v_next_cursor jsonb;
BEGIN
  IF NOT payment_sync.is_existing_correction_super_admin() THEN RAISE EXCEPTION 'Verified Office Super Admin required' USING ERRCODE='42501'; END IF;
  v_role := 'SUPER_ADMIN';
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid page size'; END IF;
  IF (p_after_received_at IS NULL) <> (p_after_request_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid correction queue cursor';
  END IF;

  SELECT count(*)>p_limit INTO v_has_more
  FROM (
    SELECT 1
    FROM payment_sync.correction_mirrors m
    WHERE p_after_received_at IS NULL
       OR (m.received_at,m.inquiry_id)<(p_after_received_at,p_after_request_id)
    ORDER BY m.received_at DESC,m.inquiry_id DESC
    LIMIT p_limit+1
  ) candidates;

  WITH page_rows AS (
    SELECT m.inquiry_id,m.received_at,m.inquiry_payload,m.source_event_id,m.source_payment_id,
      m.source_payment_kind,m.target_allocation_id,m.review_state,m.review_revision,m.review_updated_at,
      m.pending_message_id,o.delivery_state,o.last_error
    FROM payment_sync.correction_mirrors m
    LEFT JOIN payment_sync.control_outbox o ON o.message_id=m.pending_message_id
    WHERE p_after_received_at IS NULL
       OR (m.received_at,m.inquiry_id)<(p_after_received_at,p_after_request_id)
    ORDER BY m.received_at DESC,m.inquiry_id DESC
    LIMIT p_limit
  ),
  page_items AS (
    SELECT r.received_at,r.inquiry_id,pg_catalog.jsonb_build_object(
      'requestId',r.inquiry_id,
      'sourceEventId',r.source_event_id,
      'sourceEventType','CORRECTION_SUBMITTED',
      'originalReference',r.inquiry_payload->>'originalReference',
      'caseKind',coalesce(r.inquiry_payload->>'caseKind','CORRECTION_REVIEW'),
      'sourcePaymentId',r.source_payment_id,
      'sourcePaymentKind',r.source_payment_kind,
      'targetAllocationId',r.target_allocation_id,
      'reason',r.inquiry_payload->>'reason',
        'evidenceNote',r.inquiry_payload->>'evidenceNote',
      'requestedOutcome',r.inquiry_payload->>'requestedOutcome',
      'evidenceState',r.inquiry_payload->>'evidenceState',
      'changeKind',r.inquiry_payload->>'changeKind',
      'oldValue',r.inquiry_payload->>'oldValue',
      'newValue',r.inquiry_payload->>'newValue',
      'createdAt',r.inquiry_payload->>'createdAt',
      'reviewState',CASE WHEN r.review_state IN ('PENDING_OFFICER','MAKER_ACKNOWLEDGED','REVIEWER_VERIFIED') THEN 'PENDING' ELSE r.review_state END,
      'reviewRevision',r.review_revision,
      'reviewUpdatedAt',r.review_updated_at,
      'decisionHistory',coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'messageId',d.message_id,
          'action',d.action_code,
          'role',d.officer_role,
          'officerUid',d.officer_uid,
          'reason',d.reason,
          'occurredAt',nullif(o_decision.payload->>'occurredAt',''),
          'deliveryState',o_decision.delivery_state
        ) ORDER BY nullif(o_decision.payload->>'occurredAt','')::timestamptz NULLS LAST,d.message_id)
        FROM payment_sync.officer_decisions d
        JOIN payment_sync.control_outbox o_decision ON o_decision.message_id=d.message_id
        WHERE d.request_id=r.inquiry_id AND o_decision.delivery_state='ACKNOWLEDGED'
      ),'[]'::jsonb),
      'pendingDelivery',(r.delivery_state IS NOT NULL AND r.delivery_state<>'ACKNOWLEDGED'),
      'deliveryState',r.delivery_state,
      'lastDeliveryError',r.last_error,
      'availableActions',CASE
        WHEN r.delivery_state IS NOT NULL AND r.delivery_state<>'ACKNOWLEDGED' THEN '[]'::jsonb
        WHEN r.review_state IN ('APPROVED','APPROVER_CLOSED','REJECTED') THEN '[]'::jsonb
        WHEN r.review_state IN ('PENDING_OFFICER','MAKER_ACKNOWLEDGED','REVIEWER_VERIFIED') THEN '["APPROVE","REJECT"]'::jsonb
        ELSE '[]'::jsonb END
    ) AS item
    FROM page_rows r
  )
  SELECT coalesce(pg_catalog.jsonb_agg(x.item ORDER BY x.received_at DESC,x.inquiry_id DESC),'[]'::jsonb),
    (array_agg(x.received_at ORDER BY x.received_at DESC,x.inquiry_id DESC))[p_limit],
    (array_agg(x.inquiry_id ORDER BY x.received_at DESC,x.inquiry_id DESC))[p_limit]
  INTO v_items,v_last_received_at,v_last_request_id
  FROM page_items x;

  IF v_has_more THEN
    v_next_cursor:=pg_catalog.jsonb_build_object(
      'receivedAt',v_last_received_at,'requestId',v_last_request_id);
  ELSE
    v_next_cursor:='null'::jsonb;
  END IF;
  RETURN pg_catalog.jsonb_build_object('role',v_role,'items',v_items,'nextCursor',v_next_cursor);
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
  IF NOT payment_sync.is_existing_correction_super_admin() THEN RAISE EXCEPTION 'Verified Office Super Admin required' USING ERRCODE='42501'; END IF;
  v_role := 'SUPER_ADMIN';
  IF p_request_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Correction and idempotency identifiers required';
  END IF;
  SELECT origin INTO v_origin FROM payment_sync.settings WHERE singleton;
  IF v_origin IS DISTINCT FROM 'OFFICE_SQL' THEN RAISE EXCEPTION 'Office-only correction review'; END IF;
  IF p_action IS NULL OR p_action NOT IN
    ('APPROVE','REJECT') THEN
    RAISE EXCEPTION 'Unsupported correction review action';
  END IF;

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
  IF v_mirror.review_state IN ('APPROVED','APPROVER_CLOSED','REJECTED') THEN
    RAISE EXCEPTION 'Correction review is already closed';
  END IF;
  -- Retain the authoritative previous raw state; no synthetic intermediate events.
  v_expected := v_mirror.review_state;
  IF v_expected NOT IN ('PENDING_OFFICER','MAKER_ACKNOWLEDGED','REVIEWER_VERIFIED') THEN
    RAISE EXCEPTION 'Correction is not pending';
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
      WHEN 'APPROVE' THEN 'APPROVED'
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
CREATE OR REPLACE FUNCTION public.payment_v1_office_initiate_correction(
 p_payment_id uuid,p_taxpayer_tin text,p_original_reference text,
 p_reason text,p_requested_outcome text,p_evidence_note text,p_idempotency_key uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $office$
DECLARE v_actor uuid := auth.uid();v_origin text;v_role text;
 v_reason text := pg_catalog.btrim(p_reason);
 v_outcome text := pg_catalog.btrim(p_requested_outcome);
 v_case payment_sync.office_initiated_corrections%ROWTYPE;
 v_case_id uuid := gen_random_uuid();
BEGIN
 IF v_actor IS NULL OR p_payment_id IS NULL OR p_idempotency_key IS NULL THEN
  RAISE EXCEPTION 'Authorized Office officer and original payment are required'
    USING ERRCODE='42501';
 END IF;
 SELECT s.origin INTO v_origin FROM payment_sync.settings s WHERE s.singleton;
 IF v_origin IS DISTINCT FROM 'OFFICE_SQL' THEN
   RAISE EXCEPTION 'Office-only correction initiation' USING ERRCODE='42501';
 END IF;
  IF NOT payment_sync.is_existing_correction_super_admin() THEN RAISE EXCEPTION 'Verified Office Super Admin required' USING ERRCODE='42501'; END IF;
  v_role := 'SUPER_ADMIN';
 IF p_original_reference IS NULL OR
    p_original_reference !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{5,79}$' OR
    p_taxpayer_tin IS NULL OR p_taxpayer_tin !~ '^[0-9]{12,13}$' OR
    v_reason IS NULL OR char_length(v_reason) NOT BETWEEN 10 AND 1000 OR
    v_outcome IS NULL OR char_length(v_outcome) NOT BETWEEN 10 AND 600 OR
    p_evidence_note IS NULL OR char_length(btrim(p_evidence_note)) NOT BETWEEN 10 AND 2000 OR
    octet_length(p_evidence_note)>8000 THEN
   RAISE EXCEPTION 'Invalid Office correction inputs';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM demo_payment.story_payments p
   WHERE p.id=p_payment_id AND p.data->>'origin'='TAXPAY_UI'
     AND p.status='SIMULATED_SUCCESS'
     AND (
       p.id::text=p_original_reference OR
       p.data#>>'{details,receiptReference}'=p_original_reference OR
       p.data#>>'{details,receiptSnapshot,challanNo}'=p_original_reference
     )
     AND (
       p.data#>>'{details,taxpayerTin}'=p_taxpayer_tin OR
       EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_array_elements(
           CASE WHEN pg_catalog.jsonb_typeof(p.data#>'{details,allocations}')='array'
             THEN p.data#>'{details,allocations}' ELSE '[]'::jsonb END
         ) AS line(value)
         WHERE line.value->>'taxpayerTin'=p_taxpayer_tin
       )
     )
 ) THEN
    RAISE EXCEPTION 'OFFICE_CORRECTION_ORIGINAL_PAYMENT_NOT_VERIFIED';
 END IF;
 INSERT INTO payment_sync.office_initiated_corrections (
    case_id,source_payment_id,original_reference,taxpayer_tin,reason,
    requested_outcome,evidence_note,initiated_by,officer_role,idempotency_key)
 VALUES (v_case_id,p_payment_id,p_original_reference,p_taxpayer_tin,v_reason,
    v_outcome,p_evidence_note,v_actor,v_role,p_idempotency_key)
 ON CONFLICT (initiated_by,idempotency_key) DO NOTHING;
 SELECT * INTO v_case FROM payment_sync.office_initiated_corrections c
  WHERE c.initiated_by=v_actor AND c.idempotency_key=p_idempotency_key;
 IF v_case.case_id IS NULL OR v_case.source_payment_id IS DISTINCT FROM p_payment_id
   OR v_case.taxpayer_tin IS DISTINCT FROM p_taxpayer_tin
   OR v_case.original_reference IS DISTINCT FROM p_original_reference
   OR v_case.reason IS DISTINCT FROM v_reason
   OR v_case.requested_outcome IS DISTINCT FROM v_outcome
   OR v_case.evidence_note IS DISTINCT FROM p_evidence_note THEN
     RAISE EXCEPTION 'Conflicting Office correction idempotency replay';
 END IF;
 INSERT INTO payment_sync.control_outbox(message_id,request_id,target_origin,payload)
 VALUES(v_case.case_id,v_case.case_id,'TAXPAY_SQL',pg_catalog.jsonb_build_object(
   'schemaVersion','1.0.0','commandType','OFFICE_CORRECTION_INITIATED',
   'origin','OFFICE_SQL','messageId',v_case.case_id,'requestId',v_case.case_id,
   'sourcePaymentId',v_case.source_payment_id,
   'originalReference',v_case.original_reference,'taxpayerTin',v_case.taxpayer_tin,
   'reason',v_case.reason,'requestedOutcome',v_case.requested_outcome,
   'evidenceNote',v_case.evidence_note,'officerUid',v_case.initiated_by,
   'officerRole',v_case.officer_role,'occurredAt',v_case.created_at
 ))
 ON CONFLICT(message_id) DO NOTHING;
 RETURN pg_catalog.jsonb_build_object('caseId',v_case.case_id,
   'queued',true,'replayed',v_case.case_id<>v_case_id,
   'status','AWAITING_TAXPAYER_SOURCE_VERIFICATION');
END;
$office$;
CREATE OR REPLACE FUNCTION public.payment_v1_office_initiated_correction_history(
 p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $office_history$
DECLARE v_actor uuid := auth.uid(); v_role text; v_records jsonb;
BEGIN
  IF NOT payment_sync.is_existing_correction_super_admin() THEN RAISE EXCEPTION 'Verified Office Super Admin required' USING ERRCODE='42501'; END IF;
  v_role := 'SUPER_ADMIN';
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'Invalid Office correction history limit';
 END IF;
 SELECT coalesce(pg_catalog.jsonb_agg(row_data.item ORDER BY row_data.created_at DESC,row_data.case_id DESC),'[]'::jsonb)
 INTO v_records FROM (
   SELECT c.case_id,c.created_at,pg_catalog.jsonb_build_object(
     'caseId',c.case_id,'sourcePaymentId',c.source_payment_id,
     'originalReference',c.original_reference,'taxpayerTin',c.taxpayer_tin,
     'reason',c.reason,'requestedOutcome',c.requested_outcome,'evidenceNote',c.evidence_note,
     'officerRole',c.officer_role,'createdAt',c.created_at,
     'deliveryState',o.delivery_state,
     'sourceConfirmed',(m.inquiry_id IS NOT NULL),
     'sourceReviewState',m.review_state
   ) AS item
   FROM payment_sync.office_initiated_corrections c
   JOIN payment_sync.control_outbox o ON o.message_id=c.case_id
   LEFT JOIN payment_sync.correction_mirrors m ON m.inquiry_id=c.case_id
   ORDER BY c.created_at DESC,c.case_id DESC LIMIT p_limit
 ) row_data;
 RETURN pg_catalog.jsonb_build_object('role',v_role,'items',v_records);
END;
$office_history$;

-- Existing public RPC ACLs must remain narrow. No new public RPC or role assignment.
REVOKE ALL ON FUNCTION public.payment_v1_correction_queue(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.payment_v1_correction_queue_page(integer,timestamptz,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.payment_v1_correction_officer_action(uuid,text,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.payment_v1_office_initiate_correction(uuid,text,text,text,text,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.payment_v1_office_initiated_correction_history(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.payment_v1_internal_ack_correction_command(uuid,uuid,boolean,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payment_v1_internal_ack_correction_command(uuid,uuid,boolean,text,text) TO service_role;

-- Typed Office-origin correction candidate. Retain seven-argument legacy RPC
-- for compatibility, never infer an applied change from its free-text outcome.
-- New overload uses exactly the ordinary correction field contract.
CREATE OR REPLACE FUNCTION public.payment_v1_office_initiate_correction(
 p_payment_id uuid,p_taxpayer_tin text,p_original_reference text,
 p_reason text,p_requested_outcome text,p_evidence_note text,p_idempotency_key uuid,
 p_correction jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $typed$
DECLARE
 v_details jsonb; v_snapshot jsonb; v_allocs jsonb; v_items jsonb; v_lines jsonb;
 v_count integer; v_index integer; v_alloc jsonb; v_snap_alloc jsonb;
 v_id text; v_tin text; v_year text; v_circle text; v_head text;
 v_new_year text; v_new_circle text; v_new_head text; v_canonical jsonb;
 v_queued jsonb; v_case_id uuid; v_payload jsonb;
 v_year_normal text; v_new_year_normal text;
BEGIN
 IF NOT payment_sync.is_existing_correction_super_admin() THEN
  RAISE EXCEPTION 'Verified Office Super Admin required' USING ERRCODE='42501';
 END IF;
 IF jsonb_typeof(p_correction) IS DISTINCT FROM 'object' OR
    NOT (p_correction ?& ARRAY['allocationIndex','allocationId','currentAY','currentCircle','currentHeadCode','proposedAY','proposedCircle','proposedHeadCode']) OR
    (SELECT count(*) FROM jsonb_object_keys(p_correction))<>8 OR
    EXISTS(SELECT 1 FROM jsonb_each(p_correction) e WHERE e.key NOT IN ('allocationIndex','allocationId') AND jsonb_typeof(e.value)<>'string') OR
    jsonb_typeof(p_correction->'allocationId') NOT IN ('string','null') OR
    jsonb_typeof(p_correction->'allocationIndex') NOT IN ('number','null') THEN
  RAISE EXCEPTION 'INVALID_OFFICE_TYPED_CORRECTION';
 END IF;
 SELECT p.data->'details' INTO v_details FROM demo_payment.story_payments p
 WHERE p.id=p_payment_id AND p.status='SIMULATED_SUCCESS' AND p.data->>'origin'='TAXPAY_UI'
 AND (p.id::text=p_original_reference OR p.data#>>'{details,receiptReference}'=p_original_reference
 OR p.data#>>'{details,receiptSnapshot,challanNo}'=p_original_reference);
 IF NOT FOUND THEN RAISE EXCEPTION 'OFFICE_CORRECTION_ORIGINAL_PAYMENT_NOT_VERIFIED'; END IF;
 v_snapshot:=coalesce(v_details->'receiptSnapshot','{}'::jsonb);
 v_allocs:=case when jsonb_typeof(v_details->'allocations')='array' then v_details->'allocations' else '[]'::jsonb end;
 v_items:=case when jsonb_typeof(v_snapshot->'allocationItems')='array' then v_snapshot->'allocationItems' else '[]'::jsonb end;
 v_lines:=case when jsonb_typeof(v_details->'lines')='array' then v_details->'lines' else '[]'::jsonb end;
 v_count:=greatest(jsonb_array_length(v_allocs),jsonb_array_length(v_items),jsonb_array_length(v_lines));
 IF p_correction->>'allocationIndex' IS NOT NULL THEN
  IF p_correction->>'allocationIndex' !~ '^[0-9]{1,6}
 THEN RAISE EXCEPTION 'INVALID_OFFICE_CORRECTION_ALLOCATION'; END IF;
  v_index:=(p_correction->>'allocationIndex')::integer;
 END IF;
 IF (v_count=0 AND v_index IS NOT NULL) OR
    (v_count>0 AND (v_index IS NULL OR v_index>=v_count)) THEN
  RAISE EXCEPTION 'INVALID_OFFICE_CORRECTION_ALLOCATION';
 END IF;
 v_alloc:=v_allocs->v_index;v_snap_alloc:=v_items->v_index;
 v_id:=nullif(coalesce(v_alloc->>'allocationId',v_snap_alloc->>'allocationId'),'');
 IF (p_correction->>'allocationId') IS DISTINCT FROM v_id OR
   (v_count>1 AND v_alloc IS NULL AND v_snap_alloc IS NULL) THEN
  RAISE EXCEPTION 'INVALID_OFFICE_CORRECTION_ALLOCATION';
 END IF;
 -- Exact recipient, never infer an arbitrary line from the parent payer.
 v_tin:=coalesce(nullif(v_alloc->>'taxpayerTin',''),nullif(v_snap_alloc->>'taxpayerTin',''),
   CASE WHEN v_count<=1 THEN nullif(v_details->>'taxpayerTin','') END);
 IF v_tin IS DISTINCT FROM p_taxpayer_tin THEN RAISE EXCEPTION 'OFFICE_CORRECTION_RECIPIENT_MISMATCH'; END IF;
 v_year:=coalesce(nullif(v_alloc->>'assessmentYear',''),nullif(v_snap_alloc->>'assessmentYear',''),
   nullif(v_lines->v_index->>'assessmentYear',''),nullif(v_snapshot->>'assessmentYear',''),nullif(v_details->>'assessmentYear',''),'');
 v_circle:=coalesce(v_snapshot->>'taxCircle',v_details->>'taxCircle','');
 v_head:=coalesce(nullif(v_snap_alloc->>'economicCode',''),nullif(v_lines->v_index->>'economicCode',''),
   nullif(v_snapshot->'items'->v_index->>'economicCode',''),
   CASE WHEN v_count<=1 THEN nullif(v_snapshot#>>'{items,0,economicCode}','') END,'');
 IF (p_correction->>'currentAY',p_correction->>'currentCircle',p_correction->>'currentHeadCode')
      IS DISTINCT FROM (v_year,v_circle,v_head) THEN RAISE EXCEPTION 'OFFICE_CORRECTION_STALE_VALUES'; END IF;
 v_new_year:=btrim(p_correction->>'proposedAY');v_new_circle:=btrim(p_correction->>'proposedCircle');
 v_new_head:=btrim(p_correction->>'proposedHeadCode');
 IF (v_new_year IS DISTINCT FROM v_year AND v_new_year !~ '^[0-9]{4}-([0-9]{2}|[0-9]{4})
) OR
   length(v_new_circle)>120 OR length(v_new_head)>120 OR
   (v_new_circle='' AND v_circle<>'') OR (v_new_head='' AND v_head<>'') THEN
  RAISE EXCEPTION 'INVALID_OFFICE_TYPED_CORRECTION';
 END IF;
 v_year_normal:=case when v_year ~ '^[0-9]{4}-[0-9]{2}
 then left(v_year,5)||left(v_year,2)||right(v_year,2) else v_year end;
 v_new_year_normal:=case when v_new_year ~ '^[0-9]{4}-[0-9]{2}
 then left(v_new_year,5)||left(v_new_year,2)||right(v_new_year,2) else v_new_year end;
 IF (v_year_normal,v_circle,v_head) IS NOT DISTINCT FROM (v_new_year_normal,v_new_circle,v_new_head) THEN
  RAISE EXCEPTION 'CORRECTION_NO_CHANGE';
 END IF;
 v_canonical:=jsonb_build_object('allocationIndex',v_index,'allocationId',v_id,
   'currentAY',v_year,'currentCircle',v_circle,'currentHeadCode',v_head,
   'proposedAY',v_new_year,'proposedCircle',v_new_circle,'proposedHeadCode',v_new_head);
 -- Existing case creation supplies the authoritative actor, parent, reference,
 -- idempotency and original signed envelope. Add typed values atomically
 -- before the outbox becomes visible to its existing dispatcher.
 v_queued:=public.payment_v1_office_initiate_correction(p_payment_id,p_taxpayer_tin,p_original_reference,
   p_reason,p_requested_outcome,p_evidence_note,p_idempotency_key);
 v_case_id:=(v_queued->>'caseId')::uuid;
 SELECT o.payload INTO v_payload FROM payment_sync.control_outbox o WHERE o.message_id=v_case_id FOR UPDATE;
 IF NOT FOUND OR v_payload->>'commandType' IS DISTINCT FROM 'OFFICE_CORRECTION_INITIATED' THEN
  RAISE EXCEPTION 'OFFICE_CORRECTION_COMMAND_MISSING';
 END IF;
 IF v_queued->>'replayed'='true' THEN
  IF v_payload->'typedCorrection' IS DISTINCT FROM v_canonical THEN RAISE EXCEPTION 'Conflicting Office typed correction replay'; END IF;
 ELSE
  IF v_payload ? 'typedCorrection' THEN RAISE EXCEPTION 'Conflicting Office typed correction command'; END IF;
  UPDATE payment_sync.control_outbox SET payload=v_payload||jsonb_build_object('typedCorrection',v_canonical)
  WHERE message_id=v_case_id;
 END IF;
 RETURN v_queued;
END;
$typed$;
REVOKE ALL ON FUNCTION public.payment_v1_office_initiate_correction(uuid,text,text,text,text,text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.payment_v1_office_initiate_correction(uuid,text,text,text,text,text,uuid,jsonb) TO authenticated;

COMMIT;
