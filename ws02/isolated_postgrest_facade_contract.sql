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
        argument_names text[]; default_count integer; variadic_type oid;
        returns_set boolean; function_kind "char"; leakproof boolean;
        parallel_mode "char";
BEGIN
 SELECT p.prosecdef,p.provolatile,l.lanname,p.proconfig,p.prorettype,
        p.proargnames,p.pronargdefaults,p.provariadic,p.proretset,
        p.prokind,p.proleakproof,p.proparallel
 INTO security_definer,function_volatility,function_language,function_config,return_type,
      argument_names,default_count,variadic_type,returns_set,
      function_kind,leakproof,parallel_mode
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_language l ON l.oid=p.prolang
 WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF NOT FOUND OR security_definer IS DISTINCT FROM false
    OR function_volatility IS DISTINCT FROM 'v'
    OR function_language IS DISTINCT FROM 'sql'
    OR return_type IS DISTINCT FROM 'boolean'::regtype::oid
    -- PostgREST resolves named JSON arguments. A positional type signature
    -- alone misses renamed parameters, optional defaults and variadic drift.
    OR argument_names IS DISTINCT FROM ARRAY[
      'p_auth_user_id','p_taxpayer_record_id','p_assessment_year',
      'p_idempotency_key','p_request_hash','p_receipt_hash',
      'p_trace_hash','p_result_state','p_audit_trace']::text[]
    OR default_count IS DISTINCT FROM 0
    OR variadic_type IS DISTINCT FROM 0::oid
    OR returns_set IS DISTINCT FROM false
    -- An atomic write wrapper must not be declared PARALLEL SAFE/RESTRICTED,
    -- LEAKPROOF or changed from a normal function to another routine kind.
    OR function_kind IS DISTINCT FROM 'f'
    OR leakproof IS DISTINCT FROM false
    OR parallel_mode IS DISTINCT FROM 'u'
    OR function_config IS NULL
    -- Reject any unreviewed per-function GUC override, even if the reviewed
    -- search_path is still present. A second SET can change SQL behavior.
    OR cardinality(function_config) IS DISTINCT FROM 1
    OR NOT EXISTS (
      SELECT 1 FROM unnest(function_config) AS setting
      WHERE split_part(setting,'=',1)='search_path'
        AND replace(split_part(setting,'=',2),' ','')='pg_catalog,ws02_owner')
 THEN RAISE EXCEPTION
   'FACADE_SECURITY_INVOKER_METADATA_DRIFT sec=% vol=% lang=% ret=% config=%',
   security_definer,function_volatility,function_language,return_type,function_config;
 END IF;
END $facade_metadata$;
-- Defense-in-depth: PostgreSQL normally grants EXECUTE on newly created
-- functions to PUBLIC. The isolated owner DDL revoked the creator's global
-- function default (a schema-local REVOKE alone cannot undo that default).
-- Prove a *future* RPC in the exposed schema is not executable by the
-- synthetic authenticated role by default. Deliberately grant PUBLIC EXECUTE
-- inside a disposable subtransaction, detect it, then roll back the entire
-- probe function. No real PostgREST schema, Auth role or hosted SQL is used.
DO $future_facade_default_acl_probe$
DECLARE default_execute boolean; granted_execute boolean;
BEGIN
 IF pg_catalog.to_regprocedure('ws02_api.__synthetic_future_rpc_probe()') IS NOT NULL THEN
  RAISE EXCEPTION 'FUTURE_FACADE_PROBE_NAME_COLLISION';
 END IF;
 BEGIN
  EXECUTE 'CREATE FUNCTION ws02_api.__synthetic_future_rpc_probe() RETURNS boolean LANGUAGE sql AS ''SELECT true''';
  SELECT pg_catalog.has_function_privilege('ws02_owner_auth',
   'ws02_api.__synthetic_future_rpc_probe()','EXECUTE') INTO default_execute;
  IF default_execute IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'FUTURE_FACADE_DEFAULT_PUBLIC_EXECUTE_EXPOSED';
  END IF;
  EXECUTE 'GRANT EXECUTE ON FUNCTION ws02_api.__synthetic_future_rpc_probe() TO PUBLIC';
  SELECT pg_catalog.has_function_privilege('ws02_owner_auth',
   'ws02_api.__synthetic_future_rpc_probe()','EXECUTE') INTO granted_execute;
  IF granted_execute IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'FUTURE_FACADE_PUBLIC_EXECUTE_MUTATION_UNDETECTED';
  END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_FUTURE_FACADE_PUBLIC_GRANT';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_FUTURE_FACADE_PUBLIC_GRANT' THEN RAISE; END IF;
 END;
 IF pg_catalog.to_regprocedure('ws02_api.__synthetic_future_rpc_probe()') IS NOT NULL THEN
  RAISE EXCEPTION 'FUTURE_FACADE_PROBE_FUNCTION_NOT_ROLLED_BACK';
 END IF;
 RAISE NOTICE 'PASS_SCOPED_FUTURE_FACADE_DEFAULT_EXECUTE_DENIAL_AND_ROLLBACK';
END $future_facade_default_acl_probe$;
-- Negative regression: SECURITY DEFINER on the PostgREST-style facade
-- would elevate the synthetic Edge caller to the migration owner's identity.
-- Prove pg_proc.prosecdef detects that privilege-boundary drift and that a
-- disposable exception subtransaction restores SECURITY INVOKER. No hosted SQL.
DO $facade_definer_negative_probe$
DECLARE baseline_definer boolean; observed_definer boolean;
BEGIN
 SELECT p.prosecdef INTO STRICT baseline_definer FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF baseline_definer IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'FACADE_SECURITY_INVOKER_BASELINE_DRIFT';
 END IF;
 BEGIN
  ALTER FUNCTION ws02_api.nbr_commit_evaluation_atomically(
   uuid,uuid,text,text,text,text,text,text,jsonb) SECURITY DEFINER;
  SELECT p.prosecdef INTO STRICT observed_definer FROM pg_catalog.pg_proc p
  WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
  IF observed_definer IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'FACADE_SECURITY_DEFINER_MUTATION_UNDETECTED';
  END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_FACADE_SECURITY_DEFINER';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_FACADE_SECURITY_DEFINER' THEN
   RAISE;
  END IF;
 END;
 SELECT p.prosecdef INTO STRICT observed_definer FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF observed_definer IS DISTINCT FROM baseline_definer THEN
  RAISE EXCEPTION 'FACADE_SECURITY_DEFINER_MUTATION_NOT_ROLLED_BACK';
 END IF;
 RAISE NOTICE 'PASS_SCOPED_FACADE_SECURITY_DEFINER_ROLLBACK_ONE_CASE';
END $facade_definer_negative_probe$;
-- Regression: a privileged metadata change can incorrectly advertise this
-- write-bearing facade as PARALLEL SAFE without changing its SQL body or ACL.
-- The reviewed guard requires pg_proc.proparallel='u'. Roll back the drift.
-- Disposable PG17 only; never alter a hosted function.
DO $facade_parallel_negative_probe$
DECLARE original_parallel "char"; mutated_parallel "char";
BEGIN
 SELECT p.proparallel INTO original_parallel FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF original_parallel IS DISTINCT FROM 'u' THEN
  RAISE EXCEPTION 'FACADE_PARALLEL_BASELINE_DRIFT';
 END IF;
 BEGIN
  ALTER FUNCTION ws02_api.nbr_commit_evaluation_atomically(
   uuid,uuid,text,text,text,text,text,text,jsonb) PARALLEL SAFE;
  SELECT p.proparallel INTO mutated_parallel FROM pg_catalog.pg_proc p
  WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
  IF mutated_parallel IS DISTINCT FROM 's' THEN
   RAISE EXCEPTION 'FACADE_PARALLEL_SAFE_MUTATION_NOT_DETECTED';
  END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_FACADE_PARALLEL_SAFE';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_FACADE_PARALLEL_SAFE' THEN RAISE; END IF;
 END;
 SELECT p.proparallel INTO mutated_parallel FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF mutated_parallel IS DISTINCT FROM original_parallel THEN
  RAISE EXCEPTION 'FACADE_PARALLEL_SAFE_MUTATION_NOT_ROLLED_BACK';
 END IF;
END $facade_parallel_negative_probe$;
-- Mutation regression: keep the reviewed search_path while appending a
-- harmless extra function-local GUC. The exact-config guard must reject the
-- drift and PostgreSQL must roll the mutation back. Disposable PG17 only.
DO $facade_guc_negative_probe$
DECLARE original_config text[]; mutated_config text[];
BEGIN
 SELECT p.proconfig INTO original_config FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF cardinality(original_config) IS DISTINCT FROM 1 THEN
  RAISE EXCEPTION 'FACADE_CONFIG_BASELINE_NOT_EXACT';
 END IF;
 BEGIN
  ALTER FUNCTION ws02_api.nbr_commit_evaluation_atomically(
   uuid,uuid,text,text,text,text,text,text,jsonb) SET work_mem TO '8MB';
  SELECT p.proconfig INTO mutated_config FROM pg_catalog.pg_proc p
  WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
  IF cardinality(mutated_config) IS DISTINCT FROM 2
     OR NOT EXISTS (SELECT 1 FROM unnest(mutated_config) AS s
                    WHERE s LIKE 'search_path=%')
  THEN RAISE EXCEPTION 'FACADE_EXTRA_GUC_MUTATION_UNDETECTED'; END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_FACADE_EXTRA_GUC';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_FACADE_EXTRA_GUC' THEN RAISE; END IF;
 END;
 SELECT p.proconfig INTO mutated_config FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF mutated_config IS DISTINCT FROM original_config THEN
  RAISE EXCEPTION 'FACADE_EXTRA_GUC_MUTATION_NOT_ROLLED_BACK';
 END IF;
