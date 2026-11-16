-- Disposable-only 205 eligible-event offline recovery and cursor integrity contract.
-- All fixture-origin records remain stored but are excluded from the officer bell.
BEGIN;

INSERT INTO demo_payment.story_payments(
  id,session_id,service_code,amount_minor,data,status,created_at
)
SELECT
  ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'TAX_WITH_RETURN',10000+n,
  pg_catalog.jsonb_build_object('origin','TAXPAY_UI',
    'details',pg_catalog.jsonb_build_object('payerId','user1','payerName','Synthetic notice recovery')),
  'SIMULATED_SUCCESS','2026-11-13 00:00:00+00'::timestamptz+n*interval '1 second'
FROM generate_series(1,205) AS rows(n);

INSERT INTO demo_payment.story_payments(
  id,session_id,service_code,amount_minor,data,status,created_at
) VALUES
  ('70000000-0000-4000-8000-000000000206','71000000-0000-4000-8000-000000000206',
   'ADVANCE_TAX',20600,
   '{"origin":"TAXPAY_SQL_FIXTURE","details":{"sampleOnly":true,"fixtureBatch":"TAXPAY-20261107-30-PROFILE-COVERAGE","payerId":"user1","payerName":"Approved synthetic fixture"}}',
   'SIMULATED_SUCCESS','2026-11-13 00:04:00+00'),
  ('70000000-0000-4000-8000-000000000207','71000000-0000-4000-8000-000000000207',
   'ADVANCE_TAX',20700,
   '{"origin":"TAXPAY_SQL_FIXTURE","details":{"sampleOnly":true,"fixtureBatch":"UNAPPROVED-BATCH","payerId":"user1","payerName":"Must remain hidden"}}',
   'SIMULATED_SUCCESS','2026-11-13 00:04:01+00');

INSERT INTO demo_payment.story_notifications(id,payment_id,event_type,created_at)
OVERRIDING SYSTEM VALUE
SELECT 9007199254740992::bigint+n,
  ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'NEW_SIMULATED_PAYMENT','2026-11-13 00:00:00+00'::timestamptz+n*interval '1 second'
FROM generate_series(1,205) AS rows(n);
INSERT INTO demo_payment.story_notifications(id,payment_id,event_type,created_at)
OVERRIDING SYSTEM VALUE
VALUES
  (9007199254741199,'70000000-0000-4000-8000-000000000206','NEW_SIMULATED_PAYMENT','2026-11-13 00:04:00+00'),
  (9007199254741198,'70000000-0000-4000-8000-000000000207','NEW_SIMULATED_PAYMENT','2026-11-13 00:04:01+00');

CREATE TEMP TABLE notice_recovery_prestate ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM demo_payment.story_payments) AS payment_count,
  (SELECT count(*) FROM demo_payment.story_notifications) AS notice_count,
  (SELECT md5(COALESCE(string_agg(id::text||':'||amount_minor::text||':'||status, E'\n' ORDER BY id),'')) FROM demo_payment.story_payments) AS payment_digest,
  (SELECT md5(COALESCE(string_agg(id::text||':'||payment_id::text||':'||event_type, E'\n' ORDER BY id),'')) FROM demo_payment.story_notifications) AS notice_digest;

DO $permissions$
BEGIN
  IF has_function_privilege('anon',
       'public.demo_story1_office_notice_page(bigint,integer)'::regprocedure,'EXECUTE')
     OR NOT has_function_privilege('authenticated',
       'public.demo_story1_office_notice_page(bigint,integer)'::regprocedure,'EXECUTE')
     OR has_table_privilege('anon','demo_payment.story_payments','SELECT')
     OR has_table_privilege('anon','demo_payment.story_notifications','SELECT')
  THEN
    RAISE EXCEPTION 'Notice page function grants or base-table RLS boundary are incorrect';
  END IF;
END;
$permissions$;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000011',true);
DO $page_contract$
DECLARE
  v_first jsonb;
  v_first_retry jsonb;
  v_second jsonb;
  v_third jsonb;
  v_empty jsonb;
  v_item jsonb;
  v_ids bigint;
  v_distinct_ids bigint;
