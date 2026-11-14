-- WS3/WS2 integrated cursor -> signed-in officer read/ack, 235 bigint IDs.
-- Standalone disposable Office PostgreSQL; all inserted state rolls back.
BEGIN;
INSERT INTO demo_payment.story_payments(id,service_code,amount_minor,status,data,created_at)
SELECT ('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'ADVANCE_TAX',10000+n,'SIMULATED_SUCCESS',
  jsonb_build_object('origin','TAXPAY_UI','details',
    jsonb_build_object('payerId','user1','payerName','WS3 isolated notice')),
  '2026-11-14 00:00:00+00'::timestamptz+n*interval '1 second'
FROM generate_series(1,235) rows(n);
INSERT INTO demo_payment.story_payments(id,service_code,amount_minor,status,data,created_at) VALUES
 ('90000000-0000-4000-8000-000000000236','ADVANCE_TAX',10236,'SIMULATED_SUCCESS',
  '{"origin":"TAXPAY_SQL_FIXTURE","details":{"sampleOnly":true,"fixtureBatch":"TAXPAY-20261107-30-PROFILE-COVERAGE","payerId":"user1"}}'::jsonb,'2026-11-14 00:04:00+00'),
 ('90000000-0000-4000-8000-000000000237','ADVANCE_TAX',10237,'SIMULATED_SUCCESS',
  '{"origin":"TAXPAY_UI","details":{"payerId":"user1"}}'::jsonb,'2026-11-14 00:04:01+00'),
 ('90000000-0000-4000-8000-000000000238','ADVANCE_TAX',10238,'SIMULATED_SUCCESS',
  '{"origin":"TAXPAY_UI","details":{"payerId":"user1","payerName":"Taxpayer / withholding agent","taxpayerTin":"123456789012"}}'::jsonb,'2026-10-18 06:54:00+00'),
 ('90000000-0000-4000-8000-000000000239','ADVANCE_TAX',10239,'SIMULATED_SUCCESS',
  '{"origin":"TAXPAY_SQL_FIXTURE","details":{"sampleOnly":true,"fixtureBatch":"UNAPPROVED-BATCH","payerId":"user1"}}'::jsonb,'2026-11-14 00:04:03+00');
INSERT INTO demo_payment.story_notifications(id,payment_id,event_type,created_at) OVERRIDING SYSTEM VALUE
SELECT 9007199254742000::bigint+n,
  ('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'NEW_SIMULATED_PAYMENT','2026-11-14 00:00:00+00'::timestamptz+n*interval '1 second'
FROM generate_series(1,235) rows(n);
INSERT INTO demo_payment.story_notifications(id,payment_id,event_type,created_at) OVERRIDING SYSTEM VALUE VALUES
 (9007199254742236,'90000000-0000-4000-8000-000000000236','NEW_SIMULATED_PAYMENT','2026-11-14 00:04:00+00'),
 (9007199254742237,'90000000-0000-4000-8000-000000000237','OFFICE_AUDIT_EVENT','2026-11-14 00:04:01+00'),
 (9007199254742238,'90000000-0000-4000-8000-000000000238','NEW_SIMULATED_PAYMENT','2026-10-18 06:54:00+00'),
 (9007199254742239,'90000000-0000-4000-8000-000000000239','NEW_SIMULATED_PAYMENT','2026-11-14 00:04:03+00');
CREATE TEMP TABLE ws3_before AS
SELECT (SELECT count(*) FROM demo_payment.story_payments) AS payment_count,
       (SELECT count(*) FROM demo_payment.story_notifications) AS notice_count,
       (SELECT md5(string_agg(md5(row_to_json(p)::text),'' ORDER BY row_to_json(p)::text)) FROM demo_payment.story_payments p) AS payment_sha,
       (SELECT md5(string_agg(md5(row_to_json(n)::text),'' ORDER BY row_to_json(n)::text)) FROM demo_payment.story_notifications n) AS notice_sha;
DO $access$
BEGIN
 IF NOT has_function_privilege('anon','public.demo_story1_office_notice_page(bigint,integer)','EXECUTE')
 OR has_function_privilege('anon','public.payment_v1_office_story_notice_read_state(text[])','EXECUTE')
 OR has_function_privilege('anon','public.payment_v1_office_set_story_notice_read(text,boolean)','EXECUTE')
 OR has_table_privilege('authenticated','payment_sync.officer_story_notice_reads','SELECT')
 THEN RAISE EXCEPTION 'Client grants crossed Office read-state privacy boundary'; END IF;
END;
$access$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000011',true);
DO $maker$
DECLARE
 v_after bigint:=9007199254742000;v_page jsonb;v_states jsonb;v_ids text[];
 v_id text;v_total integer:=0;v_expected integer;v_seen text[]:=ARRAY[]::text[];
BEGIN
 FOR i IN 1..3 LOOP
  v_page:=public.demo_story1_office_notice_page(v_after,100);
  v_expected:=CASE WHEN i=3 THEN 35 ELSE 100 END;
  IF jsonb_array_length(v_page->'items')<>v_expected
    OR (v_page->>'hasMore')::boolean IS DISTINCT FROM (i<3)
  THEN RAISE EXCEPTION 'Cursor pagination failed batch %',i; END IF;
  SELECT array_agg(value->>'id' ORDER BY (value->>'id')::numeric) INTO v_ids
    FROM jsonb_array_elements(v_page->'items') item(value);
  IF cardinality(v_ids)<>v_expected THEN RAISE EXCEPTION 'Incomplete IDs'; END IF;
  IF EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_page->'items') item(value)
    WHERE value->>'type'<>'NEW_SIMULATED_PAYMENT'
       OR value->'payment'->>'id'<>value->>'paymentId'
       OR value->'payment'->>'amountMinor' IS NULL
       OR value->'payment' ?| ARRAY['payerId','taxpayerTin','addressBook','lines','passportNumber']
  ) THEN RAISE EXCEPTION 'Wrong payment/source attribution or privacy leak'; END IF;
  v_states:=public.payment_v1_office_story_notice_read_state(v_ids);
  IF jsonb_array_length(v_states)<>v_expected OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_states) item(value)
    WHERE (value->>'isRead')::boolean IS DISTINCT FROM false
       OR NOT (value->>'noticeId'=ANY(v_ids))
  ) THEN RAISE EXCEPTION 'Cursor contains a notice ineligible for the same Officer'; END IF;
  FOREACH v_id IN ARRAY v_ids LOOP
    IF public.payment_v1_office_set_story_notice_read(v_id,true)
        IS DISTINCT FROM jsonb_build_object('noticeId',v_id,'isRead',true)
    THEN RAISE EXCEPTION 'Cursor notice could not be acknowledged: %',v_id; END IF;
  END LOOP;
  v_states:=public.payment_v1_office_story_notice_read_state(v_ids);
  IF jsonb_array_length(v_states)<>v_expected OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_states) item(value)
    WHERE (value->>'isRead')::boolean IS DISTINCT FROM true
  ) THEN RAISE EXCEPTION 'Read state missing after refresh'; END IF;
  v_seen:=v_seen||v_ids;
  v_total:=v_total+v_expected;
  v_after:=(v_page->>'nextAfterId')::bigint;
 END LOOP;
 IF v_total<>235 OR v_after<>9007199254742235
    OR (SELECT count(DISTINCT id) FROM unnest(v_seen) id)<>235
    OR jsonb_array_length(public.demo_story1_office_notice_page(v_after,100)->'items')<>0
 THEN RAISE EXCEPTION '235-event cursor lost, duplicated, rounded or leaked excluded IDs'; END IF;
 FOREACH v_id IN ARRAY ARRAY['9007199254742236','9007199254742237','9007199254742238','9007199254742239']::text[] LOOP
  BEGIN
   PERFORM public.payment_v1_office_story_notice_read_state(ARRAY[v_id]);
   RAISE EXCEPTION 'TEST_INELIGIBLE_READ_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'Office payment notice not found' THEN RAISE; END IF;
  END;
  BEGIN
   PERFORM public.payment_v1_office_set_story_notice_read(v_id,true);
   RAISE EXCEPTION 'TEST_INELIGIBLE_ACK_ALLOWED';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM<>'Office payment notice not found' THEN RAISE; END IF;
  END;
 END LOOP;
 IF public.payment_v1_office_set_story_notice_read('9007199254742001',true)
   IS DISTINCT FROM '{"noticeId":"9007199254742001","isRead":true}'::jsonb
 THEN RAISE EXCEPTION 'Duplicate ACK lost bigint precision'; END IF;