END $facade_guc_negative_probe$;
-- The metadata checks above do not constrain a replacement SQL body. A
-- SECURITY INVOKER facade with unchanged signature, ACL and search_path could
-- still be replaced with SELECT true, bypassing private owner/receipt checks.
-- Pin the exact reviewed forwarding body in this disposable fixture only.
-- No hosted RPC is created, modified or exposed by this test.
DO $facade_body_integrity$
DECLARE expected_source text := $reviewed_body$
 SELECT ws02_owner.nbr_commit_evaluation_atomically(
  p_auth_user_id,p_taxpayer_record_id,p_assessment_year,
  p_idempotency_key,p_request_hash,p_receipt_hash,
  p_trace_hash,p_result_state,p_audit_trace);
$reviewed_body$;
        observed_source text;
BEGIN
 SELECT p.prosrc INTO observed_source
 FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF observed_source IS DISTINCT FROM expected_source THEN
  RAISE EXCEPTION 'FACADE_REVIEWED_SQL_BODY_DRIFT';
 END IF;
 -- Negative mutation: retain identical argument names, SECURITY INVOKER,
 -- VOLATILE and search_path while replacing the forwarding call with a
 -- permissive result. The exception subtransaction MUST restore the body.
 BEGIN
  EXECUTE $facade_mutation$
   CREATE OR REPLACE FUNCTION ws02_api.nbr_commit_evaluation_atomically(
    p_auth_user_id uuid,p_taxpayer_record_id uuid,p_assessment_year text,
    p_idempotency_key text,p_request_hash text,p_receipt_hash text,
    p_trace_hash text,p_result_state text,p_audit_trace jsonb
   ) RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER
   SET search_path=pg_catalog,ws02_owner AS $unsafe_body$
    SELECT true;
   $unsafe_body$;
  $facade_mutation$;
  SELECT p.prosrc INTO observed_source
  FROM pg_catalog.pg_proc p
  WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
  IF observed_source IS NOT DISTINCT FROM expected_source THEN
   RAISE EXCEPTION 'FACADE_BODY_MUTATION_WAS_NOT_DETECTED';
  END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_FACADE_BODY_MUTATION';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_FACADE_BODY_MUTATION' THEN RAISE; END IF;
 END;
 SELECT p.prosrc INTO observed_source
 FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF observed_source IS DISTINCT FROM expected_source THEN
  RAISE EXCEPTION 'FACADE_BODY_MUTATION_NOT_ROLLED_BACK';
 END IF;
END $facade_body_integrity$;
-- An RPC can retain its reviewed SQL body and EXECUTE ACL while its owner
-- drifts to a runtime role. The owner could then ALTER/REPLACE the facade.
-- Pin the ownership boundary independently of body/signature checks.
-- Disposable PG17 only: no hosted function or Auth role is touched.
DO $facade_owner_boundary$
DECLARE actual_owner name; caller name;
BEGIN
 SELECT r.rolname INTO actual_owner
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
 WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF actual_owner IS NULL THEN RAISE EXCEPTION 'FACADE_OWNER_NOT_FOUND'; END IF;
 FOREACH caller IN ARRAY ARRAY[
  'ws02_owner_anon','ws02_owner_auth','ws02_owner_engine',
  'ws02_owner_rpc','ws02_owner_lock'] LOOP
  IF pg_catalog.pg_has_role(caller,actual_owner,'MEMBER')
     OR pg_catalog.pg_has_role(caller,actual_owner,'USAGE')
     OR pg_catalog.pg_has_role(caller,actual_owner,'SET') THEN
   RAISE EXCEPTION 'FACADE_OWNER_RUNTIME_ROLE_ESCALATION_%_%',caller,actual_owner;
  END IF;
 END LOOP;
END $facade_owner_boundary$;
-- Negative owner-drift regression: reassign the facade to the synthetic Edge
-- role inside an exception subtransaction, prove catalog detection and prove
-- rollback restores the original owner. No user/production ownership data.
DO $facade_owner_negative_probe$
DECLARE original_owner oid; mutated_owner oid;
BEGIN
 SELECT p.proowner INTO original_owner
 FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 BEGIN
  ALTER FUNCTION ws02_api.nbr_commit_evaluation_atomically(
   uuid,uuid,text,text,text,text,text,text,jsonb) OWNER TO ws02_owner_engine;
  SELECT p.proowner INTO mutated_owner
  FROM pg_catalog.pg_proc p
  WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
  IF mutated_owner IS DISTINCT FROM 'ws02_owner_engine'::regrole::oid
     OR NOT pg_catalog.pg_has_role('ws02_owner_engine',mutated_owner,'MEMBER') THEN
   RAISE EXCEPTION 'FACADE_FORBIDDEN_OWNER_MUTATION_NOT_DETECTED';
  END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_FACADE_OWNER';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_FACADE_OWNER' THEN RAISE; END IF;
 END;
 SELECT p.proowner INTO mutated_owner
 FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF mutated_owner IS DISTINCT FROM original_owner THEN
  RAISE EXCEPTION 'FACADE_OWNER_MUTATION_NOT_ROLLED_BACK';
 END IF;
END $facade_owner_negative_probe$;
-- SECURITY DEFINER ownership is a separate trust boundary from facade
-- metadata. A private RPC silently re-owned by the migration superuser or
-- private table owner could bypass the reviewed role grants and RLS checks.
-- Pin the actual four private definer identities, not merely their EXECUTE ACLs.
-- This is a disposable PG17 catalog assertion, NOT hosted taxpayer Auth proof.
DO $private_definer_owner_boundary$
DECLARE candidate record; observed_owner oid; is_definer boolean;
BEGIN
 FOR candidate IN SELECT * FROM (VALUES
  ('ws02_owner.nbr_authorize_citizen_evaluation(uuid,uuid,text)','ws02_owner_rpc'),
  ('ws02_owner.nbr_reserve_citizen_evaluation(uuid,uuid,text,text,text,text)','ws02_owner_rpc'),
  ('ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)','ws02_owner_rpc'),
  ('ws02_owner.nbr_lock_active_owner(uuid,uuid,text)','ws02_owner_lock')
 ) AS expected(signature,owner_role) LOOP
  SELECT p.proowner,p.prosecdef INTO observed_owner,is_definer
  FROM pg_catalog.pg_proc p WHERE p.oid=candidate.signature::regprocedure;
  IF NOT FOUND OR observed_owner IS DISTINCT FROM candidate.owner_role::regrole::oid
     OR is_definer IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'PRIVATE_DEFINER_OWNER_OR_SECURITY_MODE_DRIFT_%',candidate.signature;
  END IF;
 END LOOP;
END $private_definer_owner_boundary$;
-- Private SECURITY DEFINER functions must retain the reviewed, immutable
-- function-local search_path. Pin all four, not only the exposed invoker facade:
-- an altered private search_path could resolve attacker-controlled objects
-- under the definer identity. Disposable PG17 catalog evidence only.
DO $private_definer_search_path_boundary$
DECLARE candidate text; observed text[];
BEGIN
 FOR candidate IN SELECT unnest(ARRAY[
  'ws02_owner.nbr_authorize_citizen_evaluation(uuid,uuid,text)',
  'ws02_owner.nbr_reserve_citizen_evaluation(uuid,uuid,text,text,text,text)',
  'ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)',
  'ws02_owner.nbr_lock_active_owner(uuid,uuid,text)'
 ]) LOOP
  SELECT p.proconfig INTO observed FROM pg_catalog.pg_proc p
  WHERE p.oid=candidate::regprocedure;
  IF NOT FOUND OR observed IS NULL
    OR cardinality(observed) IS DISTINCT FROM 1
    OR NOT EXISTS (
      SELECT 1 FROM unnest(observed) AS setting
      WHERE split_part(setting,'=',1)='search_path'
        AND replace(split_part(setting,'=',2),' ','')='pg_catalog,ws02_owner'
    ) THEN
   RAISE EXCEPTION 'PRIVATE_DEFINER_SEARCH_PATH_DRIFT_%',candidate;
  END IF;
 END LOOP;
END $private_definer_search_path_boundary$;
-- Mutation regression: prove a privileged ALTER FUNCTION that redirects the
-- private definer's lookup path is detected and rolled back, without writes
-- outside this disposable transaction.
DO $private_definer_search_path_negative_probe$
DECLARE signature text:='ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)';
        original_config text[]; mutated_config text[];
BEGIN
 SELECT p.proconfig INTO original_config FROM pg_catalog.pg_proc p
 WHERE p.oid=signature::regprocedure;
 IF original_config IS NULL OR cardinality(original_config) IS DISTINCT FROM 1
   OR replace(split_part(original_config[1],'=',2),' ','')<>'pg_catalog,ws02_owner' THEN
  RAISE EXCEPTION 'PRIVATE_DEFINER_SEARCH_PATH_BASELINE_DRIFT';
 END IF;
 BEGIN
  EXECUTE format('ALTER FUNCTION %s SET search_path = public',signature);
  SELECT p.proconfig INTO mutated_config FROM pg_catalog.pg_proc p
  WHERE p.oid=signature::regprocedure;
  IF mutated_config IS NULL
    OR cardinality(mutated_config) IS DISTINCT FROM 1
    OR NOT EXISTS (
      SELECT 1 FROM unnest(mutated_config) AS setting
      WHERE split_part(setting,'=',1)='search_path'
        AND replace(split_part(setting,'=',2),' ','')='public'
    ) THEN
   RAISE EXCEPTION 'PRIVATE_DEFINER_SEARCH_PATH_MUTATION_NOT_DETECTED';
  END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_PRIVATE_DEFINER_SEARCH_PATH';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_PRIVATE_DEFINER_SEARCH_PATH' THEN RAISE; END IF;
 END;
 SELECT p.proconfig INTO mutated_config FROM pg_catalog.pg_proc p
 WHERE p.oid=signature::regprocedure;
 IF mutated_config IS DISTINCT FROM original_config THEN
  RAISE EXCEPTION 'PRIVATE_DEFINER_SEARCH_PATH_MUTATION_NOT_ROLLED_BACK';
 END IF;
