-- Review-only WS02 synthetic Postgres17 ownership/receipt contract.
-- NOT the original migration, live SQL/Auth, or release approval.
-- Caller UUID MUST come from authenticated Edge auth.getUser, not browser input.
BEGIN;
DO $v$ BEGIN IF current_setting('server_version_num')::int < 170000
 THEN RAISE EXCEPTION 'POSTGRES_17_REQUIRED'; END IF; END $v$;
CREATE ROLE ws02_owner_anon NOLOGIN;
CREATE ROLE ws02_owner_auth NOLOGIN;
CREATE ROLE ws02_owner_engine NOLOGIN;
CREATE SCHEMA ws02_owner;
REVOKE ALL ON SCHEMA ws02_owner FROM PUBLIC;
GRANT USAGE ON SCHEMA ws02_owner TO ws02_owner_engine;
CREATE TABLE ws02_owner.owners(
 record_id uuid NOT NULL, assessment_year text NOT NULL,
 actor_id uuid NOT NULL, state text NOT NULL CHECK(state IN ('ACTIVE','REVOKED')),
 PRIMARY KEY(record_id,assessment_year)
);
CREATE TABLE ws02_owner.slots(
 actor_id uuid NOT NULL,record_id uuid NOT NULL,assessment_year text NOT NULL,
 idem_key text NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 contract_version text NOT NULL, state text NOT NULL CHECK(state IN ('RESERVED','FINALIZED')),
 receipt_hash text CHECK(receipt_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(actor_id,record_id,assessment_year,idem_key),
 FOREIGN KEY(record_id,assessment_year) REFERENCES ws02_owner.owners(record_id,assessment_year)
);
-- Disposable persisted evaluation proof; no production migration or legal authority.
CREATE TABLE ws02_owner.evaluation_logs(
 actor_id uuid NOT NULL,record_id uuid NOT NULL,assessment_year text NOT NULL,
 idem_key text NOT NULL,request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 receipt_hash text NOT NULL CHECK(receipt_hash ~ '^[a-f0-9]{64}$'),
 trace_hash text NOT NULL CHECK(trace_hash ~ '^[a-f0-9]{64}$'),
 result_state text NOT NULL CHECK(result_state IN ('CALCULATED','NEEDS_FACTS','FAIL_CLOSED')),
 audit_trace jsonb NOT NULL CHECK(jsonb_typeof(audit_trace)='object'),
 PRIMARY KEY(actor_id,record_id,assessment_year,idem_key),
 FOREIGN KEY(actor_id,record_id,assessment_year,idem_key)
 REFERENCES ws02_owner.slots(actor_id,record_id,assessment_year,idem_key)
);
ALTER TABLE ws02_owner.evaluation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ws02_owner.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE ws02_owner.slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA ws02_owner FROM PUBLIC;
GRANT SELECT ON ws02_owner.owners TO ws02_owner_engine;
GRANT SELECT,INSERT,UPDATE ON ws02_owner.slots TO ws02_owner_engine;
GRANT SELECT,INSERT ON ws02_owner.evaluation_logs TO ws02_owner_engine;
CREATE POLICY logs_engine_read ON ws02_owner.evaluation_logs FOR SELECT
 TO ws02_owner_engine USING (true);
CREATE POLICY logs_engine_insert ON ws02_owner.evaluation_logs FOR INSERT
 TO ws02_owner_engine WITH CHECK (true);
CREATE POLICY owners_engine_read ON ws02_owner.owners FOR SELECT
  TO ws02_owner_engine USING (true);
CREATE POLICY slots_engine_read ON ws02_owner.slots FOR SELECT
  TO ws02_owner_engine USING (true);
CREATE POLICY slots_engine_insert ON ws02_owner.slots FOR INSERT
  TO ws02_owner_engine WITH CHECK (true);
CREATE POLICY slots_engine_update ON ws02_owner.slots FOR UPDATE
  TO ws02_owner_engine USING (true) WITH CHECK (true);
CREATE FUNCTION ws02_owner.nbr_authorize_citizen_evaluation(
 p_auth_user_id uuid,p_taxpayer_record_id uuid,p_assessment_year text
) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=pg_catalog,ws02_owner AS $fn$
 SELECT p_auth_user_id IS NOT NULL AND p_taxpayer_record_id IS NOT NULL AND EXISTS(
 SELECT 1 FROM ws02_owner.owners o WHERE o.actor_id=p_auth_user_id
 AND o.record_id=p_taxpayer_record_id AND o.assessment_year=p_assessment_year
 AND o.state='ACTIVE');
$fn$;
CREATE FUNCTION ws02_owner.nbr_reserve_citizen_evaluation(
 p_auth_user_id uuid,p_taxpayer_record_id uuid,p_assessment_year text,
 p_idempotency_key text,p_request_hash text,p_contract_version text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,ws02_owner AS $fn$
DECLARE n integer; old_slot ws02_owner.slots%ROWTYPE;
BEGIN
 IF NOT ws02_owner.nbr_authorize_citizen_evaluation(
   p_auth_user_id,p_taxpayer_record_id,p_assessment_year) THEN
   RETURN jsonb_build_object('state','OWNER_DENIED'); END IF;
 IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$'
 OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$'
 OR p_contract_version IS DISTINCT FROM 'NBR_ENGINE_CITIZEN_V2_REVIEW' THEN
   RETURN jsonb_build_object('state','INVALID_CONTRACT'); END IF;
 INSERT INTO ws02_owner.slots(actor_id,record_id,assessment_year,idem_key,
 request_hash,contract_version,state) VALUES
 (p_auth_user_id,p_taxpayer_record_id,p_assessment_year,p_idempotency_key,
  p_request_hash,p_contract_version,'RESERVED')
 ON CONFLICT(actor_id,record_id,assessment_year,idem_key) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n=1 THEN RETURN jsonb_build_object('state','RESERVED'); END IF;
 SELECT * INTO old_slot FROM ws02_owner.slots
 WHERE actor_id=p_auth_user_id AND record_id=p_taxpayer_record_id
 AND assessment_year=p_assessment_year AND idem_key=p_idempotency_key;
 IF old_slot.request_hash IS DISTINCT FROM p_request_hash OR
 old_slot.contract_version IS DISTINCT FROM p_contract_version THEN
   RETURN jsonb_build_object('state','CONFLICT'); END IF;
 RETURN jsonb_build_object('state','REPLAY_NOT_ACCEPTED');
END $fn$;
CREATE FUNCTION ws02_owner.nbr_finalize_citizen_evaluation(
 p_auth_user_id uuid,p_taxpayer_record_id uuid,p_assessment_year text,
 p_idempotency_key text,p_request_hash text,p_receipt_hash text
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,ws02_owner AS $fn$
DECLARE n integer;
BEGIN
 IF NOT ws02_owner.nbr_authorize_citizen_evaluation(
   p_auth_user_id,p_taxpayer_record_id,p_assessment_year)
 OR p_receipt_hash IS NULL OR p_receipt_hash !~ '^[a-f0-9]{64}$' THEN
   RETURN false; END IF;
 UPDATE ws02_owner.slots SET state='FINALIZED',receipt_hash=p_receipt_hash
 WHERE actor_id=p_auth_user_id AND record_id=p_taxpayer_record_id
 AND assessment_year=p_assessment_year AND idem_key=p_idempotency_key
 AND request_hash=p_request_hash AND state='RESERVED'
 AND EXISTS(
  SELECT 1 FROM ws02_owner.evaluation_logs e
  WHERE e.actor_id=p_auth_user_id AND e.record_id=p_taxpayer_record_id
    AND e.assessment_year=p_assessment_year AND e.idem_key=p_idempotency_key
    AND e.request_hash=p_request_hash AND e.receipt_hash=p_receipt_hash
    AND e.result_state='CALCULATED'
 );
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END $fn$;
-- Isolated PostgreSQL-only all-or-nothing audit receipt commit.
CREATE FUNCTION ws02_owner.nbr_commit_evaluation_atomically(
 p_auth_user_id uuid,p_taxpayer_record_id uuid,p_assessment_year text,
 p_idempotency_key text,p_request_hash text,p_receipt_hash text,
 p_trace_hash text,p_result_state text,p_audit_trace jsonb
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,ws02_owner AS $atomic$
DECLARE slot ws02_owner.slots%ROWTYPE; affected integer;
BEGIN
 IF NOT ws02_owner.nbr_authorize_citizen_evaluation(
   p_auth_user_id,p_taxpayer_record_id,p_assessment_year)
 OR p_receipt_hash IS NULL OR p_receipt_hash !~ '^[0-9a-f]{64}$'
 OR p_trace_hash IS NULL OR p_trace_hash !~ '^[0-9a-f]{64}$'
 OR p_result_state NOT IN ('CALCULATED','NEEDS_FACTS','FAIL_CLOSED')
 OR p_result_state IS NULL OR p_audit_trace IS NULL
 OR jsonb_typeof(p_audit_trace) IS DISTINCT FROM 'object'
 OR octet_length(p_audit_trace::text)>262144
 OR p_audit_trace->>'actor_user_id' IS DISTINCT FROM p_auth_user_id::text
 OR p_audit_trace->>'taxpayer_record_id' IS DISTINCT FROM p_taxpayer_record_id::text
 OR p_audit_trace->>'assessment_year' IS DISTINCT FROM p_assessment_year
 OR p_audit_trace->>'authorized_request_hash' IS DISTINCT FROM p_request_hash
 OR p_audit_trace->>'receipt_hash' IS DISTINCT FROM p_receipt_hash
 OR p_audit_trace->>'idempotency_key' IS DISTINCT FROM p_idempotency_key
 OR p_audit_trace->>'result_status' IS DISTINCT FROM p_result_state
 OR p_audit_trace->>'contract_version' IS DISTINCT FROM 'NBR_ENGINE_CITIZEN_V2_REVIEW'
 THEN RETURN false; END IF;
 SELECT * INTO slot FROM ws02_owner.slots WHERE
 actor_id=p_auth_user_id AND record_id=p_taxpayer_record_id
 AND assessment_year=p_assessment_year AND idem_key=p_idempotency_key
 AND request_hash=p_request_hash AND state='RESERVED' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO ws02_owner.evaluation_logs(actor_id,record_id,assessment_year,
 idem_key,request_hash,receipt_hash,trace_hash,result_state,audit_trace) VALUES(
 p_auth_user_id,p_taxpayer_record_id,p_assessment_year,p_idempotency_key,
 p_request_hash,p_receipt_hash,p_trace_hash,p_result_state,p_audit_trace);
 UPDATE ws02_owner.slots SET state='FINALIZED',receipt_hash=p_receipt_hash
 WHERE actor_id=p_auth_user_id AND record_id=p_taxpayer_record_id
 AND assessment_year=p_assessment_year AND idem_key=p_idempotency_key
 AND request_hash=p_request_hash AND state='RESERVED';
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'ATOMIC_UPDATE_MISMATCH'; END IF;
 RETURN true;
END $atomic$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ws02_owner FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ws02_owner TO ws02_owner_engine;
INSERT INTO ws02_owner.owners(record_id,assessment_year,actor_id,state) VALUES
 ('50000000-0000-4000-8000-000000000001','2026-27',
  '60000000-0000-4000-8000-000000000001','ACTIVE'),
 ('50000000-0000-4000-8000-000000000002','2026-27',
  '60000000-0000-4000-8000-000000000002','ACTIVE'),
 ('50000000-0000-4000-8000-000000000003','2026-27',
  '60000000-0000-4000-8000-000000000003','REVOKED');
DO $test$
BEGIN
 IF has_schema_privilege('ws02_owner_anon','ws02_owner','USAGE') OR
 has_schema_privilege('ws02_owner_auth','ws02_owner','USAGE') OR
 has_function_privilege('ws02_owner_anon',
 'ws02_owner.nbr_authorize_citizen_evaluation(uuid,uuid,text)','EXECUTE') OR
 has_function_privilege('ws02_owner_auth',
 'ws02_owner.nbr_reserve_citizen_evaluation(uuid,uuid,text,text,text,text)','EXECUTE') OR
 has_table_privilege('ws02_owner_auth','ws02_owner.owners','SELECT') OR
 has_table_privilege('ws02_owner_auth','ws02_owner.evaluation_logs','SELECT') OR
 has_table_privilege('ws02_owner_engine','ws02_owner.evaluation_logs','UPDATE') THEN
 RAISE EXCEPTION 'UNPRIVILEGED_FUNCTION_OR_TABLE_ACCESS'; END IF;
END $test$;
SET LOCAL ROLE ws02_owner_engine;
DO $test$
DECLARE a uuid:='60000000-0000-4000-8000-000000000001';
 b uuid:='60000000-0000-4000-8000-000000000002';
 c uuid:='60000000-0000-4000-8000-000000000003';
 x uuid:='50000000-0000-4000-8000-000000000001';
 y uuid:='50000000-0000-4000-8000-000000000002';
 z uuid:='50000000-0000-4000-8000-000000000003';
 k text:='synthetic-idempotency-00001'; h text:=repeat('a',64);
 h2 text:=repeat('b',64);receipt text:=repeat('c',64);
 v text:='NBR_ENGINE_CITIZEN_V2_REVIEW'; r jsonb;
BEGIN
 IF NOT ws02_owner.nbr_authorize_citizen_evaluation(a,x,'2026-27') THEN
  RAISE EXCEPTION 'OWNER_FALSE_DENIAL'; END IF;
 IF ws02_owner.nbr_authorize_citizen_evaluation(b,x,'2026-27') OR
 ws02_owner.nbr_authorize_citizen_evaluation(a,y,'2026-27') OR
 ws02_owner.nbr_authorize_citizen_evaluation(a,x,'2027-28') OR
 ws02_owner.nbr_authorize_citizen_evaluation(c,z,'2026-27') THEN
  RAISE EXCEPTION 'WRONG_ACTOR_YEAR_OR_REVOKED_GRANTED'; END IF;
 r:=ws02_owner.nbr_reserve_citizen_evaluation(b,x,'2026-27',k,h,v);
 IF r->>'state' IS DISTINCT FROM 'OWNER_DENIED' THEN
  RAISE EXCEPTION 'WRONG_ACTOR_RESERVED'; END IF;
 r:=ws02_owner.nbr_reserve_citizen_evaluation(a,x,'2026-27','short',h,v);
 IF r->>'state' IS DISTINCT FROM 'INVALID_CONTRACT' THEN
  RAISE EXCEPTION 'BAD_IDEMPOTENCY_ACCEPTED'; END IF;
 r:=ws02_owner.nbr_reserve_citizen_evaluation(a,x,'2026-27',k,'bad-hash',v);
 IF r->>'state' IS DISTINCT FROM 'INVALID_CONTRACT' THEN
  RAISE EXCEPTION 'BAD_REQUEST_HASH_ACCEPTED'; END IF;
 r:=ws02_owner.nbr_reserve_citizen_evaluation(a,x,'2026-27',k,h,'UNAPPROVED');
 IF r->>'state' IS DISTINCT FROM 'INVALID_CONTRACT' THEN
  RAISE EXCEPTION 'UNPINNED_VERSION_ACCEPTED'; END IF;
 r:=ws02_owner.nbr_reserve_citizen_evaluation(a,x,'2026-27',k,h,v);
 IF r->>'state' IS DISTINCT FROM 'RESERVED' THEN
  RAISE EXCEPTION 'FIRST_RESERVATION_FAILED'; END IF;
 r:=ws02_owner.nbr_reserve_citizen_evaluation(a,x,'2026-27',k,h,v);
 IF r->>'state' IS DISTINCT FROM 'REPLAY_NOT_ACCEPTED' THEN
  RAISE EXCEPTION 'DUPLICATE_ACCEPTED'; END IF;
 r:=ws02_owner.nbr_reserve_citizen_evaluation(a,x,'2026-27',k,h2,v);
 IF r->>'state' IS DISTINCT FROM 'CONFLICT' THEN
  RAISE EXCEPTION 'CONFLICTING_REQUEST_ACCEPTED'; END IF;
 IF ws02_owner.nbr_finalize_citizen_evaluation(b,x,'2026-27',k,h,receipt) OR
 ws02_owner.nbr_finalize_citizen_evaluation(a,x,'2027-28',k,h,receipt) OR
 ws02_owner.nbr_finalize_citizen_evaluation(a,x,'2026-27',k,h2,receipt) OR
 ws02_owner.nbr_finalize_citizen_evaluation(a,x,'2026-27',k,h,'bad') THEN
  RAISE EXCEPTION 'INVALID_FINALIZATION_ACCEPTED'; END IF;
 IF ws02_owner.nbr_finalize_citizen_evaluation(a,x,'2026-27',k,h,receipt) THEN
  RAISE EXCEPTION 'FINALIZATION_WITHOUT_EVALUATION_LOG_ACCEPTED'; END IF;
 INSERT INTO ws02_owner.evaluation_logs(actor_id,record_id,assessment_year,
   idem_key,request_hash,receipt_hash,trace_hash,result_state,audit_trace)
 VALUES(a,x,'2026-27',k,h,receipt,repeat('d',64),'CALCULATED',
 jsonb_build_object('synthetic_control','legacy_log_bound_finalize'));
 IF ws02_owner.nbr_finalize_citizen_evaluation(a,x,'2026-27',k,h,h2) THEN
  RAISE EXCEPTION 'FINALIZATION_WITH_MISMATCHED_LOG_RECEIPT_ACCEPTED'; END IF;
 IF ws02_owner.nbr_finalize_citizen_evaluation(a,x,'2026-27',k,h2,receipt) THEN
  RAISE EXCEPTION 'FINALIZATION_WITH_MISMATCHED_LOG_REQUEST_ACCEPTED'; END IF;
 IF NOT ws02_owner.nbr_finalize_citizen_evaluation(a,x,'2026-27',k,h,receipt) THEN
  RAISE EXCEPTION 'VALID_FINALIZATION_DENIED'; END IF;
 IF ws02_owner.nbr_finalize_citizen_evaluation(a,x,'2026-27',k,h,receipt) THEN
  RAISE EXCEPTION 'DUPLICATE_FINALIZATION_ACCEPTED'; END IF;
 IF (SELECT count(*) FROM ws02_owner.evaluation_logs) <> 1 OR
 (SELECT receipt_hash FROM ws02_owner.evaluation_logs) IS DISTINCT FROM receipt THEN
  RAISE EXCEPTION 'EVALUATION_LOG_READBACK_MISMATCH'; END IF;
 IF (SELECT count(*) FROM ws02_owner.slots) <> 1 OR
 (SELECT state FROM ws02_owner.slots) IS DISTINCT FROM 'FINALIZED' OR
 (SELECT receipt_hash FROM ws02_owner.slots) IS DISTINCT FROM receipt THEN
  RAISE EXCEPTION 'RECEIPT_READBACK_MISMATCH'; END IF;
END $test$;
-- Caller identity and signed ownership inputs here are synthetic only.
-- Real taxpayer-record owner evidence is NOT available on the active database.
DO $atomic_test$
DECLARE actor uuid:='60000000-0000-4000-8000-000000000001';
 other uuid:='60000000-0000-4000-8000-000000000002';
 record uuid:='50000000-0000-4000-8000-000000000001';
 request_key text:='atomic-evaluation-key-00001';
 bad_key text:='atomic-evaluation-key-00002';
 reqhash text:=repeat('a',64); receipt text:=repeat('b',64);
 trace text:=repeat('c',64); result jsonb; audit jsonb;
BEGIN
 audit:=jsonb_build_object('actor_user_id',actor::text,
  'taxpayer_record_id',record::text,'assessment_year','2026-27','authorized_request_hash',reqhash,
  'receipt_hash',receipt,'idempotency_key',request_key,
  'result_status','NEEDS_FACTS',
  'contract_version','NBR_ENGINE_CITIZEN_V2_REVIEW');
 result:=ws02_owner.nbr_reserve_citizen_evaluation(actor,record,
  '2026-27',request_key,reqhash,'NBR_ENGINE_CITIZEN_V2_REVIEW');
 IF result->>'state' IS DISTINCT FROM 'RESERVED' THEN
  RAISE EXCEPTION 'ATOMIC_SETUP_FAILED'; END IF;
 IF ws02_owner.nbr_commit_evaluation_atomically(
  other,record,'2026-27',request_key,reqhash,receipt,trace,'NEEDS_FACTS',audit)
 OR ws02_owner.nbr_commit_evaluation_atomically(
  actor,record,'2027-28',request_key,reqhash,receipt,trace,'NEEDS_FACTS',audit)
 OR ws02_owner.nbr_commit_evaluation_atomically(
  actor,record,'2026-27',request_key,reqhash,'bad',trace,'NEEDS_FACTS',audit) THEN
  RAISE EXCEPTION 'ATOMIC_NEGATIVE_WAS_ACCEPTED'; END IF;
 IF ws02_owner.nbr_commit_evaluation_atomically(
 actor,record,'2026-27',request_key,reqhash,receipt,trace,'NEEDS_FACTS',
 audit||jsonb_build_object('actor_user_id',other::text)) THEN
 RAISE EXCEPTION 'SPOOFED_AUDIT_OWNER_ACCEPTED'; END IF;
 IF ws02_owner.nbr_commit_evaluation_atomically(
 actor,record,'2026-27',request_key,reqhash,receipt,trace,'NEEDS_FACTS',
 audit||jsonb_build_object('assessment_year','2027-28')) OR
 ws02_owner.nbr_commit_evaluation_atomically(
 actor,record,'2026-27',request_key,reqhash,receipt,trace,'NEEDS_FACTS',
 audit-'assessment_year') THEN
 RAISE EXCEPTION 'SPOOFED_OR_MISSING_AUDIT_ASSESSMENT_YEAR_ACCEPTED'; END IF;
 IF (SELECT count(*) FROM ws02_owner.evaluation_logs
  WHERE idem_key=request_key)<>0 THEN
  RAISE EXCEPTION 'FAILED_ATOMIC_CALL_LEFT_A_LOG'; END IF;
 IF NOT ws02_owner.nbr_commit_evaluation_atomically(
  actor,record,'2026-27',request_key,reqhash,receipt,trace,'NEEDS_FACTS',audit) THEN
  RAISE EXCEPTION 'VALID_ATOMIC_FINALIZATION_DENIED'; END IF;
 IF ws02_owner.nbr_commit_evaluation_atomically(
  actor,record,'2026-27',request_key,reqhash,receipt,trace,'NEEDS_FACTS',audit) THEN
  RAISE EXCEPTION 'DUPLICATE_ATOMIC_FINALIZATION'; END IF;
 IF (SELECT count(*) FROM ws02_owner.evaluation_logs
  WHERE idem_key=request_key)<>1 OR
 (SELECT state FROM ws02_owner.slots WHERE idem_key=request_key)
 IS DISTINCT FROM 'FINALIZED' OR
 (SELECT receipt_hash FROM ws02_owner.slots WHERE idem_key=request_key)
 IS DISTINCT FROM receipt OR
 (SELECT result_state FROM ws02_owner.evaluation_logs WHERE idem_key=request_key)
 IS DISTINCT FROM 'NEEDS_FACTS' OR
 (SELECT audit_trace FROM ws02_owner.evaluation_logs WHERE idem_key=request_key)
 IS DISTINCT FROM audit THEN
  RAISE EXCEPTION 'ATOMIC_RECEIPT_READBACK_MISMATCH'; END IF;
 result:=ws02_owner.nbr_reserve_citizen_evaluation(actor,record,
  '2026-27',bad_key,reqhash,'NBR_ENGINE_CITIZEN_V2_REVIEW');
 IF result->>'state' IS DISTINCT FROM 'RESERVED' THEN
  RAISE EXCEPTION 'ATOMIC_EXCEPTION_SETUP_FAILED'; END IF;
 INSERT INTO ws02_owner.evaluation_logs(actor_id,record_id,assessment_year,
  idem_key,request_hash,receipt_hash,trace_hash,result_state,audit_trace)
 VALUES(actor,record,'2026-27',bad_key,reqhash,repeat('d',64),trace,'CALCULATED',
 audit||jsonb_build_object('receipt_hash',repeat('d',64),
 'idempotency_key',bad_key,'result_status','CALCULATED'));
 BEGIN
  PERFORM ws02_owner.nbr_commit_evaluation_atomically(
  actor,record,'2026-27',bad_key,reqhash,receipt,trace,'NEEDS_FACTS',audit||jsonb_build_object('idempotency_key',bad_key));
  RAISE EXCEPTION 'UNIQUE_VIOLATION_NOT_RAISED';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 IF (SELECT state FROM ws02_owner.slots WHERE idem_key=bad_key)
 IS DISTINCT FROM 'RESERVED' OR
 (SELECT receipt_hash FROM ws02_owner.slots WHERE idem_key=bad_key)
 IS NOT NULL OR
 (SELECT receipt_hash FROM ws02_owner.evaluation_logs WHERE idem_key=bad_key)
 IS DISTINCT FROM repeat('d',64) THEN
  RAISE EXCEPTION 'ATOMIC_ERROR_PATH_MODIFIED_EXISTING_STATE'; END IF;
END $atomic_test$;
-- Owner revocation BETWEEN reserve and atomic commit must fail closed.
-- This models a source-record revocation, NOT a JWT revocation or signed Auth test.
DO $revocation_reserve$
DECLARE actor uuid:='60000000-0000-4000-8000-000000000001';
 record uuid:='50000000-0000-4000-8000-000000000001';
 r jsonb;
BEGIN
 r:=ws02_owner.nbr_reserve_citizen_evaluation(
 actor,record,'2026-27','revoked-after-reserve-00001',
 repeat('a',64),'NBR_ENGINE_CITIZEN_V2_REVIEW');
 IF r->>'state' IS DISTINCT FROM 'RESERVED' THEN
  RAISE EXCEPTION 'REVOCATION_RESERVATION_SETUP_FAILED'; END IF;
END $revocation_reserve$;
RESET ROLE;
UPDATE ws02_owner.owners SET state='REVOKED'
 WHERE record_id='50000000-0000-4000-8000-000000000001'
 AND assessment_year='2026-27';
SET LOCAL ROLE ws02_owner_engine;
DO $revocation_denial$
DECLARE actor uuid:='60000000-0000-4000-8000-000000000001';
 record uuid:='50000000-0000-4000-8000-000000000001';
 k text:='revoked-after-reserve-00001'; r jsonb;
 audit jsonb:=jsonb_build_object(
 'actor_user_id',actor::text,'taxpayer_record_id',record::text,'assessment_year','2026-27',
 'authorized_request_hash',repeat('a',64),
 'receipt_hash',repeat('b',64),'idempotency_key',k,
 'result_status','FAIL_CLOSED',
 'contract_version','NBR_ENGINE_CITIZEN_V2_REVIEW');
BEGIN
 IF ws02_owner.nbr_authorize_citizen_evaluation(actor,record,'2026-27') THEN
  RAISE EXCEPTION 'REVOKED_OWNER_STILL_AUTHORIZED'; END IF;
 r:=ws02_owner.nbr_reserve_citizen_evaluation(actor,record,
 '2026-27',k,repeat('a',64),'NBR_ENGINE_CITIZEN_V2_REVIEW');
 IF r->>'state' IS DISTINCT FROM 'OWNER_DENIED' THEN
  RAISE EXCEPTION 'REVOKED_OWNER_RESERVE_ACCEPTED'; END IF;
 IF ws02_owner.nbr_commit_evaluation_atomically(
 actor,record,'2026-27',k,repeat('a',64),repeat('b',64),
 repeat('c',64),'FAIL_CLOSED',audit) OR
 ws02_owner.nbr_finalize_citizen_evaluation(
 actor,record,'2026-27',k,repeat('a',64),repeat('b',64)) THEN
  RAISE EXCEPTION 'REVOKED_OWNER_RECEIPT_ACCEPTED'; END IF;
 IF (SELECT count(*) FROM ws02_owner.evaluation_logs WHERE idem_key=k)<>0 OR
 (SELECT state FROM ws02_owner.slots WHERE idem_key=k)
 IS DISTINCT FROM 'RESERVED' OR
 (SELECT receipt_hash FROM ws02_owner.slots WHERE idem_key=k) IS NOT NULL THEN
  RAISE EXCEPTION 'REVOKED_OWNER_CHANGED_AUDIT_OR_SLOT'; END IF;
END $revocation_denial$;
RESET ROLE;
UPDATE ws02_owner.owners SET state='ACTIVE'
 WHERE record_id='50000000-0000-4000-8000-000000000001'
 AND assessment_year='2026-27';
SET LOCAL ROLE ws02_owner_engine;
DO $revocation_recovery$
DECLARE actor uuid:='60000000-0000-4000-8000-000000000001';
 record uuid:='50000000-0000-4000-8000-000000000001';
 k text:='revoked-after-reserve-00001';
 audit jsonb:=jsonb_build_object(
 'actor_user_id',actor::text,'taxpayer_record_id',record::text,'assessment_year','2026-27',
 'authorized_request_hash',repeat('a',64),
 'receipt_hash',repeat('b',64),'idempotency_key',k,
 'result_status','FAIL_CLOSED',
 'contract_version','NBR_ENGINE_CITIZEN_V2_REVIEW');
BEGIN
 IF NOT ws02_owner.nbr_commit_evaluation_atomically(
 actor,record,'2026-27',k,repeat('a',64),repeat('b',64),
 repeat('c',64),'FAIL_CLOSED',audit) THEN
  RAISE EXCEPTION 'RESTORED_OWNER_ATOMIC_COMMIT_FAILED'; END IF;
 IF ws02_owner.nbr_commit_evaluation_atomically(
 actor,record,'2026-27',k,repeat('a',64),repeat('b',64),
 repeat('c',64),'FAIL_CLOSED',audit) THEN
  RAISE EXCEPTION 'RESTORED_OWNER_DUPLICATE_COMMIT_ACCEPTED'; END IF;
 IF (SELECT count(*) FROM ws02_owner.evaluation_logs WHERE idem_key=k)<>1 OR
 (SELECT state FROM ws02_owner.slots WHERE idem_key=k)
 IS DISTINCT FROM 'FINALIZED' OR
 (SELECT audit_trace FROM ws02_owner.evaluation_logs WHERE idem_key=k)
 IS DISTINCT FROM audit THEN
  RAISE EXCEPTION 'RESTORED_OWNER_RECEIPT_READBACK_FAILED'; END IF;
END $revocation_recovery$;
RESET ROLE;
-- Verify actual SQL privilege denial for untrusted synthetic API roles.
-- These roles are NOT authenticated Supabase JWT principals or a public RPC wrapper.
DO $privilege_preflight$
DECLARE r name; f text;
BEGIN
 FOREACH r IN ARRAY ARRAY['ws02_owner_anon','ws02_owner_auth'] LOOP
  IF has_schema_privilege(r,'ws02_owner','USAGE')
     OR has_table_privilege(r,'ws02_owner.owners','SELECT')
     OR has_table_privilege(r,'ws02_owner.slots','INSERT')
     OR has_table_privilege(r,'ws02_owner.evaluation_logs','SELECT') THEN
   RAISE EXCEPTION 'UNTRUSTED_ROLE_PRIVATE_SCHEMA_OR_TABLE_GRANT_%',r;
  END IF;
  FOREACH f IN ARRAY ARRAY[
   'ws02_owner.nbr_authorize_citizen_evaluation(uuid,uuid,text)',
   'ws02_owner.nbr_reserve_citizen_evaluation(uuid,uuid,text,text,text,text)',
   'ws02_owner.nbr_finalize_citizen_evaluation(uuid,uuid,text,text,text,text)',
   'ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'
  ] LOOP
   IF has_function_privilege(r,f,'EXECUTE') THEN
    RAISE EXCEPTION 'UNTRUSTED_ROLE_RPC_EXECUTE_GRANTED_%_%',r,f;
   END IF;
  END LOOP;
 END LOOP;
END $privilege_preflight$;
SET ROLE ws02_owner_anon;
DO $anon_denial$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM ws02_owner.nbr_authorize_citizen_evaluation(
   '60000000-0000-4000-8000-000000000001'::uuid,
   '50000000-0000-4000-8000-000000000001'::uuid,'2026-27');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'DIRECT_UNTRUSTED_RPC_EXECUTION_ANON'; END IF;
END $anon_denial$;
RESET ROLE;
SET ROLE ws02_owner_auth;
DO $auth_denial$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM ws02_owner.nbr_commit_evaluation_atomically(
   '60000000-0000-4000-8000-000000000001'::uuid,
   '50000000-0000-4000-8000-000000000001'::uuid,
   '2026-27','untrusted-actor-00001',repeat('a',64),repeat('b',64),
   repeat('c',64),'CALCULATED','{}'::jsonb);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'DIRECT_UNTRUSTED_RPC_EXECUTION_AUTH'; END IF;
END $auth_denial$;
RESET ROLE;
ROLLBACK;
SELECT 'DISPOSABLE_WS02_OWNER_RESERVE_LOG_BOUND_FINALIZE_PASS_ONLY' AS result;
