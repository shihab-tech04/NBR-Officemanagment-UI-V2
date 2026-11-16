BEGIN;

-- A per-officer read receipt for Office-visible TaxPay Story notices.
-- Eligibility is the cursor's existing TAXPAY_UI/NEW_SIMULATED_PAYMENT
-- predicate plus the identical closed historical test exclusion.
-- Never broaden this permission to TAXPAY_SQL_FIXTURE data.
-- Keep these rows separate from immutable payments, receipts and notice events.
CREATE TABLE payment_sync.officer_story_notice_reads (
  notice_id bigint NOT NULL
    REFERENCES demo_payment.story_notifications(id) ON DELETE CASCADE,
  officer_uid uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id,officer_uid)
);
CREATE INDEX officer_story_notice_reads_officer_idx
  ON payment_sync.officer_story_notice_reads(officer_uid,read_at DESC);
ALTER TABLE payment_sync.officer_story_notice_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON payment_sync.officer_story_notice_reads FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.payment_v1_office_story_notice_read_state(
  p_notice_ids text[] DEFAULT ARRAY[]::text[]
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_origin text;
  v_requested integer;
  v_valid integer;
  v_result jsonb;
BEGIN
  SELECT s.origin INTO v_origin
    FROM payment_sync.settings s WHERE s.singleton;
  IF v_actor IS NULL OR v_origin IS DISTINCT FROM 'OFFICE_SQL' THEN
    RAISE EXCEPTION 'Authorized Office officer required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM payment_sync.officer_roles r
    WHERE r.user_uid=v_actor AND r.active
      AND r.role IN ('MAKER','REVIEWER','APPROVER')
  ) THEN
    RAISE EXCEPTION 'Active payment officer role required';
  END IF;
  IF p_notice_ids IS NULL OR pg_catalog.cardinality(p_notice_ids)>100 THEN
    RAISE EXCEPTION 'Invalid payment notice IDs';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_notice_ids) AS requested(id)
    WHERE requested.id IS NULL OR requested.id !~ '^[1-9][0-9]{0,18}$'
  ) THEN
    RAISE EXCEPTION 'Invalid payment notice IDs';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_notice_ids) AS requested(id)
    WHERE pg_catalog.length(requested.id)=19
      AND requested.id::numeric>9223372036854775807::numeric
  ) THEN
    RAISE EXCEPTION 'Invalid payment notice IDs';
  END IF;

  SELECT count(DISTINCT requested.id::bigint)::integer INTO v_requested
    FROM pg_catalog.unnest(p_notice_ids) AS requested(id);
  SELECT count(*)::integer INTO v_valid
    FROM (
      SELECT DISTINCT requested.id::bigint AS id
      FROM pg_catalog.unnest(p_notice_ids) AS requested(id)
      JOIN demo_payment.story_notifications n ON n.id=requested.id::bigint
      JOIN demo_payment.story_payments p ON p.id=n.payment_id
      WHERE p.data->>'origin'='TAXPAY_UI'
        AND n.event_type='NEW_SIMULATED_PAYMENT'
      AND NOT (
        p.data->'details'->>'payerName'='Taxpayer / withholding agent'
        AND p.data->'details'->>'taxpayerTin'='123456789012'
        AND p.created_at<'2026-10-18 06:55:00+00'::timestamptz
      )
    ) valid;
  IF v_valid<>v_requested THEN
    RAISE EXCEPTION 'Office payment notice not found';
  END IF;

  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'noticeId',n.id::text,
      'isRead',r.officer_uid IS NOT NULL
    ) ORDER BY n.id DESC
  ),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT DISTINCT requested.id::bigint AS id
    FROM pg_catalog.unnest(p_notice_ids) AS requested(id)
    JOIN demo_payment.story_notifications source_notice
      ON source_notice.id=requested.id::bigint
    JOIN demo_payment.story_payments source_payment
      ON source_payment.id=source_notice.payment_id
    JOIN demo_payment.story_notifications n ON n.id=source_notice.id
    WHERE source_payment.data->>'origin'='TAXPAY_UI'
      AND n.event_type='NEW_SIMULATED_PAYMENT'
      AND NOT (
        source_payment.data->'details'->>'payerName'='Taxpayer / withholding agent'
        AND source_payment.data->'details'->>'taxpayerTin'='123456789012'
        AND source_payment.created_at<'2026-10-18 06:55:00+00'::timestamptz
      )
  ) n
  LEFT JOIN payment_sync.officer_story_notice_reads r
    ON r.notice_id=n.id AND r.officer_uid=v_actor;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.payment_v1_office_set_story_notice_read(
  p_notice_id text,
  p_is_read boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_actor uuid:=auth.uid();
  v_origin text;
  v_notice_id bigint;
BEGIN
  SELECT s.origin INTO v_origin
    FROM payment_sync.settings s WHERE s.singleton;
  IF v_actor IS NULL OR v_origin IS DISTINCT FROM 'OFFICE_SQL' THEN
    RAISE EXCEPTION 'Authorized Office officer required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM payment_sync.officer_roles r
    WHERE r.user_uid=v_actor AND r.active
      AND r.role IN ('MAKER','REVIEWER','APPROVER')
  ) THEN
    RAISE EXCEPTION 'Active payment officer role required';
  END IF;
  IF p_notice_id IS NULL OR p_notice_id !~ '^[1-9][0-9]{0,18}$'
     OR p_is_read IS NULL THEN
    RAISE EXCEPTION 'Notice and read state required';
  END IF;
  IF pg_catalog.length(p_notice_id)=19
     AND p_notice_id::numeric>9223372036854775807::numeric THEN
    RAISE EXCEPTION 'Notice and read state required';
  END IF;
  v_notice_id:=p_notice_id::bigint;
  IF NOT EXISTS (
    SELECT 1 FROM demo_payment.story_notifications n
    JOIN demo_payment.story_payments p ON p.id=n.payment_id
    WHERE n.id=v_notice_id AND n.event_type='NEW_SIMULATED_PAYMENT'
      AND p.data->>'origin'='TAXPAY_UI'
      AND NOT (
        p.data->'details'->>'payerName'='Taxpayer / withholding agent'
        AND p.data->'details'->>'taxpayerTin'='123456789012'
        AND p.created_at<'2026-10-18 06:55:00+00'::timestamptz
      )
  ) THEN
    RAISE EXCEPTION 'Office payment notice not found';
  END IF;

  IF p_is_read THEN
    INSERT INTO payment_sync.officer_story_notice_reads(notice_id,officer_uid)
      VALUES(v_notice_id,v_actor)
    ON CONFLICT(notice_id,officer_uid) DO NOTHING;
  ELSE
    DELETE FROM payment_sync.officer_story_notice_reads
      WHERE notice_id=v_notice_id AND officer_uid=v_actor;
  END IF;
  RETURN pg_catalog.jsonb_build_object('noticeId',v_notice_id::text,'isRead',p_is_read);
END;
$function$;

REVOKE ALL ON FUNCTION public.payment_v1_office_story_notice_read_state(text[])
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.payment_v1_office_set_story_notice_read(text,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payment_v1_office_story_notice_read_state(text[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.payment_v1_office_set_story_notice_read(text,boolean)
  TO authenticated;

COMMENT ON TABLE payment_sync.officer_story_notice_reads IS
  'Per-officer read receipts for Office-visible TaxPay Story payment events; no payment or settlement state.';
COMMENT ON FUNCTION public.payment_v1_office_story_notice_read_state(text[]) IS
  'Read the current officer''s receipt state for up to 100 TaxPay Story payment notices; identifiers use exact decimal strings.';
COMMENT ON FUNCTION public.payment_v1_office_set_story_notice_read(text,boolean) IS
  'Set or clear only the authenticated active officer''s read receipt for one Office payment notice using its exact decimal-string ID.';

COMMIT;