END $private_definer_search_path_negative_probe$;
-- Four private SECURITY DEFINER functions must retain their exact callable
-- contract, not just their owner and search_path. Named-argument RPC calls can
-- be redirected by renames/defaults; volatility/language/return-type drift can
-- change behavior even while ownership and ACLs remain unchanged.
-- Synthetic disposable PG17 only. This is not citizen Auth or legal proof.
DO $private_definer_metadata_boundary$
DECLARE candidate record; actual record;
BEGIN
 FOR candidate IN SELECT * FROM (VALUES
  ('ws02_owner.nbr_authorize_citizen_evaluation(uuid,uuid,text)',
   'sql','s','boolean',ARRAY['p_auth_user_id','p_taxpayer_record_id','p_assessment_year']::text[]),
  ('ws02_owner.nbr_lock_active_owner(uuid,uuid,text)',
   'plpgsql','v','boolean',ARRAY['p_auth_user_id','p_taxpayer_record_id','p_assessment_year']::text[]),
  ('ws02_owner.nbr_reserve_citizen_evaluation(uuid,uuid,text,text,text,text)',
   'plpgsql','v','jsonb',ARRAY['p_auth_user_id','p_taxpayer_record_id','p_assessment_year',
   'p_idempotency_key','p_request_hash','p_contract_version']::text[]),
  ('ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)',
   'plpgsql','v','boolean',ARRAY['p_auth_user_id','p_taxpayer_record_id','p_assessment_year',
   'p_idempotency_key','p_request_hash','p_receipt_hash','p_trace_hash','p_result_state',
   'p_audit_trace']::text[])
 ) AS expected(signature,language_name,volatility,return_type,arg_names) LOOP
  SELECT p.prosecdef,p.provolatile::text AS volatility,l.lanname::text AS language_name,
   p.prorettype,p.proargnames,p.pronargdefaults,p.provariadic,p.proretset,
   p.prokind,p.proleakproof,p.proparallel
  INTO actual FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_language l ON l.oid=p.prolang
  WHERE p.oid=candidate.signature::regprocedure;
  IF NOT FOUND OR actual.prosecdef IS DISTINCT FROM true
   OR actual.volatility IS DISTINCT FROM candidate.volatility
   OR actual.language_name IS DISTINCT FROM candidate.language_name
   OR actual.prorettype IS DISTINCT FROM candidate.return_type::regtype::oid
   OR actual.proargnames IS DISTINCT FROM candidate.arg_names
   OR actual.pronargdefaults IS DISTINCT FROM 0
   OR actual.provariadic IS DISTINCT FROM 0::oid
   OR actual.proretset IS DISTINCT FROM false
   OR actual.prokind IS DISTINCT FROM 'f'
   OR actual.proleakproof IS DISTINCT FROM false
   OR actual.proparallel IS DISTINCT FROM 'u' THEN
   RAISE EXCEPTION 'PRIVATE_DEFINER_CALLABLE_METADATA_DRIFT_%',candidate.signature;
  END IF;
 END LOOP;
END $private_definer_metadata_boundary$;
-- Mutation regression: a privileged actor silently marks the write-bearing
-- atomic definer STABLE. Verify metadata detection and exact rollback.
DO $private_definer_metadata_negative_probe$
DECLARE original_volatility "char"; mutated_volatility "char";
BEGIN
 SELECT p.provolatile INTO original_volatility FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF original_volatility IS DISTINCT FROM 'v' THEN
  RAISE EXCEPTION 'PRIVATE_DEFINER_VOLATILITY_BASELINE_DRIFT';
 END IF;
 BEGIN
  ALTER FUNCTION ws02_owner.nbr_commit_evaluation_atomically(
   uuid,uuid,text,text,text,text,text,text,jsonb) STABLE;
  SELECT p.provolatile INTO mutated_volatility FROM pg_catalog.pg_proc p
  WHERE p.oid='ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
  IF mutated_volatility IS DISTINCT FROM 's' THEN
   RAISE EXCEPTION 'PRIVATE_DEFINER_VOLATILITY_MUTATION_NOT_DETECTED';
  END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_PRIVATE_DEFINER_VOLATILITY';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_PRIVATE_DEFINER_VOLATILITY' THEN RAISE; END IF;
 END;
 SELECT p.provolatile INTO mutated_volatility FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF mutated_volatility IS DISTINCT FROM original_volatility THEN
  RAISE EXCEPTION 'PRIVATE_DEFINER_VOLATILITY_MUTATION_NOT_ROLLED_BACK';
 END IF;
END $private_definer_metadata_negative_probe$;
-- A private SECURITY DEFINER can preserve its owner, signature, ACL and
-- search_path while a privileged migration replaces its body with a permissive
-- SELECT true or omits receipt checks. Pin all four reviewed source bodies to
-- the exact isolated DDL in isolated_owner_receipt_contract.sql. PostgreSQL 17
-- built-in SHA-256 avoids extension dependencies; these are source-integrity
-- regression pins, NOT approved citizen ownership, hosted Auth or legal proof.
DO $private_definer_body_integrity$
DECLARE candidate record; observed_hash text;
BEGIN
 FOR candidate IN SELECT * FROM (VALUES
  ('ws02_owner.nbr_authorize_citizen_evaluation(uuid,uuid,text)',
   '159c9e0073fd71ddf31a786bf29bf80398e75976a18dfb97bb2b6ea909855597'),
  ('ws02_owner.nbr_lock_active_owner(uuid,uuid,text)',
   'c8b46e6aecb75600a216615691de2ee9418322e35a5fa47b3ed7372636162357'),
  ('ws02_owner.nbr_reserve_citizen_evaluation(uuid,uuid,text,text,text,text)',
   '2631e19e6067b24eb972238cff81d05128efda28edb2a973bdbad6719f2f5eb6'),
  ('ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)',
   '30f0bf609986311ecba2fcbd8bb18a790a0b04f2a2898013d4a9a074dd189436')
 ) AS expected(signature,source_sha256) LOOP
  SELECT pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
  INTO observed_hash FROM pg_catalog.pg_proc p
  WHERE p.oid=candidate.signature::regprocedure;
  IF NOT FOUND OR observed_hash IS DISTINCT FROM candidate.source_sha256 THEN
   RAISE EXCEPTION 'PRIVATE_DEFINER_REVIEWED_BODY_DRIFT_%_observed_%',
     candidate.signature,observed_hash;
  END IF;
 END LOOP;
END $private_definer_body_integrity$;
-- Negative regression: an authorized migration actor replaces the owner
-- authorization body with SELECT true, retaining SQL/STABLE/SECURITY DEFINER,
-- named parameters, owner and fixed search_path. The body pin MUST detect
-- the bypass and the exception subtransaction MUST restore the original body.
DO $private_definer_body_negative_probe$
DECLARE original_source text; mutated_source text; mutated_hash text;
BEGIN
 SELECT p.prosrc INTO original_source FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_owner.nbr_authorize_citizen_evaluation(uuid,uuid,text)'::regprocedure;
 IF original_source IS NULL THEN
  RAISE EXCEPTION 'PRIVATE_AUTH_BODY_BASELINE_MISSING';
 END IF;
 BEGIN
  EXECUTE $body_mutation$
   CREATE OR REPLACE FUNCTION ws02_owner.nbr_authorize_citizen_evaluation(
    p_auth_user_id uuid,p_taxpayer_record_id uuid,p_assessment_year text
   ) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
   SET search_path=pg_catalog,ws02_owner AS $unsafe_private_body$
    SELECT true;
   $unsafe_private_body$;
  $body_mutation$;
  SELECT p.prosrc,pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
  INTO mutated_source,mutated_hash FROM pg_catalog.pg_proc p
  WHERE p.oid='ws02_owner.nbr_authorize_citizen_evaluation(uuid,uuid,text)'::regprocedure;
  IF mutated_source IS NOT DISTINCT FROM original_source
    OR mutated_hash IS NOT DISTINCT FROM
      '159c9e0073fd71ddf31a786bf29bf80398e75976a18dfb97bb2b6ea909855597'
  THEN RAISE EXCEPTION 'PRIVATE_AUTH_BODY_BYPASS_NOT_DETECTED'; END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_PRIVATE_AUTH_BODY';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_PRIVATE_AUTH_BODY' THEN RAISE; END IF;
 END;
 SELECT p.prosrc INTO mutated_source FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_owner.nbr_authorize_citizen_evaluation(uuid,uuid,text)'::regprocedure;
 IF mutated_source IS DISTINCT FROM original_source THEN
  RAISE EXCEPTION 'PRIVATE_AUTH_BODY_MUTATION_NOT_ROLLED_BACK';
 END IF;
END $private_definer_body_negative_probe$;
-- Negative regression: a privileged migration actor reassigns the atomic
-- SECURITY DEFINER function to itself without changing its body or grants.
-- Detect the elevation and verify exception-subtransaction rollback restores
-- the exact non-login definer owner. Never run this against hosted Supabase.
DO $private_definer_owner_negative_probe$
DECLARE original_owner oid; mutated_owner oid;
BEGIN
 SELECT p.proowner INTO original_owner FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF original_owner IS DISTINCT FROM 'ws02_owner_rpc'::regrole::oid THEN
  RAISE EXCEPTION 'PRIVATE_DEFINER_OWNER_BASELINE_DRIFT';
 END IF;
 BEGIN
  EXECUTE format('ALTER FUNCTION ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb) OWNER TO %I',current_user);
  SELECT p.proowner INTO mutated_owner FROM pg_catalog.pg_proc p
  WHERE p.oid='ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
  IF mutated_owner IS DISTINCT FROM current_user::regrole::oid
     OR mutated_owner IS NOT DISTINCT FROM original_owner THEN
   RAISE EXCEPTION 'PRIVATE_DEFINER_OWNER_ESCALATION_NOT_DETECTED';
  END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_PRIVATE_DEFINER_OWNER';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_PRIVATE_DEFINER_OWNER' THEN RAISE; END IF;
 END;
 SELECT p.proowner INTO mutated_owner FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF mutated_owner IS DISTINCT FROM original_owner THEN
  RAISE EXCEPTION 'PRIVATE_DEFINER_OWNER_ESCALATION_NOT_ROLLED_BACK';
 END IF;
