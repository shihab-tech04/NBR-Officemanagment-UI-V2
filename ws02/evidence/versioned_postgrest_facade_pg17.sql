-- Disposable PostgreSQL 17 ONLY. Never deploy this facade to Supabase/PostgREST.
-- Tests the 11-argument WS04 versioned private RPC with no citizen/JWT claims.
BEGIN;
CREATE SCHEMA ws02_versioned_api;
REVOKE ALL ON SCHEMA ws02_versioned_api FROM PUBLIC;
GRANT USAGE ON SCHEMA ws02_versioned_api TO ws02_owner_engine;
-- The facade namespace must not be owned or indirectly controlled by a runtime role.
-- A runtime owner could create shadow endpoints regardless of function ACLs.
DO $schema_owner$
DECLARE schema_owner oid; runtime_role name;
BEGIN
 SELECT nspowner INTO STRICT schema_owner
 FROM pg_catalog.pg_namespace WHERE nspname='ws02_versioned_api';
 FOREACH runtime_role IN ARRAY ARRAY[
  'ws02_owner_anon','ws02_owner_auth','ws02_owner_engine',
  'ws02_owner_rpc','ws02_owner_lock'
 ] LOOP
  IF schema_owner=runtime_role::regrole::oid
     OR pg_catalog.pg_has_role(runtime_role,schema_owner,'MEMBER')
     OR pg_catalog.pg_has_role(runtime_role,schema_owner,'USAGE')
     OR pg_catalog.pg_has_role(runtime_role,schema_owner,'SET')
  THEN RAISE EXCEPTION 'VERSIONED_FACADE_SCHEMA_OWNER_ESCALATION_%',runtime_role;
  END IF;
 END LOOP;
 RAISE NOTICE 'PASS_VERSIONED_FACADE_SCHEMA_OWNER_BOUNDARY';
END $schema_owner$;
CREATE FUNCTION ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(
 p_auth_user_id uuid,p_taxpayer_record_id uuid,p_assessment_year text,
 p_idempotency_key text,p_request_hash text,p_receipt_hash text,
 p_trace_hash text,p_result_state text,p_audit_trace jsonb,
 p_trace_bytes text,p_trace_encoding_version text
) RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,ws02_owner AS $forward$
 SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 p_auth_user_id,p_taxpayer_record_id,p_assessment_year,p_idempotency_key,
 p_request_hash,p_receipt_hash,p_trace_hash,p_result_state,p_audit_trace,
 p_trace_bytes,p_trace_encoding_version);
$forward$;
REVOKE ALL ON FUNCTION ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(
 uuid,uuid,text,text,text,text,text,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(
 uuid,uuid,text,text,text,text,text,text,jsonb,text,text) TO ws02_owner_engine;
DO $verify$
DECLARE fn oid := 'ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)'::regprocedure;
        actual_names text[]; definer boolean; configs text[]; body text;
BEGIN
 SELECT p.proargnames,p.prosecdef,p.proconfig,p.prosrc
 INTO actual_names,definer,configs,body FROM pg_catalog.pg_proc p WHERE p.oid=fn;
 IF actual_names IS DISTINCT FROM ARRAY[
 'p_auth_user_id','p_taxpayer_record_id','p_assessment_year',
 'p_idempotency_key','p_request_hash','p_receipt_hash','p_trace_hash',
 'p_result_state','p_audit_trace','p_trace_bytes','p_trace_encoding_version']::text[]
 OR definer IS DISTINCT FROM false OR cardinality(configs)<>1
 OR replace(configs[1],' ','')<>'search_path=pg_catalog,ws02_owner'
 OR position('ws02_owner.nbr_commit_evaluation_versioned_candidate(' in body)=0
 THEN RAISE EXCEPTION 'VERSIONED_FACADE_SIGNATURE_OR_BOUNDARY_DRIFT'; END IF;
 IF has_schema_privilege('ws02_owner_auth','ws02_versioned_api','USAGE')
 OR has_schema_privilege('ws02_owner_anon','ws02_versioned_api','USAGE')
 OR has_schema_privilege('ws02_owner_engine','ws02_versioned_api','CREATE')
 OR has_function_privilege('ws02_owner_auth',fn,'EXECUTE')
 OR has_function_privilege('ws02_owner_anon',fn,'EXECUTE')
 OR NOT has_function_privilege('ws02_owner_engine',fn,'EXECUTE')
 THEN RAISE EXCEPTION 'VERSIONED_FACADE_ACL_BOUNDARY_DRIFT'; END IF;
 -- Denied callers must not be able to invoke the wrapper even with a valid signature.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_auth';
  PERFORM ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(
   '60000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-000000000001','2026-27',
   'synthetic-denied-00001',repeat('a',64),repeat('b',64),
   repeat('c',64),'FAIL_CLOSED','{}'::jsonb,'{}','NBR_W5_CANONICAL_UTF8_V1');
  RAISE EXCEPTION 'AUTH_ROLE_UNEXPECTEDLY_INVOKED_VERSIONED_FACADE';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF current_user <> session_user THEN
  RAISE EXCEPTION 'DENIED_ROLE_PROBE_NOT_RESTORED';
 END IF;
 RAISE NOTICE 'PASS_VERSIONED_FACADE_PRIVATE_ACL_AND_DENIED_AUTH_ROLE';
END $verify$;
ROLLBACK;
