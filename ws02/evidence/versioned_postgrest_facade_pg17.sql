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
-- A runtime role that owns (or can SET ROLE to the owner of) the wrapper
-- could ALTER its search_path/SECURITY DEFINER flag despite the ACL denials.
DO $function_owner$
DECLARE function_owner oid; runtime_role name;
BEGIN
 SELECT proowner INTO STRICT function_owner FROM pg_catalog.pg_proc
 WHERE oid='ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)'::regprocedure;
 FOREACH runtime_role IN ARRAY ARRAY[
  'ws02_owner_anon','ws02_owner_auth','ws02_owner_engine',
  'ws02_owner_rpc','ws02_owner_lock'
 ] LOOP
  IF function_owner=runtime_role::regrole::oid
     OR pg_catalog.pg_has_role(runtime_role,function_owner,'MEMBER')
     OR pg_catalog.pg_has_role(runtime_role,function_owner,'USAGE')
     OR pg_catalog.pg_has_role(runtime_role,function_owner,'SET')
  THEN RAISE EXCEPTION 'VERSIONED_FACADE_FUNCTION_OWNER_ESCALATION_%',runtime_role;
  END IF;
 END LOOP;
 RAISE NOTICE 'PASS_VERSIONED_FACADE_FUNCTION_OWNER_BOUNDARY';