END $private_definer_owner_negative_probe$;
-- API-surface drift guard: a second overload or future RPC in the exposed
-- schema could bypass the reviewed signature-specific ACL checks. The isolated
-- PostgREST-style schema must contain only this one reviewed facade, and no
-- untrusted role may EXECUTE any function in it. No hosted schema is changed.
DO $facade_surface$
DECLARE rpc_count integer;
BEGIN
 SELECT count(*) INTO rpc_count
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='ws02_api';
 IF rpc_count<>1 THEN
  RAISE EXCEPTION 'FACADE_API_SURFACE_DRIFT_FUNCTION_COUNT_%',rpc_count;
 END IF;
 -- PostgREST exposes granted relations as well as RPCs. A later view,
 -- table, foreign table, materialized view or sequence in the nominated
 -- API schema must never be silently accepted by this reviewed facade.
 IF EXISTS(
  SELECT 1 FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='ws02_api'
    AND c.relkind IN ('r','p','v','m','f','S')
 ) THEN
  RAISE EXCEPTION 'FACADE_API_SURFACE_DRIFT_RELATION_PRESENT';
 END IF;
 IF EXISTS(
  SELECT 1 FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='nbr_commit_evaluation_atomically'
 ) THEN
  RAISE EXCEPTION 'FACADE_PUBLIC_SHADOW_RPC_PRESENT';
 END IF;
 IF EXISTS(
  SELECT 1 FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='ws02_api'
    AND (pg_catalog.has_function_privilege('ws02_owner_anon',p.oid,'EXECUTE')
      OR pg_catalog.has_function_privilege('ws02_owner_auth',p.oid,'EXECUTE'))
 ) THEN
  RAISE EXCEPTION 'FACADE_UNTRUSTED_ROLE_CAN_EXECUTE_API_ROUTINE';
 END IF;
END $facade_surface$;
-- Regression for the existing API-surface invariant: an additional named
-- overload in ws02_api or a same-name public shadow RPC must be rejected,
-- even if its default EXECUTE ACL is already revoked. PostgreSQL/PostgREST
-- function resolution must not silently gain an unreviewed alternate path.
-- Both synthetic functions are created and rolled back inside PG17 only.
DO $facade_shadow_rpc_negative_probe$
DECLARE candidate text; observed integer; baseline integer;
BEGIN
 SELECT count(*) INTO baseline FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='ws02_api';
 IF baseline<>1 OR EXISTS(
  SELECT 1 FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='nbr_commit_evaluation_atomically'
 ) THEN RAISE EXCEPTION 'FACADE_SHADOW_PROBE_BASELINE_DRIFT'; END IF;
 FOREACH candidate IN ARRAY ARRAY['OVERLOAD','PUBLIC_SHADOW'] LOOP
  BEGIN
   IF candidate='OVERLOAD' THEN
    EXECUTE $ddl$CREATE FUNCTION ws02_api.nbr_commit_evaluation_atomically(payload jsonb)
      RETURNS boolean LANGUAGE sql SECURITY INVOKER AS $body$ SELECT true $body$ $ddl$;
    SELECT count(*) INTO observed FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='ws02_api';
    IF observed<>2 THEN RAISE EXCEPTION 'FACADE_OVERLOAD_MUTATION_UNDETECTED'; END IF;
   ELSE
    EXECUTE $ddl$CREATE FUNCTION public.nbr_commit_evaluation_atomically(payload jsonb)
      RETURNS boolean LANGUAGE sql SECURITY INVOKER AS $body$ SELECT true $body$ $ddl$;
    SELECT count(*) INTO observed FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='nbr_commit_evaluation_atomically';
    IF observed<>1 THEN RAISE EXCEPTION 'FACADE_PUBLIC_SHADOW_MUTATION_UNDETECTED'; END IF;
   END IF;
   RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_FACADE_SHADOW_%',candidate;
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'ROLLBACK_SYNTHETIC_FACADE_SHADOW_'||candidate THEN RAISE; END IF;
  END;
  IF pg_catalog.to_regprocedure('ws02_api.nbr_commit_evaluation_atomically(jsonb)') IS NOT NULL
    OR pg_catalog.to_regprocedure('public.nbr_commit_evaluation_atomically(jsonb)') IS NOT NULL
  THEN RAISE EXCEPTION 'FACADE_SHADOW_MUTATION_NOT_ROLLED_BACK_%',candidate; END IF;
 END LOOP;
 RAISE NOTICE 'PASS_SCOPED_FACADE_OVERLOAD_AND_PUBLIC_SHADOW_ROLLBACK_TWO_CASES';
END $facade_shadow_rpc_negative_probe$;
-- Negative fixture: verify that the catalog check sees BOTH a new table and
-- a new view. Each probe is rolled back by its own PL/pgSQL subtransaction.
-- This is not a hosted PostgREST or citizen-data integration test.
DO $facade_relation_probe$
DECLARE relation_kind text; discovered boolean;
BEGIN
 FOREACH relation_kind IN ARRAY ARRAY['TABLE','VIEW'] LOOP
  BEGIN
   IF relation_kind='TABLE' THEN
    EXECUTE 'CREATE TABLE ws02_api.__exposure_probe (synthetic integer)';
   ELSE
    EXECUTE 'CREATE VIEW ws02_api.__exposure_probe AS SELECT 1 AS synthetic';
   END IF;
   SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='ws02_api'
      AND c.relkind IN ('r','p','v','m','f','S')
   ) INTO discovered;
   IF NOT discovered THEN
    RAISE EXCEPTION 'FACADE_RELATION_EXPOSURE_NOT_DETECTED_%',relation_kind;
   END IF;
   RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_FACADE_RELATION';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'ROLLBACK_SYNTHETIC_FACADE_RELATION' THEN RAISE; END IF;
  END;
 END LOOP;
 IF EXISTS(
  SELECT 1 FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='ws02_api' AND c.relname='__exposure_probe'
 ) THEN
  RAISE EXCEPTION 'FACADE_NEGATIVE_RELATION_PROBE_NOT_ROLLED_BACK';
 END IF;
END $facade_relation_probe$;
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
-- An unknown role is not covered by checking only the synthetic anon/auth roles.
-- Require an exact grantee allowlist on BOTH the API function and its schema,
-- and deny grant options to the synthetic engine. Disposable PG17 only.
DO $facade_exact_grantee_allowlist$
BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_catalog.pg_proc p
  CROSS JOIN LATERAL pg_catalog.aclexplode(
   COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
  WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure
    AND (a.grantee=0
      OR a.grantee NOT IN ('ws02_owner_engine'::regrole::oid,p.proowner)
      OR a.privilege_type<>'EXECUTE'
      OR (a.grantee='ws02_owner_engine'::regrole::oid AND a.is_grantable))
 ) THEN RAISE EXCEPTION 'FACADE_UNREVIEWED_FUNCTION_GRANTEE_OR_GRANT_OPTION'; END IF;
 IF EXISTS (
  SELECT 1 FROM pg_catalog.pg_namespace n
  CROSS JOIN LATERAL pg_catalog.aclexplode(
   COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) a
  WHERE n.nspname='ws02_api'
    AND (a.grantee=0
      OR a.grantee NOT IN ('ws02_owner_engine'::regrole::oid,n.nspowner)
      OR (a.grantee='ws02_owner_engine'::regrole::oid
          AND (a.privilege_type<>'USAGE' OR a.is_grantable)))
 ) THEN RAISE EXCEPTION 'FACADE_UNREVIEWED_SCHEMA_GRANTEE_OR_GRANT_OPTION'; END IF;
END $facade_exact_grantee_allowlist$;
-- Inject an otherwise unreviewed role with BOTH schema USAGE and RPC EXECUTE.
-- Prove the exact ACL guard detects it and the subtransaction rolls it back.
-- The role exists only in this disposable fixture; it is not an Auth principal.
DO $facade_unreviewed_grantee_negative_probe$
DECLARE leaked_schema boolean; leaked_function boolean;
BEGIN
 IF pg_catalog.has_schema_privilege('ws02_owner_lock','ws02_api','USAGE')
    OR pg_catalog.has_function_privilege('ws02_owner_lock',
     'ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)',
     'EXECUTE')
 THEN RAISE EXCEPTION 'FACADE_UNREVIEWED_ROLE_ALREADY_PRIVILEGED'; END IF;
 BEGIN
  GRANT USAGE ON SCHEMA ws02_api TO ws02_owner_lock;
  GRANT EXECUTE ON FUNCTION ws02_api.nbr_commit_evaluation_atomically(
   uuid,uuid,text,text,text,text,text,text,jsonb) TO ws02_owner_lock;
  SELECT EXISTS(
   SELECT 1 FROM pg_catalog.pg_namespace n
   CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) a
   WHERE n.nspname='ws02_api' AND a.grantee='ws02_owner_lock'::regrole::oid
     AND a.privilege_type='USAGE') INTO leaked_schema;
  SELECT EXISTS(
   SELECT 1 FROM pg_catalog.pg_proc p
   CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
   WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure
     AND a.grantee='ws02_owner_lock'::regrole::oid
     AND a.privilege_type='EXECUTE') INTO leaked_function;
  IF NOT leaked_schema OR NOT leaked_function THEN
   RAISE EXCEPTION 'FACADE_UNREVIEWED_ROLE_GRANT_NOT_DETECTED';
  END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_FACADE_UNREVIEWED_GRANT';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_FACADE_UNREVIEWED_GRANT' THEN RAISE; END IF;
 END;
 IF pg_catalog.has_schema_privilege('ws02_owner_lock','ws02_api','USAGE')
    OR pg_catalog.has_function_privilege('ws02_owner_lock',
     'ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)',
     'EXECUTE')
 THEN RAISE EXCEPTION 'FACADE_UNREVIEWED_GRANT_NOT_ROLLED_BACK'; END IF;