END;
$maker$;
SELECT set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000012',true);
DO $reviewer$
DECLARE v_page jsonb;v_ids text[];v_state jsonb;
BEGIN
 v_page:=public.demo_story1_office_notice_page(9007199254742000,100);
 SELECT array_agg(value->>'id') INTO v_ids FROM jsonb_array_elements(v_page->'items') item(value);
 v_state:=public.payment_v1_office_story_notice_read_state(v_ids);
 IF jsonb_array_length(v_state)<>100 OR EXISTS(
  SELECT 1 FROM jsonb_array_elements(v_state) item(value)
  WHERE (value->>'isRead')::boolean IS DISTINCT FROM false
 ) THEN RAISE EXCEPTION 'Maker read state leaked into Reviewer'; END IF;
 PERFORM public.payment_v1_office_set_story_notice_read('9007199254742001',true);
END;
$reviewer$;
SELECT set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000014',true);
DO $viewer$
BEGIN
 BEGIN
  PERFORM public.payment_v1_office_story_notice_read_state(ARRAY['9007199254742001']);
  RAISE EXCEPTION 'TEST_VIEWER_READ_ALLOWED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'Active payment officer role required' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.payment_v1_office_set_story_notice_read('9007199254742001',true);
  RAISE EXCEPTION 'TEST_VIEWER_ACK_ALLOWED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'Active payment officer role required' THEN RAISE; END IF;
 END;