END $function_owner$;
DO $verify$
DECLARE fn oid := 'ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)'::regprocedure;
        actual_names text[]; definer boolean; configs text[]; body text; runtime_role name;
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
 -- A citizen must not inherit or SET ROLE to the only facade-executable engine role.
 -- Otherwise denied direct EXECUTE can be bypassed by role switching.
 IF pg_catalog.pg_has_role('ws02_owner_auth','ws02_owner_engine','MEMBER')
 OR pg_catalog.pg_has_role('ws02_owner_auth','ws02_owner_engine','USAGE')
 OR pg_catalog.pg_has_role('ws02_owner_auth','ws02_owner_engine','SET')
 OR pg_catalog.pg_has_role('ws02_owner_anon','ws02_owner_engine','MEMBER')
 OR pg_catalog.pg_has_role('ws02_owner_anon','ws02_owner_engine','USAGE')
 OR pg_catalog.pg_has_role('ws02_owner_anon','ws02_owner_engine','SET')
 THEN RAISE EXCEPTION 'CITIZEN_ENGINE_ROLE_ESCALATION'; END IF;
 -- Verify actual SET ROLE denial, not only role-membership catalog state.
 -- The exception subtransaction restores the original role after each denied attempt.
 FOREACH runtime_role IN ARRAY ARRAY['ws02_owner_auth','ws02_owner_anon'] LOOP
  BEGIN
   EXECUTE format('SET SESSION AUTHORIZATION %I',runtime_role);
   EXECUTE 'SET LOCAL ROLE ws02_owner_engine';
   RAISE EXCEPTION 'CITIZEN_UNEXPECTEDLY_SWITCHED_TO_ENGINE_%',runtime_role;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF current_user <> session_user THEN
   RAISE EXCEPTION 'CITIZEN_ENGINE_SWITCH_PROBE_NOT_RESTORED_%',runtime_role;
  END IF;
 END LOOP;
 RAISE NOTICE 'PASS_VERSIONED_FACADE_CITIZEN_ENGINE_ROLE_ISOLATION';
 -- An EXECUTE-only engine must not grant its own role membership to citizens.
 -- A successful GRANT would bypass function/schema ACLs through SET ROLE.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_engine';
  EXECUTE 'GRANT ws02_owner_engine TO ws02_owner_auth';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';
 IF pg_catalog.pg_has_role('ws02_owner_auth','ws02_owner_engine','MEMBER')
 OR pg_catalog.pg_has_role('ws02_owner_auth','ws02_owner_engine','SET')
 THEN RAISE EXCEPTION 'ENGINE_ROLE_MEMBERSHIP_GRANT_PROBE_ESCALATED_CITIZEN'; END IF;
 RAISE NOTICE 'PASS_VERSIONED_FACADE_ENGINE_CANNOT_DELEGATE_ROLE';
 -- A runtime engine role must not be able to publish a shadow endpoint in the facade schema.
 -- This is an executable permission probe, not merely an ACL metadata check.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_engine';
  EXECUTE 'CREATE FUNCTION ws02_versioned_api.ws02_shadow_endpoint_probe() RETURNS boolean LANGUAGE sql AS ''SELECT true''';
  RAISE EXCEPTION 'ENGINE_ROLE_UNEXPECTEDLY_CREATED_FACADE_ENDPOINT';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF to_regprocedure('ws02_versioned_api.ws02_shadow_endpoint_probe()') IS NOT NULL
 THEN RAISE EXCEPTION 'ENGINE_SHADOW_ENDPOINT_PROBE_LEFT_OBJECT'; END IF;
 -- Citizen roles must not create shadow endpoints in the private facade schema.
 -- Exercise CREATE directly; metadata-only USAGE/CREATE checks are insufficient.
 FOREACH runtime_role IN ARRAY ARRAY['ws02_owner_auth','ws02_owner_anon'] LOOP
  BEGIN
   EXECUTE format('SET LOCAL ROLE %I',runtime_role);
   EXECUTE format('CREATE FUNCTION ws02_versioned_api.ws02_citizen_shadow_probe() RETURNS boolean LANGUAGE sql AS %L','SELECT true');
   RAISE EXCEPTION 'CITIZEN_ROLE_UNEXPECTEDLY_CREATED_FACADE_ENDPOINT_%',runtime_role;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  IF to_regprocedure('ws02_versioned_api.ws02_citizen_shadow_probe()') IS NOT NULL
  THEN RAISE EXCEPTION 'CITIZEN_SHADOW_ENDPOINT_PROBE_LEFT_OBJECT_%',runtime_role; END IF;
 END LOOP;
 -- The runtime engine must not be able to change the facade into SECURITY DEFINER.
 -- EXECUTE on a function does not confer ownership or ALTER FUNCTION rights.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_engine';
  EXECUTE 'ALTER FUNCTION ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text) SECURITY DEFINER';
  RAISE EXCEPTION 'ENGINE_ROLE_UNEXPECTEDLY_ALTERED_FACADE_SECURITY';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF (SELECT prosecdef FROM pg_catalog.pg_proc WHERE oid=fn) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'ENGINE_ALTER_PROBE_CHANGED_FACADE_SECURITY'; END IF;
 -- A runtime caller must not be able to redirect the SECURITY INVOKER wrapper's
 -- pinned search_path. Check the stored configuration after the denied ALTER.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_engine';
  EXECUTE 'ALTER FUNCTION ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text) SET search_path TO public';
  RAISE EXCEPTION 'ENGINE_ROLE_UNEXPECTEDLY_CHANGED_FACADE_SEARCH_PATH';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';
 IF (SELECT proconfig FROM pg_catalog.pg_proc WHERE oid=fn)
    IS DISTINCT FROM ARRAY['search_path=pg_catalog, ws02_owner']::text[]
    AND (SELECT replace(proconfig[1],' ','') FROM pg_catalog.pg_proc WHERE oid=fn)
        IS DISTINCT FROM 'search_path=pg_catalog,ws02_owner'
 THEN RAISE EXCEPTION 'ENGINE_ALTER_PROBE_CHANGED_FACADE_SEARCH_PATH'; END IF;
 -- An EXECUTE-only runtime must not replace the private facade implementation.
 -- This probes CREATE OR REPLACE independently of ALTER FUNCTION permissions.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_engine';
  EXECUTE 'CREATE OR REPLACE FUNCTION ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text) RETURNS boolean LANGUAGE sql AS ''SELECT true''';
  RAISE EXCEPTION 'ENGINE_ROLE_UNEXPECTEDLY_REPLACED_FACADE';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';
 IF (SELECT prosrc FROM pg_catalog.pg_proc WHERE oid=fn)
    NOT LIKE '%ws02_owner.nbr_commit_evaluation_versioned_candidate(%'
 THEN RAISE EXCEPTION 'ENGINE_REPLACE_PROBE_CHANGED_FACADE_BODY'; END IF;
 -- EXECUTE-only engine must not transfer facade ownership to a citizen role.
 -- An ownership transfer would allow future ALTER/DROP and privilege delegation.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_engine';
  EXECUTE 'ALTER FUNCTION ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text) OWNER TO ws02_owner_auth';
  RAISE EXCEPTION 'ENGINE_ROLE_UNEXPECTEDLY_TRANSFERRED_FACADE_OWNERSHIP';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';
 IF (SELECT proowner FROM pg_catalog.pg_proc WHERE oid=fn) = 'ws02_owner_auth'::regrole::oid
 THEN RAISE EXCEPTION 'ENGINE_OWNER_TRANSFER_PROBE_CHANGED_FACADE_OWNER'; END IF;
 -- EXECUTE-only engine role must not DROP the facade function, even with CASCADE.
 -- DROP is a separate ownership attack path from ALTER and CREATE OR REPLACE.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_engine';
  EXECUTE 'DROP FUNCTION ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text) CASCADE';
  RAISE EXCEPTION 'ENGINE_ROLE_UNEXPECTEDLY_DROPPED_FACADE';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';
 IF to_regprocedure('ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)') IS NULL
 THEN RAISE EXCEPTION 'ENGINE_DROP_PROBE_REMOVED_FACADE'; END IF;
 -- Runtime EXECUTE permission must not permit delegating facade access to citizen roles.
 -- Test the GRANT operation itself and verify no ACL change survives the probe.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_engine';
  EXECUTE 'GRANT EXECUTE ON FUNCTION ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text) TO ws02_owner_auth';
  -- PostgreSQL may emit WARNING 'no privileges were granted' rather than an error.
  -- The effective privilege assertion below is the security invariant.
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 -- A warning-only GRANT retains SET LOCAL ROLE; restore before denial probes.
 EXECUTE 'RESET ROLE';
 IF has_function_privilege('ws02_owner_auth',fn,'EXECUTE')
 THEN RAISE EXCEPTION 'ENGINE_GRANT_PROBE_CHANGED_FACADE_ACL'; END IF;
 -- PUBLIC function EXECUTE would include every current and future database role.
 -- A warning-only unauthorized GRANT must not bypass the effective-ACL assertion.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_engine';
  EXECUTE 'GRANT EXECUTE ON FUNCTION ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text) TO PUBLIC';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';
 IF has_function_privilege('ws02_owner_auth',fn,'EXECUTE')
 OR has_function_privilege('ws02_owner_anon',fn,'EXECUTE')
 THEN RAISE EXCEPTION 'ENGINE_PUBLIC_FUNCTION_GRANT_PROBE_CHANGED_FACADE_ACL'; END IF;
 -- EXECUTE denial is insufficient if a runtime role can grant schema USAGE.
 -- PostgreSQL may report an unauthorized GRANT as a warning, so assert effective ACL.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_engine';
  EXECUTE 'GRANT USAGE ON SCHEMA ws02_versioned_api TO ws02_owner_auth';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';
 IF has_schema_privilege('ws02_owner_auth','ws02_versioned_api','USAGE')
 THEN RAISE EXCEPTION 'ENGINE_SCHEMA_GRANT_PROBE_CHANGED_FACADE_ACL'; END IF;
 -- The runtime engine must also be unable to grant facade USAGE to PUBLIC.
 -- PUBLIC would include anonymous and all future roles, not just current citizens.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_engine';
  EXECUTE 'GRANT USAGE ON SCHEMA ws02_versioned_api TO PUBLIC';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';
 IF has_schema_privilege('ws02_owner_anon','ws02_versioned_api','USAGE')
 OR has_schema_privilege('ws02_owner_auth','ws02_versioned_api','USAGE')
 THEN RAISE EXCEPTION 'ENGINE_PUBLIC_SCHEMA_GRANT_PROBE_CHANGED_FACADE_ACL'; END IF;
 -- A runtime role must not delegate facade CREATE to a citizen role.
 -- An unauthorized GRANT can emit WARNING without throwing on PostgreSQL 17.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_engine';
  EXECUTE 'GRANT CREATE ON SCHEMA ws02_versioned_api TO ws02_owner_auth';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';
 IF has_schema_privilege('ws02_owner_auth','ws02_versioned_api','CREATE')
 THEN RAISE EXCEPTION 'ENGINE_SCHEMA_CREATE_GRANT_PROBE_CHANGED_FACADE_ACL'; END IF;
 -- PUBLIC CREATE would let any present or future role publish a facade endpoint.
 -- Exercise the unauthorized grant, then inspect effective privilege for both callers.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_engine';
  EXECUTE 'GRANT CREATE ON SCHEMA ws02_versioned_api TO PUBLIC';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 EXECUTE 'RESET ROLE';
 IF has_schema_privilege('ws02_owner_auth','ws02_versioned_api','CREATE')
 OR has_schema_privilege('ws02_owner_anon','ws02_versioned_api','CREATE')
 THEN RAISE EXCEPTION 'ENGINE_PUBLIC_SCHEMA_CREATE_GRANT_PROBE_CHANGED_FACADE_ACL'; END IF;
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
 -- Anonymous clients must be denied independently of authenticated clients.
 BEGIN
  EXECUTE 'SET LOCAL ROLE ws02_owner_anon';
  PERFORM ws02_versioned_api.nbr_commit_evaluation_versioned_candidate(
   '60000000-0000-4000-8000-000000000001',
   '50000000-0000-4000-8000-000000000001','2026-27',
   'synthetic-anon-denied-00001',repeat('a',64),repeat('b',64),
   repeat('c',64),'FAIL_CLOSED','{}'::jsonb,'{}','NBR_W5_CANONICAL_UTF8_V1');
  RAISE EXCEPTION 'ANON_ROLE_UNEXPECTEDLY_INVOKED_VERSIONED_FACADE';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF current_user <> session_user THEN
  RAISE EXCEPTION 'DENIED_ROLE_PROBE_NOT_RESTORED';
 END IF;
 RAISE NOTICE 'PASS_VERSIONED_FACADE_PRIVATE_ACL_AND_DENIED_AUTH_ROLE';
END $verify$;
ROLLBACK;