END $facade_unreviewed_grantee_negative_probe$;
-- PUBLIC is a distinct grant target: every present/future PostgREST role
-- inherits it, even when the named anon/auth ACLs remain unchanged. Mutate
-- BOTH schema USAGE and function EXECUTE inside a disposable subtransaction,
-- assert the effective access and catalog drift, then verify full rollback.
-- No hosted schema or public endpoint is created by this test.
DO $facade_public_grant_negative_probe$
DECLARE leaked_schema boolean; leaked_function boolean;
BEGIN
 IF pg_catalog.has_schema_privilege('ws02_owner_auth','ws02_api','USAGE')
    OR pg_catalog.has_function_privilege('ws02_owner_auth',
      'ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)',
      'EXECUTE')
 THEN RAISE EXCEPTION 'FACADE_PUBLIC_GRANT_BASELINE_ALREADY_OPEN'; END IF;
 BEGIN
  GRANT USAGE ON SCHEMA ws02_api TO PUBLIC;
  GRANT EXECUTE ON FUNCTION ws02_api.nbr_commit_evaluation_atomically(
   uuid,uuid,text,text,text,text,text,text,jsonb) TO PUBLIC;
  SELECT EXISTS (
   SELECT 1 FROM pg_catalog.pg_namespace n
   CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) a
   WHERE n.nspname='ws02_api' AND a.grantee=0
     AND a.privilege_type='USAGE'
  ) INTO leaked_schema;
  SELECT EXISTS (
   SELECT 1 FROM pg_catalog.pg_proc p
   CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
   WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure
     AND a.grantee=0 AND a.privilege_type='EXECUTE'
  ) INTO leaked_function;
  IF NOT leaked_schema OR NOT leaked_function
     OR NOT pg_catalog.has_schema_privilege('ws02_owner_auth','ws02_api','USAGE')
     OR NOT pg_catalog.has_function_privilege('ws02_owner_anon',
      'ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)',
      'EXECUTE')
  THEN RAISE EXCEPTION 'FACADE_PUBLIC_GRANT_MUTATION_NOT_DETECTED'; END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_FACADE_PUBLIC_GRANT';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_FACADE_PUBLIC_GRANT' THEN RAISE; END IF;
 END;
 IF pg_catalog.has_schema_privilege('ws02_owner_auth','ws02_api','USAGE')
    OR pg_catalog.has_schema_privilege('ws02_owner_anon','ws02_api','USAGE')
    OR pg_catalog.has_function_privilege('ws02_owner_auth',
     'ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)',
     'EXECUTE')
    OR pg_catalog.has_function_privilege('ws02_owner_anon',
     'ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)',
     'EXECUTE')
    OR EXISTS (
     SELECT 1 FROM pg_catalog.pg_namespace n
     CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) a
     WHERE n.nspname='ws02_api' AND a.grantee=0
    )
    OR EXISTS (
     SELECT 1 FROM pg_catalog.pg_proc p
     CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
     WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure
       AND a.grantee=0
    )
 THEN RAISE EXCEPTION 'FACADE_PUBLIC_GRANT_ROLLBACK_INCOMPLETE'; END IF;
 RAISE NOTICE 'PASS_SCOPED_PUBLIC_SCHEMA_AND_FUNCTION_GRANT_ROLLBACK';
END $facade_public_grant_negative_probe$;
-- An engine WITH GRANT OPTION can delegate the RPC to an unreviewed role.
-- A mutation must be visible in pg_catalog ACLs and fully rolled back.
DO $facade_grant_option_negative_probe$
DECLARE elevated boolean;
BEGIN
 BEGIN
  GRANT EXECUTE ON FUNCTION ws02_api.nbr_commit_evaluation_atomically(
   uuid,uuid,text,text,text,text,text,text,jsonb)
   TO ws02_owner_engine WITH GRANT OPTION;
  SELECT EXISTS(
   SELECT 1 FROM pg_catalog.pg_proc p
   CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
   WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure
     AND a.grantee='ws02_owner_engine'::regrole::oid
     AND a.is_grantable) INTO elevated;
  IF NOT elevated THEN RAISE EXCEPTION 'FACADE_GRANT_OPTION_NOT_DETECTED'; END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_FACADE_GRANT_OPTION';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_FACADE_GRANT_OPTION' THEN RAISE; END IF;
 END;
 IF EXISTS(
  SELECT 1 FROM pg_catalog.pg_proc p
  CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
  WHERE p.oid='ws02_api.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure
    AND a.grantee='ws02_owner_engine'::regrole::oid AND a.is_grantable)
 THEN RAISE EXCEPTION 'FACADE_GRANT_OPTION_NOT_ROLLED_BACK'; END IF;
END $facade_grant_option_negative_probe$;
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
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'UNTRUSTED_ROLE_HAS_PRIVATE_TABLE_ACCESS_%_%',caller,relation_name;
   END IF;
  END LOOP;
 END LOOP;
END $private_boundary$;
-- Negative role-graph mutation: an otherwise denied anon/auth caller must
-- not acquire the trusted Edge or private definer role through an accidental
-- role membership. Prove each of six forbidden grants is visible and fully
-- rolled back by an isolated PG17 exception subtransaction.
-- Synthetic roles only: this does NOT validate signed/revoked JWTs.
DO $untrusted_membership_negative_probe$
DECLARE caller name; elevated name; detected boolean;
BEGIN
 FOREACH caller IN ARRAY ARRAY['ws02_owner_anon','ws02_owner_auth'] LOOP
  FOREACH elevated IN ARRAY ARRAY[
   'ws02_owner_engine','ws02_owner_rpc','ws02_owner_lock'] LOOP
   IF pg_catalog.pg_has_role(caller,elevated,'MEMBER')
      OR pg_catalog.pg_has_role(caller,elevated,'USAGE')
      OR pg_catalog.pg_has_role(caller,elevated,'SET') THEN
    RAISE EXCEPTION 'UNTRUSTED_ROLE_ALREADY_ELEVATED_%_%',caller,elevated;
   END IF;
   BEGIN
    EXECUTE format('GRANT %I TO %I',elevated,caller);
    SELECT pg_catalog.pg_has_role(caller,elevated,'MEMBER')
        OR pg_catalog.pg_has_role(caller,elevated,'USAGE')
        OR pg_catalog.pg_has_role(caller,elevated,'SET')
    INTO detected;
    IF NOT detected THEN
     RAISE EXCEPTION 'UNTRUSTED_ROLE_MEMBERSHIP_MUTATION_UNDETECTED_%_%',
       caller,elevated;
    END IF;
    RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_UNTRUSTED_MEMBERSHIP';
   EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'ROLLBACK_SYNTHETIC_UNTRUSTED_MEMBERSHIP' THEN RAISE; END IF;
   END;
   IF pg_catalog.pg_has_role(caller,elevated,'MEMBER')
      OR pg_catalog.pg_has_role(caller,elevated,'USAGE')
      OR pg_catalog.pg_has_role(caller,elevated,'SET') THEN
    RAISE EXCEPTION 'UNTRUSTED_ROLE_MEMBERSHIP_NOT_ROLLED_BACK_%_%',
      caller,elevated;
   END IF;
  END LOOP;
 END LOOP;
