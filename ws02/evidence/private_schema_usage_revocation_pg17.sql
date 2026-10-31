-- WS02 isolated PostgreSQL 17: private schema USAGE revocation after a
-- synthetic reservation. No Supabase project, JWT, real taxpayer or deployment.
-- Requires only the disposable owner DDL from isolated_owner_receipt_contract.sql.
BEGIN;
CREATE SCHEMA ws02_api;
REVOKE ALL ON SCHEMA ws02_api FROM PUBLIC;
GRANT USAGE ON SCHEMA ws02_api TO ws02_owner_engine;
CREATE FUNCTION ws02_api.nbr_commit_evaluation_atomically(
 p_auth_user_id uuid,p_taxpayer_record_id uuid,p_assessment_year text,
 p_idempotency_key text,p_request_hash text,p_receipt_hash text,
 p_trace_hash text,p_result_state text,p_audit_trace jsonb
) RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,ws02_owner AS $forward$
 SELECT ws02_owner.nbr_commit_evaluation_atomically(
  p_auth_user_id,p_taxpayer_record_id,p_assessment_year,
  p_idempotency_key,p_request_hash,p_receipt_hash,
  p_trace_hash,p_result_state,p_audit_trace);
$forward$;
REVOKE ALL ON FUNCTION ws02_api.nbr_commit_evaluation_atomically(
 uuid,uuid,text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ws02_api.nbr_commit_evaluation_atomically(
 uuid,uuid,text,text,text,text,text,text,jsonb) TO ws02_owner_engine;
INSERT INTO ws02_owner.owners(record_id,assessment_year,actor_id,state)
VALUES ('50000000-0000-4000-8000-000000000001',
 '2026-27','60000000-0000-4000-8000-000000000001','ACTIVE');
SET LOCAL ROLE ws02_owner_engine;
DO $reserve$
DECLARE outcome jsonb;
BEGIN
 outcome:=ws02_owner.nbr_reserve_citizen_evaluation(
  '60000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '2026-27','schema-revoked-after-reserve-00001',
  repeat('a',64),'NBR_ENGINE_CITIZEN_V2_REVIEW');
 IF outcome->>'state' IS DISTINCT FROM 'RESERVED' THEN
  RAISE EXCEPTION 'PRIVATE_SCHEMA_TEST_RESERVATION_FAILED'; END IF;
END $reserve$;
RESET ROLE;
REVOKE USAGE ON SCHEMA ws02_owner FROM ws02_owner_engine;
DO $acl$
BEGIN
 IF pg_catalog.has_schema_privilege('ws02_owner_engine','ws02_owner','USAGE')
 OR NOT pg_catalog.has_schema_privilege('ws02_owner_engine','ws02_api','USAGE')
 OR NOT pg_catalog.has_function_privilege('ws02_owner_engine',
  'ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)','EXECUTE')
 OR NOT pg_catalog.has_function_privilege('ws02_owner_engine',
  'ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'PRIVATE_SCHEMA_TEST_ACL_NOT_ISOLATED'; END IF;
END $acl$;
SET LOCAL ROLE ws02_owner_engine;
DO $attempt$
DECLARE denied boolean:=false;
 audit jsonb:=jsonb_build_object(
  'actor_user_id','60000000-0000-4000-8000-000000000001',
  'taxpayer_record_id','50000000-0000-4000-8000-000000000001',
  'assessment_year','2026-27','income_year','2025-26',
  'authorized_request_hash',repeat('a',64),
  'receipt_hash',repeat('b',64),
  'idempotency_key','schema-revoked-after-reserve-00001',
  'result_status','NEEDS_FACTS',
  'contract_version','NBR_ENGINE_CITIZEN_V2_REVIEW');
BEGIN
 BEGIN
  PERFORM ws02_api.nbr_commit_evaluation_atomically(
   '60000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-000000000001',
   '2026-27','schema-revoked-after-reserve-00001',
   repeat('a',64),repeat('b',64),repeat('c',64),'NEEDS_FACTS',audit);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN
  RAISE EXCEPTION 'PRIVATE_SCHEMA_USAGE_REVOCATION_BYPASSED'; END IF;
END $attempt$;
RESET ROLE;
DO $no_partial$
BEGIN
 IF (SELECT count(*) FROM ws02_owner.slots
  WHERE idem_key='schema-revoked-after-reserve-00001'
  AND state='RESERVED')<>1
 OR EXISTS(SELECT 1 FROM ws02_owner.evaluation_logs
  WHERE idem_key='schema-revoked-after-reserve-00001') THEN
  RAISE EXCEPTION 'PRIVATE_SCHEMA_USAGE_REVOCATION_PARTIAL_RECEIPT'; END IF;
END $no_partial$;
ROLLBACK;
DO $rollback_readback$
BEGIN
 IF pg_catalog.to_regnamespace('ws02_api') IS NOT NULL
 OR EXISTS(SELECT 1 FROM ws02_owner.slots
  WHERE idem_key='schema-revoked-after-reserve-00001')
 OR NOT pg_catalog.has_schema_privilege('ws02_owner_engine','ws02_owner','USAGE')
 THEN RAISE EXCEPTION 'PRIVATE_SCHEMA_USAGE_REVOCATION_ROLLBACK_FAILED'; END IF;
 RAISE NOTICE 'PASS_SCOPED_PRIVATE_SCHEMA_USAGE_REVOCATION_NO_PARTIAL_RECEIPT_ROLLBACK';
END $rollback_readback$;
