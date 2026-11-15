-- Phase 6: authorized Office-originated, review-only correction intake.
-- A request is NOT a reversal, settlement, credit adjustment or approved challan.
-- It may enter the existing Maker/Reviewer/Approver queue only after the
-- separate Taxpayer SQL validates the source and mirrors the signed event.
BEGIN;
CREATE TABLE payment_sync.office_initiated_corrections (
  case_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_payment_id uuid NOT NULL REFERENCES demo_payment.story_payments(id),
  original_reference text NOT NULL
    CHECK (original_reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{5,79}$'),
  taxpayer_tin text NOT NULL CHECK (taxpayer_tin ~ '^[0-9]{12,13}$'),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 1000),
  requested_outcome text NOT NULL CHECK (char_length(btrim(requested_outcome)) BETWEEN 10 AND 600),
  evidence_note text NOT NULL CHECK (
    char_length(btrim(evidence_note)) BETWEEN 10 AND 2000 AND
    octet_length(evidence_note) <= 8000
  ),
  initiated_by uuid NOT NULL REFERENCES auth.users(id),
  officer_role text NOT NULL CHECK (officer_role IN ('MAKER','APPROVER')),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (initiated_by,idempotency_key)
);
ALTER TABLE payment_sync.office_initiated_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_sync.office_initiated_corrections FORCE ROW LEVEL SECURITY;
REVOKE ALL ON payment_sync.office_initiated_corrections FROM PUBLIC,anon,authenticated;
CREATE INDEX office_initiated_corrections_created_idx
 ON payment_sync.office_initiated_corrections(created_at DESC,case_id DESC);

CREATE FUNCTION public.payment_v1_office_initiate_correction(
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
 SELECT r.role INTO v_role FROM payment_sync.officer_roles r
  WHERE r.user_uid=v_actor AND r.active AND r.role IN ('MAKER','APPROVER');
 IF v_role IS NULL THEN
   RAISE EXCEPTION 'Active Maker or Approver role required' USING ERRCODE='42501';
 END IF;
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
REVOKE ALL ON FUNCTION public.payment_v1_office_initiate_correction(
 uuid,text,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payment_v1_office_initiate_correction(
 uuid,text,text,text,text,text,uuid) TO authenticated;

CREATE FUNCTION public.payment_v1_office_initiated_correction_history(
 p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $office_history$
DECLARE v_actor uuid := auth.uid(); v_role text; v_records jsonb;
BEGIN
 SELECT r.role INTO v_role FROM payment_sync.officer_roles r
   WHERE r.user_uid=v_actor AND r.active AND r.role IN ('MAKER','REVIEWER','APPROVER');
 IF v_role IS NULL THEN RAISE EXCEPTION 'Active authorized Office officer required' USING ERRCODE='42501'; END IF;
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
REVOKE ALL ON FUNCTION public.payment_v1_office_initiated_correction_history(integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payment_v1_office_initiated_correction_history(integer)
 TO authenticated;
COMMENT ON TABLE payment_sync.office_initiated_corrections IS
 'Immutable signed Office initiation intents. Source Taxpayer SQL must validate original payment ownership before creating a correction review. Never changes money or tax-credit.';
COMMIT;