END;
$viewer$;
RESET ROLE;
UPDATE payment_sync.officer_roles SET active=false
  WHERE user_uid='80000000-0000-4000-8000-000000000011';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000011',true);
DO $revoked$
BEGIN
 BEGIN
  PERFORM public.payment_v1_office_story_notice_read_state(ARRAY['9007199254742001']);
  RAISE EXCEPTION 'TEST_REVOKED_READ_ALLOWED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'Active payment officer role required' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.payment_v1_office_set_story_notice_read('9007199254742001',false);
  RAISE EXCEPTION 'TEST_REVOKED_ACK_ALLOWED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'Active payment officer role required' THEN RAISE; END IF;
 END;
END;
$revoked$;
RESET ROLE;
DO $immutable$
DECLARE v_p bigint;v_n bigint;v_pd text;v_nd text;
BEGIN
 SELECT count(*),md5(string_agg(md5(row_to_json(p)::text),'' ORDER BY row_to_json(p)::text))
 INTO v_p,v_pd FROM demo_payment.story_payments p;
 SELECT count(*),md5(string_agg(md5(row_to_json(n)::text),'' ORDER BY row_to_json(n)::text))
 INTO v_n,v_nd FROM demo_payment.story_notifications n;
 IF NOT EXISTS(SELECT 1 FROM ws3_before
    WHERE payment_count=v_p AND notice_count=v_n AND payment_sha=v_pd AND notice_sha=v_nd)
 OR (SELECT count(*) FROM payment_sync.officer_story_notice_reads
     WHERE officer_uid='80000000-0000-4000-8000-000000000011')<>235
 OR (SELECT count(*) FROM payment_sync.officer_story_notice_reads
     WHERE officer_uid='80000000-0000-4000-8000-000000000012')<>1
 OR EXISTS(SELECT 1 FROM payment_sync.officer_story_notice_reads
     WHERE notice_id IN (9007199254742236,9007199254742237,9007199254742238,9007199254742239))
 THEN RAISE EXCEPTION 'Payment history, source event, read isolation or ACK deduplication failed'; END IF;
 RAISE NOTICE 'PASS: 235 bigint events in 100/100/35 cursor pages; all same-officer read+ACK, excluded fixtures/event types, role revocation, account isolation, retries, immutable parents';
END;
$immutable$;
ROLLBACK;
