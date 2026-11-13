BEGIN;
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
  IF v_actor IS NULL THEN RAISE EXCEPTION 'Authenticated Office officer required'; END IF;
  SELECT r.role INTO v_role
  FROM payment_sync.officer_roles r
  WHERE r.user_uid=v_actor AND r.active AND r.role IN ('MAKER','REVIEWER','APPROVER');
  IF v_role IS NULL THEN RAISE EXCEPTION 'Active payment officer role required'; END IF;
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
    SELECT m.inquiry_id,m.received_at,m.inquiry_payload,m.source_payment_id,
      m.source_payment_kind,m.review_state,m.review_revision,m.review_updated_at,
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
      'originalReference',r.inquiry_payload->>'originalReference',
      'sourcePaymentId',r.source_payment_id,
      'sourcePaymentKind',r.source_payment_kind,
      'reason',r.inquiry_payload->>'reason',
      'requestedOutcome',r.inquiry_payload->>'requestedOutcome',
      'evidenceState',r.inquiry_payload->>'evidenceState',
      'changeKind',r.inquiry_payload->>'changeKind',
      'oldValue',r.inquiry_payload->>'oldValue',
      'newValue',r.inquiry_payload->>'newValue',
      'createdAt',r.inquiry_payload->>'createdAt',
      'reviewState',r.review_state,
      'reviewRevision',r.review_revision,
      'reviewUpdatedAt',r.review_updated_at,
      'decisionHistory',coalesce((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'messageId',d.message_id,
          'action',d.action_code,
          'role',d.officer_role,
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
        WHEN r.review_state IN ('APPROVER_CLOSED','REJECTED') THEN '[]'::jsonb
        WHEN v_role='MAKER' AND r.review_state='PENDING_OFFICER'
          THEN '["MAKER_ACKNOWLEDGE"]'::jsonb
        WHEN v_role='REVIEWER' AND r.review_state='MAKER_ACKNOWLEDGED'
          THEN '["REVIEWER_VERIFY","REJECT"]'::jsonb
        WHEN v_role='APPROVER' AND r.review_state='REVIEWER_VERIFIED'
          THEN '["APPROVER_CLOSE","REJECT"]'::jsonb
        WHEN v_role IN ('REVIEWER','APPROVER')
          THEN '["REJECT"]'::jsonb
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
ALTER FUNCTION public.payment_v1_correction_queue_page(integer,timestamptz,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.payment_v1_correction_queue_page(integer,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.payment_v1_correction_queue_page(integer,timestamptz,uuid) TO authenticated;
COMMENT ON FUNCTION public.payment_v1_correction_queue_page(integer,timestamptz,uuid) IS
  'Role-checked read-only keyset pagination for complete Office correction history with acknowledged decision events only.';
COMMIT;