END $untrusted_membership_negative_probe$;
-- A trusted Edge runtime is not a private SQL-definer. Granting it
-- membership in the receipt/row-lock definer roles would bypass the reviewed
-- atomic-RPC-only boundary even while anon/auth ACL probes continue to pass.
-- This is a synthetic role-graph check, NOT hosted Auth authorization.
DO $engine_definer_membership_boundary$
DECLARE elevated name; relation_name text;
BEGIN
 FOREACH elevated IN ARRAY ARRAY['ws02_owner_rpc','ws02_owner_lock'] LOOP
  IF pg_catalog.pg_has_role('ws02_owner_engine',elevated,'MEMBER')
     OR pg_catalog.pg_has_role('ws02_owner_engine',elevated,'USAGE')
     OR pg_catalog.pg_has_role('ws02_owner_engine',elevated,'SET') THEN
   RAISE EXCEPTION 'ENGINE_CAN_ASSUME_PRIVATE_DEFINER_%',elevated;
  END IF;
 END LOOP;
 FOREACH relation_name IN ARRAY ARRAY[
   'ws02_owner.owners','ws02_owner.slots','ws02_owner.evaluation_logs'] LOOP
  IF pg_catalog.has_table_privilege('ws02_owner_engine',relation_name,
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
   RAISE EXCEPTION 'ENGINE_INHERITS_PRIVATE_RELATION_DML_%',relation_name;
  END IF;
 END LOOP;
END $engine_definer_membership_boundary$;
-- Negative role-graph regression: inject each forbidden membership and prove
-- it is detected; PL/pgSQL exception subtransactions roll back every GRANT.
DO $engine_membership_negative_probe$
DECLARE elevated name; detected boolean;
BEGIN
 FOREACH elevated IN ARRAY ARRAY['ws02_owner_rpc','ws02_owner_lock'] LOOP
  BEGIN
   EXECUTE format('GRANT %I TO ws02_owner_engine',elevated);
   SELECT pg_catalog.pg_has_role('ws02_owner_engine',elevated,'MEMBER')
      OR pg_catalog.pg_has_role('ws02_owner_engine',elevated,'USAGE')
      OR pg_catalog.pg_has_role('ws02_owner_engine',elevated,'SET')
   INTO detected;
   IF NOT detected THEN
    RAISE EXCEPTION 'FORBIDDEN_ENGINE_MEMBERSHIP_UNDETECTED_%',elevated;
   END IF;
   RAISE EXCEPTION 'ROLLBACK_FORBIDDEN_ENGINE_MEMBERSHIP';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'ROLLBACK_FORBIDDEN_ENGINE_MEMBERSHIP' THEN RAISE; END IF;
  END;
  IF pg_catalog.pg_has_role('ws02_owner_engine',elevated,'MEMBER')
     OR pg_catalog.pg_has_role('ws02_owner_engine',elevated,'USAGE')
     OR pg_catalog.pg_has_role('ws02_owner_engine',elevated,'SET') THEN
   RAISE EXCEPTION 'FORBIDDEN_ENGINE_MEMBERSHIP_NOT_ROLLED_BACK_%',elevated;
  END IF;
 END LOOP;
END $engine_membership_negative_probe$;
-- Private relation privileges beyond row DML matter: TRUNCATE bypasses RLS,
-- REFERENCES can expose relationship metadata, and TRIGGER can mutate the
-- audited write path. Neither untrusted API roles nor the Edge runtime may
-- inherit any of these capabilities on the private owner/receipt relations.
-- Inject each forbidden grant in a synthetic subtransaction, detect it with
-- the same PostgreSQL ACL primitive, then prove the grant was rolled back.
-- This is NOT a signed JWT, real taxpayer ownership or hosted ACL test.
DO $private_relation_capability_negative_probe$
DECLARE probe record; detected boolean;
BEGIN
 FOR probe IN SELECT * FROM (VALUES
   ('ws02_owner_engine','ws02_owner.evaluation_logs','TRUNCATE'),
   ('ws02_owner_auth','ws02_owner.owners','REFERENCES'),
   ('ws02_owner_anon','ws02_owner.slots','TRIGGER')
 ) AS cases(caller,relation_name,capability) LOOP
  IF pg_catalog.has_table_privilege(probe.caller,probe.relation_name,probe.capability) THEN
   RAISE EXCEPTION 'PRIVATE_RELATION_CAPABILITY_ALREADY_PRESENT_%_%',
     probe.caller,probe.capability;
  END IF;
  BEGIN
   EXECUTE format('GRANT %s ON TABLE %s TO %I',
     probe.capability,probe.relation_name,probe.caller);
   SELECT pg_catalog.has_table_privilege(
     probe.caller,probe.relation_name,probe.capability) INTO detected;
   IF NOT detected THEN
    RAISE EXCEPTION 'FORBIDDEN_RELATION_CAPABILITY_NOT_DETECTED_%_%',
      probe.caller,probe.capability;
   END IF;
   RAISE EXCEPTION 'ROLLBACK_PRIVATE_RELATION_CAPABILITY';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'ROLLBACK_PRIVATE_RELATION_CAPABILITY' THEN RAISE; END IF;
  END;
  IF pg_catalog.has_table_privilege(probe.caller,probe.relation_name,probe.capability) THEN
   RAISE EXCEPTION 'PRIVATE_RELATION_CAPABILITY_GRANT_NOT_ROLLED_BACK_%_%',
     probe.caller,probe.capability;
  END IF;
 END LOOP;
END $private_relation_capability_negative_probe$;
-- Guard against schema-level DDL privilege drift. EXECUTE/USAGE denials alone
-- are insufficient if an untrusted or runtime role can create shadow objects
-- in either the exposed facade schema or the private owner schema.
-- These are disposable PG17 role ACL assertions, NOT hosted Auth evidence.
DO $schema_ddl_boundary$
DECLARE caller name; schema_name text;
BEGIN
 FOREACH caller IN ARRAY ARRAY[
  'ws02_owner_anon','ws02_owner_auth','ws02_owner_engine',
  'ws02_owner_rpc','ws02_owner_lock'] LOOP
  -- A CREATE grant on public also permits an unreviewed shadow RPC.
  FOREACH schema_name IN ARRAY ARRAY['ws02_api','ws02_owner','public'] LOOP
   IF pg_catalog.has_schema_privilege(caller,schema_name,'CREATE') THEN
    RAISE EXCEPTION 'UNTRUSTED_OR_RUNTIME_ROLE_CAN_CREATE_IN_SCHEMA_%_%',
     caller,schema_name;
   END IF;
  END LOOP;
 END LOOP;
END $schema_ddl_boundary$;

-- Regression: each CREATE grant is injected into a disposable subtransaction,
-- detected by the same catalog primitive, then rolled back. Never hosted.
DO $schema_ddl_negative_probe$
DECLARE probe record; detected boolean;
BEGIN
 FOR probe IN SELECT * FROM (VALUES
   ('ws02_owner_auth','ws02_api'),
   ('ws02_owner_engine','ws02_owner'),
   ('ws02_owner_anon','public')
 ) AS cases(caller,schema_name) LOOP
  IF pg_catalog.has_schema_privilege(probe.caller,probe.schema_name,'CREATE') THEN
   RAISE EXCEPTION 'SCHEMA_CREATE_PRIVILEGE_ALREADY_PRESENT_%_%',
     probe.caller,probe.schema_name;
  END IF;
  BEGIN
   EXECUTE format('GRANT CREATE ON SCHEMA %I TO %I',
     probe.schema_name,probe.caller);
   SELECT pg_catalog.has_schema_privilege(
     probe.caller,probe.schema_name,'CREATE') INTO detected;
   IF NOT detected THEN
    RAISE EXCEPTION 'SCHEMA_CREATE_GRANT_NOT_DETECTED_%_%',
      probe.caller,probe.schema_name;
   END IF;
   RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_SCHEMA_CREATE';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'ROLLBACK_SYNTHETIC_SCHEMA_CREATE' THEN RAISE; END IF;
  END;
  IF pg_catalog.has_schema_privilege(probe.caller,probe.schema_name,'CREATE') THEN
   RAISE EXCEPTION 'SCHEMA_CREATE_GRANT_NOT_ROLLED_BACK_%_%',
     probe.caller,probe.schema_name;
  END IF;
 END LOOP;
END $schema_ddl_negative_probe$;
-- Runtime-role capability and ownership drift guard. A NOLOGIN facade role
-- must not become a login, BYPASSRLS, superuser, DDL/replication role, or
-- owner/member of a private relation owner. RLS and ACL checks alone would
-- miss an accidental role attribute or inherited table-owner bypass.
-- All roles and tables are synthetic in this disposable PG17 database.
DO $runtime_role_boundary$
DECLARE role_name name; role_row record; rel record;
BEGIN
 FOR role_row IN
  SELECT rolname,rolsuper,rolbypassrls,rolcanlogin,rolcreatedb,
         rolcreaterole,rolreplication
  FROM pg_catalog.pg_roles
  WHERE rolname IN ('ws02_owner_anon','ws02_owner_auth',
    'ws02_owner_engine','ws02_owner_rpc','ws02_owner_lock')
 LOOP
  IF role_row.rolsuper OR role_row.rolbypassrls OR role_row.rolcanlogin
    OR role_row.rolcreatedb OR role_row.rolcreaterole
    OR role_row.rolreplication THEN
   RAISE EXCEPTION 'SYNTHETIC_RUNTIME_ROLE_ELEVATED_%',role_row.rolname;
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_catalog.pg_roles
     WHERE rolname IN ('ws02_owner_anon','ws02_owner_auth',
       'ws02_owner_engine','ws02_owner_rpc','ws02_owner_lock'))<>5 THEN
  RAISE EXCEPTION 'SYNTHETIC_RUNTIME_ROLE_MISSING';
 END IF;
 FOR rel IN
  SELECT c.oid,c.relname,c.relowner
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='ws02_owner'
    AND c.relname IN ('owners','slots','evaluation_logs')
    AND c.relkind IN ('r','p')
 LOOP
  FOREACH role_name IN ARRAY ARRAY[
    'ws02_owner_anon','ws02_owner_auth','ws02_owner_engine',
    'ws02_owner_rpc','ws02_owner_lock'] LOOP
   IF pg_catalog.pg_has_role(role_name,rel.relowner,'MEMBER') THEN
    RAISE EXCEPTION 'RUNTIME_ROLE_INHERITS_PRIVATE_TABLE_OWNER_%_%',
      role_name,rel.relname;
   END IF;
  END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='ws02_owner'
       AND c.relname IN ('owners','slots','evaluation_logs')
       AND c.relkind IN ('r','p'))<>3 THEN
  RAISE EXCEPTION 'PRIVATE_RELATION_INVENTORY_DRIFT';
 END IF;
END $runtime_role_boundary$;
-- A private table-owner reassignment bypasses row-level security even if
-- ACLs and policy definitions stay unchanged. Exercise two distinct synthetic
-- owner-takeover attempts, verify the runtime-role owner check detects each,
-- and prove PostgreSQL exception subtransactions restore the original owners.
-- No hosted SQL, citizen Auth mapping or user data is touched.
DO $private_table_owner_takeover_negative_probe$
DECLARE candidate record; original_owner oid; mutated_owner oid; restored_owner oid;
BEGIN
 FOR candidate IN SELECT * FROM (VALUES
  ('owners','ws02_owner_auth'),
  ('evaluation_logs','ws02_owner_engine')
 ) AS cases(relation_name,forbidden_owner) LOOP
  SELECT c.relowner INTO STRICT original_owner
  FROM pg_catalog.pg_class c
  WHERE c.oid=format('ws02_owner.%I',candidate.relation_name)::regclass;
  IF pg_catalog.pg_has_role(candidate.forbidden_owner,original_owner,'MEMBER') THEN
   RAISE EXCEPTION 'PRIVATE_TABLE_OWNER_TAKEOVER_BASELINE_DRIFT_%',
    candidate.relation_name;
  END IF;
  BEGIN
   EXECUTE format('ALTER TABLE ws02_owner.%I OWNER TO %I',
    candidate.relation_name,candidate.forbidden_owner);
   SELECT c.relowner INTO STRICT mutated_owner
   FROM pg_catalog.pg_class c
   WHERE c.oid=format('ws02_owner.%I',candidate.relation_name)::regclass;
   IF mutated_owner IS DISTINCT FROM candidate.forbidden_owner::regrole::oid
      OR NOT pg_catalog.pg_has_role(candidate.forbidden_owner,mutated_owner,'MEMBER') THEN
    RAISE EXCEPTION 'PRIVATE_TABLE_OWNER_TAKEOVER_UNDETECTED_%',
     candidate.relation_name;
   END IF;
   RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_PRIVATE_TABLE_OWNER_TAKEOVER';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'ROLLBACK_SYNTHETIC_PRIVATE_TABLE_OWNER_TAKEOVER' THEN
    RAISE;
   END IF;
  END;
  SELECT c.relowner INTO STRICT restored_owner
  FROM pg_catalog.pg_class c
  WHERE c.oid=format('ws02_owner.%I',candidate.relation_name)::regclass;
  IF restored_owner IS DISTINCT FROM original_owner THEN
   RAISE EXCEPTION 'PRIVATE_TABLE_OWNER_TAKEOVER_NOT_ROLLED_BACK_%',
    candidate.relation_name;
  END IF;
 END LOOP;
 RAISE NOTICE 'PASS_SCOPED_PRIVATE_TABLE_OWNER_TAKEOVER_ROLLBACK_TWO_CASES';