BEGIN
  BEGIN
    PERFORM public.demo_story1_office_notice_page(-1,100);
    RAISE EXCEPTION 'TEST_NEGATIVE_CURSOR_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='TEST_NEGATIVE_CURSOR_ACCEPTED' THEN RAISE; END IF;
    IF SQLERRM IS DISTINCT FROM 'INVALID_PAGINATION' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.demo_story1_office_notice_page(0,101);
    RAISE EXCEPTION 'TEST_OVERSIZED_PAGE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='TEST_OVERSIZED_PAGE_ACCEPTED' THEN RAISE; END IF;
    IF SQLERRM IS DISTINCT FROM 'INVALID_PAGINATION' THEN RAISE; END IF;
  END;

  v_first:=public.demo_story1_office_notice_page(0,100);
  v_first_retry:=public.demo_story1_office_notice_page(0,100);
  v_second:=public.demo_story1_office_notice_page((v_first->>'nextAfterId')::bigint,100);
  v_third:=public.demo_story1_office_notice_page((v_second->>'nextAfterId')::bigint,100);

  IF v_first_retry IS DISTINCT FROM v_first
     OR jsonb_array_length(v_first->'items')<>100
     OR v_first->>'nextAfterId'<>'9007199254741092'
     OR v_first->>'hasMore'<>'true'
     OR jsonb_array_length(v_second->'items')<>100
     OR v_second->>'nextAfterId'<>'9007199254741192'
     OR v_second->>'hasMore'<>'true'
     OR jsonb_array_length(v_third->'items')<>5
     OR v_third->>'nextAfterId'<>'9007199254741197'
     OR v_third->>'hasMore'<>'false'
  THEN
    RAISE EXCEPTION 'Cursor pages or deterministic retry did not preserve all available events';
  END IF;

  SELECT value INTO v_item
  FROM jsonb_array_elements(v_first->'items') AS items(value)
  ORDER BY (value->>'id')::numeric
  LIMIT 1;
  IF v_item->>'id'<>'9007199254740993'
     OR v_item->>'paymentId'<>'70000000-0000-4000-8000-000000000001'
     OR v_item->'payment'->>'id' IS DISTINCT FROM v_item->>'paymentId'
     OR v_item->'payment'->>'service'<>'TAX_WITH_RETURN'
     OR v_item->'payment'->>'amountMinor'<>'10001'
     OR v_item->'payment'->>'status'<>'SIMULATED_SUCCESS'
     OR (v_item->'payment'->>'createdAt')::timestamptz<>'2026-11-13 00:00:01+00'::timestamptz
     OR (v_item->>'createdAt')::timestamptz<>'2026-11-13 00:00:01+00'::timestamptz
     OR (v_item->'payment') ?| ARRAY['payerId','taxpayerTin','addressBook','lines','note']
  THEN
    RAISE EXCEPTION 'Notice did not carry exact, privacy-minimized parent metadata';
  END IF;

  SELECT count(*),count(DISTINCT id::numeric)
  INTO v_ids,v_distinct_ids
  FROM (
    SELECT value->>'id' AS id FROM jsonb_array_elements(v_first->'items') AS p(value)
    UNION ALL
    SELECT value->>'id' AS id FROM jsonb_array_elements(v_second->'items') AS p(value)
    UNION ALL
    SELECT value->>'id' AS id FROM jsonb_array_elements(v_third->'items') AS p(value)
  ) all_items;
  IF v_ids<>205 OR v_distinct_ids<>205
     OR EXISTS(
       SELECT 1 FROM jsonb_array_elements(v_third->'items') AS p(value)
       WHERE value->>'id'='9007199254741198'
     )
     OR EXISTS(
       SELECT 1 FROM jsonb_array_elements(v_third->'items') AS p(value)
       WHERE value->>'id'='9007199254741199'
     )
     OR NOT EXISTS(
       SELECT 1 FROM jsonb_array_elements(v_third->'items') AS p(value)
       WHERE value->>'id'='9007199254741197'
     )
  THEN
    RAISE EXCEPTION 'Pagination duplicated, omitted, or exposed a filtered notice';
  END IF;

  v_empty:=public.demo_story1_office_notice_page(9223372036854775807::bigint,100);
  IF jsonb_array_length(v_empty->'items')<>0
     OR v_empty->>'hasMore'<>'false'
     OR v_empty->>'nextAfterId'<>'9223372036854775807'
  THEN
    RAISE EXCEPTION 'Empty terminal cursor did not remain stable';
  END IF;

  BEGIN
    PERFORM 1 FROM demo_payment.story_notifications LIMIT 1;
    RAISE EXCEPTION 'TEST_DIRECT_TABLE_READ_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$page_contract$;
RESET ROLE;

-- An unauthenticated caller cannot enumerate even sanitized synthetic events.
SET LOCAL ROLE anon;
DO $anon_denied$
BEGIN
  BEGIN
    PERFORM public.demo_story1_office_notice_page(0,100);
    RAISE EXCEPTION 'UNAUTHORIZED_CURSOR_ACCEPTED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$anon_denied$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000014',true);
DO $viewer_denied$
BEGIN
  BEGIN
    PERFORM public.demo_story1_office_notice_page(0,100);
    RAISE EXCEPTION 'NONPAYMENT_ROLE_ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'Active payment officer role required' THEN RAISE; END IF;
  END;
END;
$viewer_denied$;
RESET ROLE;

DO $read_only$
DECLARE
  v_actual record;
  v_expected record;
BEGIN
  SELECT * INTO v_actual FROM notice_recovery_prestate;
  SELECT
    (SELECT count(*) FROM demo_payment.story_payments) AS payment_count,
    (SELECT count(*) FROM demo_payment.story_notifications) AS notice_count,
    (SELECT md5(COALESCE(string_agg(id::text||':'||amount_minor::text||':'||status, E'\n' ORDER BY id),'')) FROM demo_payment.story_payments) AS payment_digest,
    (SELECT md5(COALESCE(string_agg(id::text||':'||payment_id::text||':'||event_type, E'\n' ORDER BY id),'')) FROM demo_payment.story_notifications) AS notice_digest
  INTO v_expected;
  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Read-only notice query changed payment or notice rows';
  END IF;
END;
$read_only$;

ROLLBACK;
