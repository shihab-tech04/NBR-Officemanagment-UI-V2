-- WS02 disposable PG17 PostgREST-style narrow RPC facade acceptance.
-- Review-only. The workflow creates ws02_owner from the existing isolated DDL
-- in a disposable PostgreSQL 17 service. No hosted Supabase/API deployment.
-- This does NOT prove signed JWT validation, revocation at the Auth provider,
-- real taxpayer ownership, approved exposed schemas or legal correctness.
BEGIN;
CREATE SCHEMA ws02_api;
REVOKE ALL ON SCHEMA ws02_api FROM PUBLIC;
GRANT USAGE ON SCHEMA ws02_api TO ws02_owner_engine;
-- A SECURITY INVOKER facade cannot elevate a PostgREST role. The sole
-- synthetic trusted Edge role already has the narrow private EXECUTE grant.
-- Do not grant this facade to anon/auth or place it in public.
CREATE FUNCTION ws02_api.nbr_commit_evaluation_atomically(
 p_auth_user_id uuid,p_taxpayer_record_id uuid,p_assessment_year text,
 p_idempotency_key text,p_request_hash text,p_receipt_hash text,
 p_trace_hash text,p_result_state text,p_audit_trace jsonb
) RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,ws02_owner AS $facade$
 SELECT ws02_owner.nbr_commit_evaluation_atomically(
  p_auth_user_id,p_taxpayer_record_id,p_assessment_year,
  p_idempotency_key,p_request_hash,p_receipt_hash,
  p_trace_hash,p_result_state,p_audit_trace);
$facade$;
REVOKE ALL ON FUNCTION ws02_api.nbr_commit_evaluation_atomically(
 uuid,uuid,text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ws02_api.nbr_commit_evaluation_atomically(
 uuid,uuid,text,text,text,text,text,text,jsonb) TO ws02_owner_engine;
-- Fail closed if the exposed facade ever drifts to SECURITY DEFINER,
-- a mutable search_path, or a non-boolean/non-volatile implementation.
-- This guards the callable metadata, not merely the text of this fixture.
DO $facade_metadata$
DECLARE security_definer boolean; function_volatility "char";
        function_language name; function_config text[]; return_type oid;
BEGIN
 SELECT p.prosecdef,p.provolatile,l.lanname,p.proconfig,p.prorettype
 INTO security_definer,function_volatility,function_language,function_config,return_type
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF NOT FOUND OR security_definer IS DISTINCT FROM false
    OR function_volatility IS DISTINCT FROM 'v'
    OR function_language IS DISTINCT FROM 'sql'
    OR return_type IS DISTINCT FROM 'boolean'::regtype::oid
    OR function_config IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM unnest(function_config) AS setting
      WHERE split_part(setting,'=',1)='search_path'
        AND replace(split_part(setting,'=',2),' ','')='pg_catalog,ws02_owner')
 THEN RAISE EXCEPTION
   'FACADE_SECURITY_INVOKER_METADATA_DRIFT sec=% vol=% lang=% ret=% config=%',
   security_definer,function_volatility,function_language,return_type,function_config;
 END IF;
END $facade_metadata$;
DO $acl$
DECLARE caller name;
BEGIN
 FOREACH caller IN ARRAY ARRAY['ws02_owner_anon','ws02_owner_auth'] LOOP
  IF has_schema_privilege(caller,'ws02_api','USAGE')
   OR has_function_privilege(caller,
    'ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)',
    'EXECUTE')
   OR has_schema_privilege(caller,'ws02_owner','USAGE')
  THEN RAISE EXCEPTION 'UNTRUSTED_POSTGREST_ROLE_HAS_RPC_ACCESS_%',caller; END IF;
 END LOOP;
 IF NOT has_schema_privilege('ws02_owner_engine','ws02_api','USAGE')
 OR NOT has_function_privilege('ws02_owner_engine',
   'ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)',
   'EXECUTE')
 OR has_schema_privilege('ws02_owner_engine','ws02_api','CREATE')
 OR EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
   JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='nbr_commit_evaluation_atomically')
 THEN RAISE EXCEPTION 'FACADE_LEAST_PRIVILEGE_OR_PUBLIC_EXPOSURE_FAILURE'; END IF;