END $private_table_owner_takeover_negative_probe$;
-- Role-attribute negative regression: even with intact function/schema ACLs,
-- accidental LOGIN or BYPASSRLS on a synthetic PostgREST/Edge role would
-- invalidate the least-privilege assumptions. Inject one attribute at a time,
-- detect the changed pg_roles flag, and prove subtransaction rollback.
-- This tests isolated catalog behavior, NOT real signed JWT revocation.
DO $runtime_role_attribute_negative_probe$
DECLARE candidate record; observed boolean;
BEGIN
 FOR candidate IN SELECT * FROM (VALUES
  ('ws02_owner_auth','LOGIN'),
  ('ws02_owner_auth','BYPASSRLS'),
  ('ws02_owner_engine','LOGIN'),
  ('ws02_owner_engine','BYPASSRLS')
 ) AS cases(role_name,attribute_name) LOOP
  SELECT CASE candidate.attribute_name
   WHEN 'LOGIN' THEN r.rolcanlogin
   ELSE r.rolbypassrls END
  INTO observed FROM pg_catalog.pg_roles r
  WHERE r.rolname=candidate.role_name;
  IF observed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'RUNTIME_ROLE_ATTRIBUTE_BASELINE_DRIFT_%_%',
    candidate.role_name,candidate.attribute_name;
  END IF;
  BEGIN
   EXECUTE format('ALTER ROLE %I %s',
    candidate.role_name,candidate.attribute_name);
   SELECT CASE candidate.attribute_name
    WHEN 'LOGIN' THEN r.rolcanlogin
    ELSE r.rolbypassrls END
   INTO observed FROM pg_catalog.pg_roles r
   WHERE r.rolname=candidate.role_name;
   IF observed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RUNTIME_ROLE_ATTRIBUTE_MUTATION_UNDETECTED_%_%',
     candidate.role_name,candidate.attribute_name;
   END IF;
   RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_ROLE_ATTRIBUTE';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'ROLLBACK_SYNTHETIC_ROLE_ATTRIBUTE' THEN RAISE; END IF;
  END;
  SELECT CASE candidate.attribute_name
   WHEN 'LOGIN' THEN r.rolcanlogin
   ELSE r.rolbypassrls END
  INTO observed FROM pg_catalog.pg_roles r
  WHERE r.rolname=candidate.role_name;
  IF observed IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'RUNTIME_ROLE_ATTRIBUTE_MUTATION_NOT_ROLLED_BACK_%_%',
    candidate.role_name,candidate.attribute_name;
  END IF;
 END LOOP;
END $runtime_role_attribute_negative_probe$;
-- Policy inventory regression: ACL denial is not enough if a later change
-- disables RLS or adds a permissive policy for a new/untrusted role.
-- Pin the seven private policies and their exact role/command boundaries.
-- This is disposable PG17 metadata evidence, not hosted Supabase Auth proof.
DO $rls_policy_boundary$
DECLARE missing_or_extra integer;
BEGIN
 IF (SELECT count(*) FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='ws02_owner'
       AND c.relname IN ('owners','slots','evaluation_logs')
       AND c.relrowsecurity)=0 OR
    (SELECT count(*) FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
     WHERE n.nspname='ws02_owner'
       AND c.relname IN ('owners','slots','evaluation_logs')
       AND c.relrowsecurity)<>3 THEN
  RAISE EXCEPTION 'PRIVATE_OWNER_TABLE_RLS_DISABLED';
 END IF;
 WITH expected(relname,polname,cmd,roles,permissive,using_expr,check_expr) AS (
  -- Policy names, roles and commands alone are insufficient: a changed
  -- USING/WITH CHECK predicate or RESTRICTIVE/PERMISSIVE switch can silently
  -- change the trusted-definer's effective row access. Pin the actual PG17
  -- catalog expressions in this synthetic-only contract.
  VALUES
   ('owners','owners_rpc_lock_read','r',ARRAY['ws02_owner_lock','ws02_owner_rpc']::text[],true,'true',NULL::text),
   ('owners','owners_lock_update','w',ARRAY['ws02_owner_lock']::text[],true,'true','true'),
   ('slots','slots_rpc_read','r',ARRAY['ws02_owner_rpc']::text[],true,'true',NULL::text),
   ('slots','slots_engine_insert','a',ARRAY['ws02_owner_rpc']::text[],true,NULL::text,'true'),
   ('slots','slots_engine_update','w',ARRAY['ws02_owner_rpc']::text[],true,'true','true'),
   ('evaluation_logs','logs_rpc_read','r',ARRAY['ws02_owner_rpc']::text[],true,'true',NULL::text),
   ('evaluation_logs','logs_engine_insert','a',ARRAY['ws02_owner_rpc']::text[],true,NULL::text,'true')
 ), observed AS (
  SELECT c.relname::text AS relname,p.polname::text AS polname,
   p.polcmd::text AS cmd,
   ARRAY(SELECT r.rolname::text FROM unnest(p.polroles) AS u(role_oid)
         JOIN pg_catalog.pg_roles r ON r.oid=u.role_oid
         ORDER BY r.rolname) AS roles,
   p.polpermissive AS permissive,
   pg_catalog.pg_get_expr(p.polqual,p.polrelid) AS using_expr,
   pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) AS check_expr
  FROM pg_catalog.pg_policy p
  JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='ws02_owner'
    AND c.relname IN ('owners','slots','evaluation_logs')
 ), drift AS (
  (SELECT * FROM expected EXCEPT SELECT * FROM observed)
  UNION ALL
  (SELECT * FROM observed EXCEPT SELECT * FROM expected)
 )
 SELECT count(*) INTO missing_or_extra FROM drift;
 IF missing_or_extra<>0 THEN
  RAISE EXCEPTION 'PRIVATE_OWNER_RLS_POLICY_ROLE_OR_COMMAND_DRIFT_%',missing_or_extra;
 END IF;
END $rls_policy_boundary$;
-- Mutation proof for the private RLS enablement gate. A privileged DDL
-- change can disable row security without changing the reviewed policy list.
-- Verify catalog detection and subtransaction rollback in disposable PG17.
-- This is NOT an Auth provider, JWT, or real taxpayer ownership test.
DO $rls_disable_negative_probe$
DECLARE before_enabled boolean; after_enabled boolean;
BEGIN
 SELECT c.relrowsecurity INTO before_enabled
 FROM pg_catalog.pg_class c
 WHERE c.oid='ws02_owner.evaluation_logs'::regclass;
 IF before_enabled IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'RLS_DISABLE_BASELINE_DRIFT';
 END IF;
 BEGIN
  ALTER TABLE ws02_owner.evaluation_logs DISABLE ROW LEVEL SECURITY;
  SELECT c.relrowsecurity INTO after_enabled
  FROM pg_catalog.pg_class c
  WHERE c.oid='ws02_owner.evaluation_logs'::regclass;
  IF after_enabled IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'RLS_DISABLE_MUTATION_NOT_DETECTED';
  END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_RLS_DISABLE';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_RLS_DISABLE' THEN RAISE; END IF;
 END;
 SELECT c.relrowsecurity INTO after_enabled
 FROM pg_catalog.pg_class c
 WHERE c.oid='ws02_owner.evaluation_logs'::regclass;
 IF after_enabled IS DISTINCT FROM before_enabled THEN
  RAISE EXCEPTION 'RLS_DISABLE_MUTATION_NOT_ROLLED_BACK';
 END IF;
END $rls_disable_negative_probe$;
-- Mutation proof for the exact seven-policy inventory. Even without a direct
-- table GRANT, an unreviewed permissive policy is forbidden metadata drift.
-- Create, detect, and roll back one extra policy without touching hosted SQL.
DO $rls_policy_injection_negative_probe$
DECLARE baseline_count integer; injected_count integer; after_count integer;
BEGIN
 SELECT count(*) INTO baseline_count
 FROM pg_catalog.pg_policy p
 WHERE p.polrelid='ws02_owner.evaluation_logs'::regclass;
 IF baseline_count IS DISTINCT FROM 2 THEN
  RAISE EXCEPTION 'RLS_POLICY_INJECTION_BASELINE_DRIFT_%',baseline_count;
 END IF;
 BEGIN
  CREATE POLICY ws02_unreviewed_permissive ON ws02_owner.evaluation_logs
   FOR SELECT TO ws02_owner_auth USING (true);
  SELECT count(*) INTO injected_count
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid='ws02_owner.evaluation_logs'::regclass
    AND p.polname='ws02_unreviewed_permissive';
  IF injected_count IS DISTINCT FROM 1 THEN
   RAISE EXCEPTION 'RLS_POLICY_INJECTION_NOT_DETECTED';
  END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_RLS_POLICY_INJECTION';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_RLS_POLICY_INJECTION' THEN RAISE; END IF;
 END;
 SELECT count(*) INTO after_count
 FROM pg_catalog.pg_policy p
 WHERE p.polrelid='ws02_owner.evaluation_logs'::regclass;
 IF after_count IS DISTINCT FROM baseline_count
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_policy p
      WHERE p.polrelid='ws02_owner.evaluation_logs'::regclass
        AND p.polname='ws02_unreviewed_permissive'
    ) THEN
  RAISE EXCEPTION 'RLS_POLICY_INJECTION_NOT_ROLLED_BACK';
 END IF;
