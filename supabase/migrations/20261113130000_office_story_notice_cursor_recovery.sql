-- Cursor-based recovery for the Office alert feed.
-- This additive projection exposes only approved synthetic payment notices and exact parent metadata.
CREATE OR REPLACE FUNCTION public.demo_story1_office_notice_page(
  p_after_id bigint DEFAULT 0,
  p_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_items jsonb;
  v_has_more boolean;
  v_next_after_id bigint;
BEGIN
  IF p_after_id IS NULL OR p_after_id < 0
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_PAGINATION';
  END IF;

  WITH eligible AS MATERIALIZED (
    SELECT n.id,n.payment_id,n.event_type,n.created_at,
           p.service_code,p.amount_minor,p.status,p.created_at AS payment_created_at
    FROM demo_payment.story_notifications n
    JOIN demo_payment.story_payments p ON p.id=n.payment_id
    WHERE n.id>p_after_id
      -- Same narrow officer read/ack eligibility as
      -- payment_v1_office_story_notice_read_state / _set_story_notice_read:
      -- fixture provenance and unrelated event types are NOT authorized.
      AND p.data->>'origin'='TAXPAY_UI'
      AND n.event_type='NEW_SIMULATED_PAYMENT'
      AND NOT (
        p.data->'details'->>'payerName'='Taxpayer / withholding agent'
        AND p.data->'details'->>'taxpayerTin'='123456789012'
        AND p.created_at<'2026-10-18 06:55:00+00'::timestamptz
      )
    ORDER BY n.id ASC
    LIMIT p_limit+1
  ),
  page AS (
    SELECT * FROM eligible ORDER BY id ASC LIMIT p_limit
  )
  SELECT
    COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',page.id::text,
        'paymentId',page.payment_id,
        'type',page.event_type,
        'createdAt',page.created_at,
        'payment',pg_catalog.jsonb_build_object(
          'id',page.payment_id,
          'service',page.service_code,
          'amountMinor',page.amount_minor::text,
          'status',page.status,
          'createdAt',page.payment_created_at
        )
      ) ORDER BY page.id ASC)
      FROM page
    ),'[]'::jsonb),
    (SELECT count(*)>p_limit FROM eligible),
    COALESCE((SELECT max(page.id) FROM page),p_after_id)
  INTO v_items,v_has_more,v_next_after_id;

  RETURN pg_catalog.jsonb_build_object(
    'items',v_items,'nextAfterId',v_next_after_id::text,'hasMore',v_has_more
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.demo_story1_office_notice_page(bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demo_story1_office_notice_page(bigint,integer) TO anon,authenticated;
COMMENT ON FUNCTION public.demo_story1_office_notice_page(bigint,integer) IS
  'Read-only cursor page of approved synthetic Office alerts with exact payment-parent metadata; no private taxpayer fields.';
