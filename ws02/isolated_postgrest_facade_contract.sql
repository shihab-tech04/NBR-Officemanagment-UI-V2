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
ROLLBACK;
SELECT 'DISPOSABLE_WS02_POSTGREST_STYLE_FACADE_PASS_ONLY' AS result;