END $rls_policy_injection_negative_probe$;
-- A named RLS policy can keep the same name and policy count while its TO
-- clause is changed to a citizen-facing role. The exact seven-policy guard
-- above rejects that drift. Exercise both SELECT and INSERT policy mutations
-- in rollback-only subtransactions on disposable PG17; no hosted SQL.
DO $rls_policy_role_rewrite_negative_probe$
DECLARE candidate record; baseline_roles oid[]; observed_roles oid[];
BEGIN
 FOR candidate IN
  SELECT unnest(ARRAY['logs_rpc_read','logs_engine_insert']) AS policy_name
 LOOP
  SELECT p.polroles INTO STRICT baseline_roles
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid='ws02_owner.evaluation_logs'::regclass
    AND p.polname=candidate.policy_name;
  IF baseline_roles IS DISTINCT FROM ARRAY['ws02_owner_rpc'::regrole::oid] THEN
   RAISE EXCEPTION 'RLS_POLICY_ROLE_REWRITE_BASELINE_DRIFT_%',
    candidate.policy_name;
  END IF;
  BEGIN
   EXECUTE format(
    'ALTER POLICY %I ON ws02_owner.evaluation_logs TO ws02_owner_auth',
    candidate.policy_name);
   SELECT p.polroles INTO STRICT observed_roles
   FROM pg_catalog.pg_policy p
   WHERE p.polrelid='ws02_owner.evaluation_logs'::regclass
     AND p.polname=candidate.policy_name;
   IF observed_roles IS DISTINCT FROM ARRAY['ws02_owner_auth'::regrole::oid] THEN
    RAISE EXCEPTION 'RLS_POLICY_ROLE_REWRITE_NOT_DETECTED_%',
     candidate.policy_name;
   END IF;
   RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_RLS_POLICY_ROLE_REWRITE';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'ROLLBACK_SYNTHETIC_RLS_POLICY_ROLE_REWRITE' THEN
    RAISE;
   END IF;
  END;
  SELECT p.polroles INTO STRICT observed_roles
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid='ws02_owner.evaluation_logs'::regclass
    AND p.polname=candidate.policy_name;
  IF observed_roles IS DISTINCT FROM baseline_roles THEN
   RAISE EXCEPTION 'RLS_POLICY_ROLE_REWRITE_NOT_ROLLED_BACK_%',
    candidate.policy_name;
  END IF;
 END LOOP;
 RAISE NOTICE 'PASS_SCOPED_RLS_POLICY_ROLE_REWRITE_ROLLBACK_TWO_CASES';
END $rls_policy_role_rewrite_negative_probe$;
-- A policy can retain its name, role, command and permissive flag while
-- its predicate is rewritten. Prove that the pinned PG17 expression inventory
-- detects both SELECT USING and INSERT WITH CHECK changes, and that each
-- disposable DDL mutation rolls back. Not hosted ownership/Auth evidence.
DO $rls_policy_predicate_rewrite_negative_probe$
DECLARE candidate record; baseline_expr text; observed_expr text;
BEGIN
 FOR candidate IN SELECT * FROM (VALUES
  ('logs_rpc_read','USING'),
  ('logs_engine_insert','WITH CHECK')
 ) AS cases(policy_name,clause_name) LOOP
  SELECT CASE candidate.clause_name
   WHEN 'USING' THEN pg_catalog.pg_get_expr(p.polqual,p.polrelid)
   ELSE pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) END
  INTO STRICT baseline_expr
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid='ws02_owner.evaluation_logs'::regclass
    AND p.polname=candidate.policy_name;
  IF baseline_expr IS DISTINCT FROM 'true' THEN
   RAISE EXCEPTION 'RLS_POLICY_PREDICATE_BASELINE_DRIFT_%',candidate.policy_name;
  END IF;
  BEGIN
   EXECUTE format(
    'ALTER POLICY %I ON ws02_owner.evaluation_logs %s (false)',
    candidate.policy_name,candidate.clause_name);
   SELECT CASE candidate.clause_name
    WHEN 'USING' THEN pg_catalog.pg_get_expr(p.polqual,p.polrelid)
    ELSE pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) END
   INTO STRICT observed_expr
   FROM pg_catalog.pg_policy p
   WHERE p.polrelid='ws02_owner.evaluation_logs'::regclass
     AND p.polname=candidate.policy_name;
   IF observed_expr IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'RLS_POLICY_PREDICATE_REWRITE_NOT_DETECTED_%',
     candidate.policy_name;
   END IF;
   RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_RLS_POLICY_PREDICATE_REWRITE';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'ROLLBACK_SYNTHETIC_RLS_POLICY_PREDICATE_REWRITE' THEN
    RAISE;
   END IF;
  END;
  SELECT CASE candidate.clause_name
   WHEN 'USING' THEN pg_catalog.pg_get_expr(p.polqual,p.polrelid)
   ELSE pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) END
  INTO STRICT observed_expr
  FROM pg_catalog.pg_policy p
  WHERE p.polrelid='ws02_owner.evaluation_logs'::regclass
    AND p.polname=candidate.policy_name;
  IF observed_expr IS DISTINCT FROM baseline_expr THEN
   RAISE EXCEPTION 'RLS_POLICY_PREDICATE_REWRITE_NOT_ROLLED_BACK_%',
    candidate.policy_name;
  END IF;
 END LOOP;
 RAISE NOTICE 'PASS_SCOPED_RLS_POLICY_PREDICATE_REWRITE_ROLLBACK_TWO_CASES';
END $rls_policy_predicate_rewrite_negative_probe$;
-- An unreviewed user-defined trigger on a private owner, slot or audit table
-- can introduce a side effect without changing function bodies, RLS policies
-- or ACLs. Internal foreign-key triggers are expected and excluded. This is
-- a disposable catalog invariant, not a production schema or Auth assertion.
DO $private_trigger_boundary$
DECLARE extra_triggers integer;
BEGIN
 SELECT count(*) INTO extra_triggers
 FROM pg_catalog.pg_trigger t
 JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='ws02_owner'
   AND c.relname IN ('owners','slots','evaluation_logs')
   AND NOT t.tgisinternal;
 IF extra_triggers<>0 THEN
  RAISE EXCEPTION 'PRIVATE_UNREVIEWED_USER_TRIGGER_%',extra_triggers;
 END IF;
END $private_trigger_boundary$;
-- Mutation regression: inject a harmless BEFORE INSERT trigger on the audit
-- table, detect the unreviewed side effect, then roll back both trigger and
-- function. No synthetic audit rows or hosted taxpayer data are modified.
DO $private_trigger_negative_probe$
DECLARE baseline_count integer; mutated_count integer; restored_count integer;
BEGIN
 SELECT count(*) INTO baseline_count
 FROM pg_catalog.pg_trigger t
 WHERE t.tgrelid='ws02_owner.evaluation_logs'::regclass
   AND NOT t.tgisinternal;
 IF baseline_count<>0 THEN
  RAISE EXCEPTION 'PRIVATE_TRIGGER_BASELINE_DRIFT_%',baseline_count;
 END IF;
 BEGIN
  EXECUTE $ddl$CREATE FUNCTION ws02_owner.__synthetic_trigger_probe()
    RETURNS trigger LANGUAGE plpgsql AS $trigger$ BEGIN RETURN NEW; END $trigger$$ddl$;
  EXECUTE 'CREATE TRIGGER ws02_unreviewed_log_write
    BEFORE INSERT ON ws02_owner.evaluation_logs
    FOR EACH ROW EXECUTE FUNCTION ws02_owner.__synthetic_trigger_probe()';
  SELECT count(*) INTO mutated_count
  FROM pg_catalog.pg_trigger t
  WHERE t.tgrelid='ws02_owner.evaluation_logs'::regclass
    AND NOT t.tgisinternal;
  IF mutated_count<>1 THEN
   RAISE EXCEPTION 'PRIVATE_TRIGGER_MUTATION_UNDETECTED_%',mutated_count;
  END IF;
  RAISE EXCEPTION 'ROLLBACK_SYNTHETIC_PRIVATE_TRIGGER_INJECTION';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'ROLLBACK_SYNTHETIC_PRIVATE_TRIGGER_INJECTION' THEN
   RAISE;
  END IF;
 END;
 SELECT count(*) INTO restored_count
 FROM pg_catalog.pg_trigger t
 WHERE t.tgrelid='ws02_owner.evaluation_logs'::regclass
   AND NOT t.tgisinternal;
 IF restored_count<>baseline_count
    OR pg_catalog.to_regprocedure('ws02_owner.__synthetic_trigger_probe()') IS NOT NULL
 THEN RAISE EXCEPTION 'PRIVATE_TRIGGER_INJECTION_NOT_ROLLED_BACK'; END IF;
 RAISE NOTICE 'PASS_SCOPED_PRIVATE_TRIGGER_INJECTION_ROLLBACK_ONE_CASE';
END $private_trigger_negative_probe$;
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
 trace text:=repeat('c',64); audit jsonb; revoked_audit jsonb; audit_patch jsonb;
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
 -- PostgREST-safe facade must inherit the private RPC's consecutive-label
 -- check; these synthetic negative calls must not consume the reserved slot.
 -- This is a format check, not legal AY/IY applicability certification.
 FOR audit_patch IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('income_year','2025-25'),
  jsonb_build_object('income_year','2025-99'),
  jsonb_build_object('income_year','2025-00'),
  jsonb_build_object('income_year','2099-99')
 )) LOOP
  IF ws02_api.nbr_commit_evaluation_atomically(
   actor,rec,'2026-27',idem,req,receipt,trace,'NEEDS_FACTS',
   audit||audit_patch) THEN
   RAISE EXCEPTION 'FACADE_NONCONSECUTIVE_INCOME_YEAR_ACCEPTED_%',audit_patch;
  END IF;
 END LOOP;
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
