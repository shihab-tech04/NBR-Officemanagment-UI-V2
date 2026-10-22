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
ALTER TABLE ws02_owner.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE ws02_owner.slots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA ws02_owner FROM PUBLIC;
GRANT SELECT ON ws02_owner.owners TO ws02_owner_engine;
GRANT SELECT,INSERT,UPDATE ON ws02_owner.slots TO ws02_owner_engine;
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
 AND request_hash=p_request_hash AND state='RESERVED';
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END $fn$;
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
 has_table_privilege('ws02_owner_auth','ws02_owner.owners','SELECT') THEN
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
 IF NOT ws02_owner.nbr_finalize_citizen_evaluation(a,x,'2026-27',k,h,receipt) THEN
  RAISE EXCEPTION 'VALID_FINALIZATION_DENIED'; END IF;
 IF ws02_owner.nbr_finalize_citizen_evaluation(a,x,'2026-27',k,h,receipt) THEN
  RAISE EXCEPTION 'DUPLICATE_FINALIZATION_ACCEPTED'; END IF;
 IF (SELECT count(*) FROM ws02_owner.slots) <> 1 OR
 (SELECT state FROM ws02_owner.slots) IS DISTINCT FROM 'FINALIZED' OR
 (SELECT receipt_hash FROM ws02_owner.slots) IS DISTINCT FROM receipt THEN
  RAISE EXCEPTION 'RECEIPT_READBACK_MISMATCH'; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
SELECT 'DISPOSABLE_WS02_OWNER_RESERVE_FINALIZE_PASS_ONLY' AS result;