END $acl$;
-- Negative role-escalation and private-object ACL proof. An exposed API schema
-- is not sufficient protection if a caller can inherit or SET the engine role,
-- call its private SECURITY DEFINER RPC, or read receipt/owner tables directly.
-- All identities/roles here are synthetic; this does not validate real JWTs.
DO $private_boundary$
DECLARE caller name; elevated name; signature text; relation_name text;
BEGIN
 FOREACH caller IN ARRAY ARRAY['ws02_owner_anon','ws02_owner_auth'] LOOP
  FOREACH elevated IN ARRAY ARRAY[
   'ws02_owner_engine','ws02_owner_rpc','ws02_owner_lock'] LOOP
   IF pg_catalog.pg_has_role(caller,elevated,'MEMBER')
      OR pg_catalog.pg_has_role(caller,elevated,'USAGE')
      OR pg_catalog.pg_has_role(caller,elevated,'SET') THEN
    RAISE EXCEPTION 'UNTRUSTED_ROLE_CAN_ASSUME_PRIVILEGED_ROLE_%_%',caller,elevated;
   END IF;
  END LOOP;
  FOREACH signature IN ARRAY ARRAY[
   'ws02_owner.nbr_authorize_citizen_evaluation(uuid,uuid,text)',
   'ws02_owner.nbr_lock_active_owner(uuid,uuid,text)',
   'ws02_owner.nbr_reserve_citizen_evaluation(uuid,uuid,text,text,text,text)',
   'ws02_owner.nbr_finalize_citizen_evaluation(uuid,uuid,text,text,text,text)',
   'ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'] LOOP
   IF pg_catalog.has_function_privilege(caller,signature,'EXECUTE') THEN
    RAISE EXCEPTION 'UNTRUSTED_ROLE_CAN_EXECUTE_PRIVATE_RPC_%_%',caller,signature;
   END IF;
  END LOOP;
  FOREACH relation_name IN ARRAY ARRAY[
   'ws02_owner.owners','ws02_owner.slots','ws02_owner.evaluation_logs'] LOOP
   IF pg_catalog.has_table_privilege(caller,relation_name,
    'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'UNTRUSTED_ROLE_HAS_PRIVATE_TABLE_ACCESS_%_%',caller,relation_name;
   END IF;
  END LOOP;
 END LOOP;
END $private_boundary$;
-- PostgREST-style claims alone cannot grant a database role the facade.
-- Claims here are intentionally spoofable session GUCs, not real signed JWTs.
SET LOCAL ROLE ws02_owner_anon;
DO $anon$
DECLARE denied boolean:=false;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',true);
 BEGIN
  PERFORM ws02_api.nbr_commit_evaluation_atomically(
   '60000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-000000000001',
   '2026-27','facade-proof-atomic-00001',
   repeat('a',64),repeat('b',64),repeat('c',64),'NEEDS_FACTS',
   '{}'::jsonb);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'ANON_SPOOFED_CLAIM_EXECUTED_FACADE'; END IF;
END $anon$;
RESET ROLE;
SET LOCAL ROLE ws02_owner_auth;
DO $auth$
DECLARE denied boolean:=false;
BEGIN
 PERFORM set_config('request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"service_role"}',true);
 BEGIN
  PERFORM ws02_api.nbr_commit_evaluation_atomically(
   '60000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-000000000001',
   '2026-27','facade-proof-atomic-00001',
   repeat('a',64),repeat('b',64),repeat('c',64),'NEEDS_FACTS',
   '{}'::jsonb);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'AUTH_SPOOFED_CLAIM_EXECUTED_FACADE'; END IF;
END $auth$;
RESET ROLE;
-- All owners and identities below are synthetic; no migration is authorized.
INSERT INTO ws02_owner.owners(record_id,assessment_year,actor_id,state) VALUES
 ('50000000-0000-4000-8000-000000000001','2026-27',
  '60000000-0000-4000-8000-000000000001','ACTIVE'),
 ('50000000-0000-4000-8000-000000000002','2026-27',
  '60000000-0000-4000-8000-000000000002','ACTIVE'),
 ('50000000-0000-4000-8000-000000000003','2026-27',
  '60000000-0000-4000-8000-000000000001','REVOKED'),
 ('50000000-0000-4000-8000-000000000004','2026-27',
  '60000000-0000-4000-8000-000000000001','ACTIVE');
SET LOCAL ROLE ws02_owner_engine;
DO $reserve$
DECLARE actor uuid:='60000000-0000-4000-8000-000000000001';
        r jsonb; rec uuid;
BEGIN
 FOREACH rec IN ARRAY ARRAY[
  '50000000-0000-4000-8000-000000000001'::uuid,
  '50000000-0000-4000-8000-000000000004'::uuid] LOOP
  r:=ws02_owner.nbr_reserve_citizen_evaluation(
   actor,rec,'2026-27','facade-proof-atomic-00001',
   repeat('a',64),'NBR_ENGINE_CITIZEN_V2_REVIEW');
  IF r->>'state' IS DISTINCT FROM 'RESERVED' THEN
   RAISE EXCEPTION 'FACADE_FIXTURE_RESERVATION_FAILED_%',rec; END IF;
 END LOOP;
END $reserve$;
RESET ROLE;
-- Simulate an owner revocation after reservation but before atomic receipt.
UPDATE ws02_owner.owners SET state='REVOKED'
 WHERE record_id='50000000-0000-4000-8000-000000000004';
SET LOCAL ROLE ws02_owner_engine;
DO $negative_and_positive$
DECLARE actor uuid:='60000000-0000-4000-8000-000000000001';
 other uuid:='60000000-0000-4000-8000-000000000002';
 rec uuid:='50000000-0000-4000-8000-000000000001';
 revoked_rec uuid:='50000000-0000-4000-8000-000000000004';
 idem text:='facade-proof-atomic-00001';
 req text:=repeat('a',64); receipt text:=repeat('b',64);
 trace text:=repeat('c',64); audit jsonb; revoked_audit jsonb;
BEGIN
 audit:=jsonb_build_object(
  'actor_user_id',actor::text,'taxpayer_record_id',rec::text,
  'assessment_year','2026-27','income_year','2025-26',
  'authorized_request_hash',req,'receipt_hash',receipt,
  'idempotency_key',idem,'result_status','NEEDS_FACTS',
  'contract_version','NBR_ENGINE_CITIZEN_V2_REVIEW');
 revoked_audit:=jsonb_set(audit,'{taxpayer_record_id}',
  to_jsonb(revoked_rec::text));
 IF ws02_api.nbr_commit_evaluation_atomically(
   other,rec,'2026-27',idem,req,receipt,trace,'NEEDS_FACTS',audit)
 OR ws02_api.nbr_commit_evaluation_atomically(
   actor,rec,'2027-28',idem,req,receipt,trace,'NEEDS_FACTS',audit)
 OR ws02_api.nbr_commit_evaluation_atomically(
   actor,revoked_rec,'2026-27',idem,req,receipt,trace,'NEEDS_FACTS',revoked_audit)
 OR ws02_api.nbr_commit_evaluation_atomically(
   actor,rec,'2026-27',idem,repeat('d',64),receipt,trace,'NEEDS_FACTS',audit)
 OR ws02_api.nbr_commit_evaluation_atomically(
   actor,rec,'2026-27',idem,req,receipt,trace,'NEEDS_FACTS',
   audit||jsonb_build_object('amounts',jsonb_build_object('balanceDue','99')))
 THEN RAISE EXCEPTION 'FACADE_ACCEPTED_WRONG_ACTOR_YEAR_REVOKED_HASH_OR_TRACE'; END IF;
 IF NOT ws02_api.nbr_commit_evaluation_atomically(
   actor,rec,'2026-27',idem,req,receipt,trace,'NEEDS_FACTS',audit)
 THEN RAISE EXCEPTION 'FACADE_VALID_ATOMIC_COMMIT_DENIED'; END IF;
 IF ws02_api.nbr_commit_evaluation_atomically(
   actor,rec,'2026-27',idem,req,receipt,trace,'NEEDS_FACTS',audit)
 THEN RAISE EXCEPTION 'FACADE_DUPLICATE_ATOMIC_COMMIT_ACCEPTED'; END IF;
END $negative_and_positive$;
RESET ROLE;
DO $readback$
BEGIN
 IF (SELECT count(*) FROM ws02_owner.slots
     WHERE idem_key='facade-proof-atomic-00001'
       AND record_id='50000000-0000-4000-8000-000000000001'
       AND state='FINALIZED' AND receipt_hash=repeat('b',64))<>1
 OR (SELECT count(*) FROM ws02_owner.evaluation_logs
     WHERE idem_key='facade-proof-atomic-00001'
       AND record_id='50000000-0000-4000-8000-000000000001'
       AND result_state='NEEDS_FACTS'
       AND trace_hash=repeat('c',64)
       AND audit_trace->>'income_year'='2025-26'
       AND audit_trace->>'idempotency_key'='facade-proof-atomic-00001'
       AND NOT(audit_trace ? 'amounts'))<>1
 OR (SELECT count(*) FROM ws02_owner.slots
     WHERE idem_key='facade-proof-atomic-00001'
       AND record_id='50000000-0000-4000-8000-000000000004'
       AND state='RESERVED' AND receipt_hash IS NULL)<>1
 OR EXISTS(SELECT 1 FROM ws02_owner.evaluation_logs
     WHERE record_id='50000000-0000-4000-8000-000000000004')
 OR (SELECT count(*) FROM ws02_owner.evaluation_logs)<>1
 THEN RAISE EXCEPTION 'FACADE_ATOMIC_TRACE_RECEIPT_OR_REVOCATION_READBACK_FAILED'; END IF;
END $readback$;
-- Independent facade-level transaction-abort proof, distinct from the private
-- RPC rollback suite. A successful synthetic wrapper call must leave no
-- reservation, audit trace or receipt after the caller rolls back its savepoint.
-- This is PostgreSQL transaction behavior, NOT signed JWT/owner approval.
SAVEPOINT ws02_facade_rollback;
SET LOCAL ROLE ws02_owner_engine;
DO $facade_rollback$
DECLARE actor uuid:='60000000-0000-4000-8000-000000000002';
 rec uuid:='50000000-0000-4000-8000-000000000002';
 idem text:='facade-rollback-atomic-00001';
 req text:=repeat('d',64); receipt text:=repeat('e',64);
 trace text:=repeat('f',64); reservation jsonb; audit jsonb;
BEGIN
 reservation:=ws02_owner.nbr_reserve_citizen_evaluation(
  actor,rec,'2026-27',idem,req,'NBR_ENGINE_CITIZEN_V2_REVIEW');
 IF reservation->>'state' IS DISTINCT FROM 'RESERVED' THEN
  RAISE EXCEPTION 'FACADE_ROLLBACK_RESERVATION_FAILED'; END IF;
 audit:=jsonb_build_object(
  'actor_user_id',actor::text,'taxpayer_record_id',rec::text,
  'assessment_year','2026-27','income_year','2025-26',
  'authorized_request_hash',req,'receipt_hash',receipt,
  'idempotency_key',idem,'result_status','FAIL_CLOSED',
  'contract_version','NBR_ENGINE_CITIZEN_V2_REVIEW');
 IF NOT ws02_api.nbr_commit_evaluation_atomically(
  actor,rec,'2026-27',idem,req,receipt,trace,'FAIL_CLOSED',audit) THEN
  RAISE EXCEPTION 'FACADE_ROLLBACK_ATOMIC_CALL_FAILED'; END IF;
END $facade_rollback$;
RESET ROLE;
DO $facade_pre_rollback$
BEGIN
 IF (SELECT count(*) FROM ws02_owner.slots
     WHERE idem_key='facade-rollback-atomic-00001'
       AND state='FINALIZED' AND receipt_hash=repeat('e',64))<>1
 OR (SELECT count(*) FROM ws02_owner.evaluation_logs
     WHERE idem_key='facade-rollback-atomic-00001'
       AND result_state='FAIL_CLOSED' AND trace_hash=repeat('f',64)
       AND audit_trace->>'income_year'='2025-26')<>1 THEN
  RAISE EXCEPTION 'FACADE_SAVEPOINT_PRE_ROLLBACK_RECEIPT_MISSING'; END IF;
END $facade_pre_rollback$;
ROLLBACK TO SAVEPOINT ws02_facade_rollback;
RELEASE SAVEPOINT ws02_facade_rollback;
DO $facade_post_rollback$
BEGIN
 IF EXISTS(SELECT 1 FROM ws02_owner.slots
     WHERE idem_key='facade-rollback-atomic-00001')
 OR EXISTS(SELECT 1 FROM ws02_owner.evaluation_logs
     WHERE idem_key='facade-rollback-atomic-00001')
 OR (SELECT count(*) FROM ws02_owner.evaluation_logs)<>1 THEN
  RAISE EXCEPTION 'FACADE_SAVEPOINT_ROLLBACK_LEFT_SLOT_TRACE_OR_RECEIPT'; END IF;
END $facade_post_rollback$;
ROLLBACK;
SELECT 'DISPOSABLE_WS02_POSTGREST_STYLE_FACADE_PASS_ONLY' AS result;
