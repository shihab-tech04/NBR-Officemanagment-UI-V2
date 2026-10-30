-- Run after officeCorrectionReviewFixture.sql and the Story read-state fixture
-- plus real source migration. All read receipts are rolled back at the end.
BEGIN;

CREATE TEMP TABLE story_notice_financial_guard(
  relation_name text PRIMARY KEY,row_count bigint NOT NULL,content_digest text NOT NULL
) ON COMMIT DROP;
INSERT INTO story_notice_financial_guard
SELECT 'demo_payment.story_payments',count(*),
       md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),''))
FROM demo_payment.story_payments t;
INSERT INTO story_notice_financial_guard
SELECT 'demo_payment.story_notifications',count(*),
       md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),''))
FROM demo_payment.story_notifications t;

DO $security$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class
          WHERE oid='payment_sync.officer_story_notice_reads'::regclass) THEN
    RAISE EXCEPTION 'Officer story notice read table must enable RLS';
  END IF;
  IF pg_catalog.has_table_privilege('authenticated','payment_sync.officer_story_notice_reads','SELECT')
     OR pg_catalog.has_table_privilege('authenticated','payment_sync.officer_story_notice_reads','INSERT')
     OR pg_catalog.has_table_privilege('anon','payment_sync.officer_story_notice_reads','SELECT')
     OR pg_catalog.has_function_privilege('anon','public.payment_v1_office_story_notice_read_state(bigint[])','EXECUTE')
     OR pg_catalog.has_function_privilege('anon','public.payment_v1_office_set_story_notice_read(bigint,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'Direct read receipt access must remain closed to clients and anon';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated','public.payment_v1_office_story_notice_read_state(bigint[])','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated','public.payment_v1_office_set_story_notice_read(bigint,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated users need the guarded RPC contracts';
  END IF;
END;
$security$;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000011',true);
DO $maker_reads$
DECLARE v_state jsonb; v_first jsonb; v_retry jsonb;
BEGIN
  v_state:=public.payment_v1_office_story_notice_read_state(ARRAY[101,102,101]::bigint[]);
  IF pg_catalog.jsonb_array_length(v_state)<>2
     OR NOT (v_state @> '[{"noticeId":101,"isRead":false},{"noticeId":102,"isRead":false}]'::jsonb) THEN
    RAISE EXCEPTION 'Maker initial read state should be unread and deduplicated by notice ID';
  END IF;
  v_first:=public.payment_v1_office_set_story_notice_read(101,true);
  v_retry:=public.payment_v1_office_set_story_notice_read(101,true);
  IF v_first IS DISTINCT FROM '{"noticeId":101,"isRead":true}'::jsonb
     OR v_retry IS DISTINCT FROM v_first THEN
    RAISE EXCEPTION 'Retrying the same read receipt must be idempotent';
  END IF;
  v_state:=public.payment_v1_office_story_notice_read_state(ARRAY[101]::bigint[]);
  IF NOT (v_state @> '[{"noticeId":101,"isRead":true}]'::jsonb) THEN
    RAISE EXCEPTION 'Maker read state did not persist';
  END IF;
  BEGIN
    PERFORM public.payment_v1_office_story_notice_read_state(ARRAY[103]::bigint[]);
    RAISE EXCEPTION 'QA-origin notice should not enter the Office payment receipt contract';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'Office payment notice not found' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.payment_v1_office_story_notice_read_state(ARRAY[999]::bigint[]);
    RAISE EXCEPTION 'Missing Office payment notice should be denied';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'Office payment notice not found' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.payment_v1_office_story_notice_read_state(NULL::bigint[]);
    RAISE EXCEPTION 'NULL notice ID list should be denied';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'Invalid payment notice IDs' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.payment_v1_office_set_story_notice_read(103,true);
    RAISE EXCEPTION 'QA-origin notice should not accept a read receipt';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'Office payment notice not found' THEN RAISE; END IF;
  END;
END;
$maker_reads$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000012',true);
DO $reviewer_reads$
DECLARE v_state jsonb;
BEGIN
  v_state:=public.payment_v1_office_story_notice_read_state(ARRAY[101]::bigint[]);
  IF NOT (v_state @> '[{"noticeId":101,"isRead":false}]'::jsonb) THEN
    RAISE EXCEPTION 'Maker read receipt must not be shared with Reviewer';
  END IF;
  PERFORM public.payment_v1_office_set_story_notice_read(101,true);
  v_state:=public.payment_v1_office_story_notice_read_state(ARRAY[101]::bigint[]);
  IF NOT (v_state @> '[{"noticeId":101,"isRead":true}]'::jsonb) THEN
    RAISE EXCEPTION 'Reviewer receipt did not persist for the Reviewer';
  END IF;
END;
$reviewer_reads$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000013',true);
DO $approver_reads$
DECLARE v_state jsonb;
BEGIN
  v_state:=public.payment_v1_office_story_notice_read_state(ARRAY[101]::bigint[]);
  IF NOT (v_state @> '[{"noticeId":101,"isRead":false}]'::jsonb) THEN
    RAISE EXCEPTION 'Approver should be able to read their own initial receipt state';
  END IF;
END;
$approver_reads$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000014',true);
DO $incorrect_role$
BEGIN
  BEGIN
    PERFORM public.payment_v1_office_story_notice_read_state(ARRAY[101]::bigint[]);
    RAISE EXCEPTION 'Active non-payment role was incorrectly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'Active payment officer role required' THEN RAISE; END IF;
  END;
END;
$incorrect_role$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','',true);
DO $missing_identity$
BEGIN
  BEGIN
    PERFORM public.payment_v1_office_story_notice_read_state(ARRAY[101]::bigint[]);
    RAISE EXCEPTION 'Missing signed-in officer identity was incorrectly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'Authorized Office officer required' THEN RAISE; END IF;
  END;
END;
$missing_identity$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000011',true);
DO $maker_clears_only_own$
DECLARE v_state jsonb;
BEGIN
  PERFORM public.payment_v1_office_set_story_notice_read(101,false);
  v_state:=public.payment_v1_office_story_notice_read_state(ARRAY[101]::bigint[]);
  IF NOT (v_state @> '[{"noticeId":101,"isRead":false}]'::jsonb) THEN
    RAISE EXCEPTION 'Maker should be able to clear only their own read receipt';
  END IF;
END;
$maker_clears_only_own$;

RESET ROLE;
DO $row_isolation$
DECLARE
  v_rows integer;
  v_payment_count bigint;
  v_payment_digest text;
  v_notice_count bigint;
  v_notice_digest text;
BEGIN
  SELECT count(*) INTO v_rows FROM payment_sync.officer_story_notice_reads
  WHERE notice_id=101 AND officer_uid='80000000-0000-4000-8000-000000000012';
  IF v_rows<>1 OR EXISTS (
    SELECT 1 FROM payment_sync.officer_story_notice_reads
    WHERE notice_id=101 AND officer_uid='80000000-0000-4000-8000-000000000011'
  ) THEN
    RAISE EXCEPTION 'Officer rows were not isolated by authenticated identity';
  END IF;

  SELECT count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),''))
    INTO v_payment_count,v_payment_digest
  FROM demo_payment.story_payments t;
  IF NOT EXISTS (
    SELECT 1 FROM story_notice_financial_guard g
    WHERE g.relation_name='demo_payment.story_payments'
      AND g.row_count=v_payment_count AND g.content_digest=v_payment_digest
  ) THEN
    RAISE EXCEPTION 'Read-state action mutated the payment table';
  END IF;

  SELECT count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),''))
    INTO v_notice_count,v_notice_digest
  FROM demo_payment.story_notifications t;
  IF NOT EXISTS (
    SELECT 1 FROM story_notice_financial_guard g
    WHERE g.relation_name='demo_payment.story_notifications'
      AND g.row_count=v_notice_count AND g.content_digest=v_notice_digest
  ) THEN
    RAISE EXCEPTION 'Read-state action mutated the payment notice event table';
  END IF;
END;
$row_isolation$;

ROLLBACK;

DO $recovery$
BEGIN
  IF EXISTS (SELECT 1 FROM payment_sync.officer_story_notice_reads) THEN
    RAISE EXCEPTION 'Disposable receipt transaction did not roll back cleanly';
  END IF;
END;
$recovery$;
