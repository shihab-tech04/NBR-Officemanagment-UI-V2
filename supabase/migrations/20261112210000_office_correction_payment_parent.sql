-- Carry the immutable TaxPay source payment parent into the separate Office correction mirror.
-- Legacy inquiries without a parent remain readable; new TaxPay inquiries include the exact ID.
BEGIN;

ALTER TABLE payment_sync.correction_mirrors
  ADD COLUMN source_payment_id uuid,
  ADD COLUMN source_payment_kind text;

ALTER TABLE payment_sync.correction_mirrors
  ADD CONSTRAINT correction_mirrors_source_payment_pair_check CHECK (
    (source_payment_id IS NULL AND source_payment_kind IS NULL)
    OR
    (source_payment_id IS NOT NULL
      AND source_payment_kind='TAXPAY_STORY_PAYMENT')
  ) NOT VALID;
ALTER TABLE payment_sync.correction_mirrors
  VALIDATE CONSTRAINT correction_mirrors_source_payment_pair_check;

CREATE INDEX correction_mirrors_source_payment_idx
  ON payment_sync.correction_mirrors(source_payment_kind,source_payment_id)
  WHERE source_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION payment_sync.bind_correction_source_parent()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_payment_id text;
  v_payment_kind text;
BEGIN
  IF NOT (NEW.inquiry_payload ? 'originalPaymentId')
     AND NOT (NEW.inquiry_payload ? 'originalPaymentKind') THEN
    NEW.source_payment_id:=NULL;
    NEW.source_payment_kind:=NULL;
    RETURN NEW;
  END IF;

  v_payment_id:=NEW.inquiry_payload->>'originalPaymentId';
  v_payment_kind:=NEW.inquiry_payload->>'originalPaymentKind';
  IF coalesce(v_payment_id,'') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR v_payment_kind IS DISTINCT FROM 'TAXPAY_STORY_PAYMENT' THEN
    RAISE EXCEPTION 'Invalid correction source payment parent';
  END IF;

  NEW.source_payment_id:=v_payment_id::uuid;
  NEW.source_payment_kind:=v_payment_kind;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION payment_sync.bind_correction_source_parent()
  FROM PUBLIC,anon,authenticated;

CREATE TRIGGER correction_mirror_bind_source_parent_before_insert
  BEFORE INSERT ON payment_sync.correction_mirrors
  FOR EACH ROW EXECUTE FUNCTION payment_sync.bind_correction_source_parent();

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
        'sourcePaymentId',m.source_payment_id,
        'sourcePaymentKind',m.source_payment_kind,
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

COMMENT ON COLUMN payment_sync.correction_mirrors.source_payment_id IS
  'Immutable source-side TaxPay payment ID; the Office database stores only the cross-database parent reference.';
COMMENT ON COLUMN payment_sync.correction_mirrors.source_payment_kind IS
  'Source record type for source_payment_id. Legacy correction mirrors may have no parent link.';
COMMENT ON FUNCTION payment_sync.bind_correction_source_parent() IS
  'Validates and copies the immutable source payment parent from the authenticated TaxPay correction event payload.';

COMMIT;
