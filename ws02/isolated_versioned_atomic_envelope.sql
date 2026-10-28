-- Disposable PG17 ONLY: candidate private versioned-byte envelope around the actual
-- WS02 atomic receipt RPC. This is NOT a deployed migration or trusted Auth model.
-- Run AFTER extracted ws02_owner DDL is committed, on a fresh isolated database.
-- This wrapper checks bytes/digest/JSONB semantics, NOT independent JS canonicality
-- or producer authenticity. Never expose this schema through PostgREST.
CREATE FUNCTION ws02_owner.nbr_commit_evaluation_versioned_candidate(
 p_auth_user_id uuid,p_taxpayer_record_id uuid,p_assessment_year text,
 p_idempotency_key text,p_request_hash text,p_receipt_hash text,
 p_trace_hash text,p_result_state text,p_audit_trace jsonb,
 p_trace_bytes text,p_trace_encoding_version text
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,ws02_owner AS $versioned$
DECLARE decoded jsonb;
BEGIN
 IF p_trace_encoding_version IS DISTINCT FROM 'NBR_W5_CANONICAL_UTF8_V1'
    OR p_trace_bytes IS NULL
    OR p_audit_trace IS NULL
    OR pg_catalog.octet_length(pg_catalog.convert_to(p_trace_bytes,'UTF8')) > 262144
    OR p_trace_hash IS NULL OR p_trace_hash !~ '^[a-f0-9]{64}$'
    OR p_trace_hash IS DISTINCT FROM pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(p_trace_bytes,'UTF8')),'hex')
 THEN RETURN false; END IF;
 BEGIN
   decoded := p_trace_bytes::jsonb;
 EXCEPTION WHEN data_exception THEN
   RETURN false;
 END;
 IF pg_catalog.jsonb_typeof(decoded) IS DISTINCT FROM 'object'
    OR decoded IS DISTINCT FROM p_audit_trace
 THEN RETURN false; END IF;
 RETURN ws02_owner.nbr_commit_evaluation_atomically(
  p_auth_user_id,p_taxpayer_record_id,p_assessment_year,p_idempotency_key,
  p_request_hash,p_receipt_hash,p_trace_hash,p_result_state,p_audit_trace);
END $versioned$;
REVOKE ALL ON FUNCTION ws02_owner.nbr_commit_evaluation_versioned_candidate(
 uuid,uuid,text,text,text,text,text,text,jsonb,text,text) FROM PUBLIC;
ALTER FUNCTION ws02_owner.nbr_commit_evaluation_versioned_candidate(
 uuid,uuid,text,text,text,text,text,text,jsonb,text,text) OWNER TO ws02_owner_rpc;
-- The critical enforcement difference from the earlier test-only wrapper:
-- remove the direct bypass grant from the synthetic engine caller.
REVOKE EXECUTE ON FUNCTION ws02_owner.nbr_commit_evaluation_atomically(
 uuid,uuid,text,text,text,text,text,text,jsonb) FROM ws02_owner_engine;
GRANT EXECUTE ON FUNCTION ws02_owner.nbr_commit_evaluation_versioned_candidate(
 uuid,uuid,text,text,text,text,text,text,jsonb,text,text) TO ws02_owner_engine;
DO $acl$
BEGIN
 IF has_function_privilege('ws02_owner_engine',
  'ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)',
  'EXECUTE')
 OR NOT has_function_privilege('ws02_owner_engine',
  'ws02_owner.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)',
  'EXECUTE')
 OR has_function_privilege('ws02_owner_auth',
  'ws02_owner.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)',
  'EXECUTE')
 OR has_function_privilege('ws02_owner_anon',
  'ws02_owner.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)',
  'EXECUTE')
 THEN RAISE EXCEPTION 'VERSIONED_ENVELOPE_ACL_BYPASS_OR_EXPOSURE'; END IF;
END $acl$;
SELECT 'PASS_SCOPED_VERSIONED_ENVELOPE_PRIVATE_ACL_ONLY' AS marker;

-- Exact metadata/privilege contract for the PRIVATE review-only wrapper.
-- PostgreSQL SECURITY DEFINER is only safe with a pinned owner/search_path.
-- This is synthetic catalog regression coverage, NOT JWT verification.
DO $wrapper_metadata$
DECLARE p record;
BEGIN
 SELECT f.prosecdef,f.provolatile,f.proretset,f.prorettype,
        f.proargnames,f.pronargdefaults,f.provariadic,f.proconfig,
        f.proowner,l.lanname
 INTO p
 FROM pg_catalog.pg_proc f
 JOIN pg_catalog.pg_language l ON l.oid=f.prolang
 WHERE f.oid='ws02_owner.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)'::regprocedure;
 IF NOT FOUND
    OR p.prosecdef IS DISTINCT FROM true
    OR p.provolatile IS DISTINCT FROM 'v'
    OR p.proretset IS DISTINCT FROM false
    OR p.prorettype IS DISTINCT FROM 'boolean'::regtype::oid
    OR p.lanname IS DISTINCT FROM 'plpgsql'
    OR p.proowner IS DISTINCT FROM 'ws02_owner_rpc'::regrole::oid
    OR p.proargnames IS DISTINCT FROM ARRAY[
      'p_auth_user_id','p_taxpayer_record_id','p_assessment_year',
      'p_idempotency_key','p_request_hash','p_receipt_hash',
      'p_trace_hash','p_result_state','p_audit_trace',
      'p_trace_bytes','p_trace_encoding_version']::text[]
    OR p.pronargdefaults IS DISTINCT FROM 0
    OR p.provariadic IS DISTINCT FROM 0::oid
    OR p.proconfig IS NULL
    OR pg_catalog.cardinality(p.proconfig) IS DISTINCT FROM 1
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.unnest(p.proconfig) AS setting
      WHERE pg_catalog.split_part(setting,'=',1)='search_path'
        AND pg_catalog.replace(pg_catalog.split_part(setting,'=',2),' ','')
          ='pg_catalog,ws02_owner')
 THEN RAISE EXCEPTION 'PRIVATE_VERSIONED_WRAPPER_METADATA_DRIFT'; END IF;
 IF pg_catalog.pg_has_role('ws02_owner_auth','ws02_owner_engine','member')
    OR pg_catalog.pg_has_role('ws02_owner_anon','ws02_owner_engine','member')
    OR pg_catalog.pg_has_role('ws02_owner_engine','ws02_owner_rpc','member')
 THEN RAISE EXCEPTION 'PRIVATE_VERSIONED_WRAPPER_ROLE_INHERITANCE_BYPASS'; END IF;
END $wrapper_metadata$;

-- Prove the metadata guard would detect search_path/SECURITY drift, then
-- roll back BOTH mutations. Nothing is changed outside disposable PG17.
BEGIN;
SAVEPOINT ws02_wrapper_metadata_tamper;
ALTER FUNCTION ws02_owner.nbr_commit_evaluation_versioned_candidate(
 uuid,uuid,text,text,text,text,text,text,jsonb,text,text)
 SECURITY INVOKER;
ALTER FUNCTION ws02_owner.nbr_commit_evaluation_versioned_candidate(
 uuid,uuid,text,text,text,text,text,text,jsonb,text,text)
 SET search_path=public;
DO $wrapper_tamper$
DECLARE security_definer boolean; settings text[];
BEGIN
 SELECT prosecdef,proconfig INTO security_definer,settings
 FROM pg_catalog.pg_proc
 WHERE oid='ws02_owner.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)'::regprocedure;
 IF security_definer IS DISTINCT FROM false
    OR settings IS NULL
    OR pg_catalog.cardinality(settings) IS DISTINCT FROM 1
    OR pg_catalog.replace(pg_catalog.split_part(settings[1],'=',2),' ','')
       IS DISTINCT FROM 'public'
 THEN RAISE EXCEPTION 'PRIVATE_WRAPPER_METADATA_TAMPER_NOT_DETECTED'; END IF;
END $wrapper_tamper$;
ROLLBACK TO SAVEPOINT ws02_wrapper_metadata_tamper;
RELEASE SAVEPOINT ws02_wrapper_metadata_tamper;
DO $wrapper_restored$
DECLARE security_definer boolean; settings text[];
BEGIN
 SELECT prosecdef,proconfig INTO security_definer,settings
 FROM pg_catalog.pg_proc
 WHERE oid='ws02_owner.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)'::regprocedure;
 IF security_definer IS DISTINCT FROM true
    OR settings IS NULL
    OR pg_catalog.cardinality(settings) IS DISTINCT FROM 1
    OR pg_catalog.replace(pg_catalog.split_part(settings[1],'=',2),' ','')
       IS DISTINCT FROM 'pg_catalog,ws02_owner'
 THEN RAISE EXCEPTION 'PRIVATE_WRAPPER_METADATA_NOT_RESTORED'; END IF;
END $wrapper_restored$;
COMMIT;
SELECT 'PASS_SCOPED_PRIVATE_WRAPPER_METADATA_DRIFT_ROLLBACK_ONLY' AS marker;

-- Exact ACL allowlist, not merely spot checks of known anon/auth roles.
-- A future grant to ANY unreviewed role must not turn the private definer
-- into a callable capability. PostgreSQL role inheritance remains separately
-- checked above. Synthetic/disposable PG17 only; no production grants.
DO $wrapper_exact_acl$
BEGIN
 IF EXISTS (
   SELECT 1 FROM pg_catalog.pg_proc p
   CROSS JOIN LATERAL pg_catalog.aclexplode(
     COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
   WHERE p.oid='ws02_owner.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)'::regprocedure
     AND (acl.grantee=0 OR acl.grantee NOT IN (
       'ws02_owner_engine'::regrole::oid,'ws02_owner_rpc'::regrole::oid))
 ) THEN RAISE EXCEPTION 'PRIVATE_WRAPPER_UNREVIEWED_FUNCTION_GRANTEE'; END IF;
 IF EXISTS (
   SELECT 1 FROM pg_catalog.pg_namespace n
   CROSS JOIN LATERAL pg_catalog.aclexplode(
     COALESCE(n.nspacl,pg_catalog.acldefault('n',n.nspowner))) acl
   WHERE n.nspname='ws02_owner'
     AND acl.privilege_type='USAGE'
     AND (acl.grantee=0 OR acl.grantee NOT IN (
       'ws02_owner_engine'::regrole::oid,'ws02_owner_rpc'::regrole::oid,
       'ws02_owner_lock'::regrole::oid,n.nspowner))
 ) THEN RAISE EXCEPTION 'PRIVATE_SCHEMA_UNREVIEWED_USAGE_GRANTEE'; END IF;
END $wrapper_exact_acl$;

-- An exact function ACL is NOT sufficient if an unexpected principal can
-- inherit or SET a role on that ACL. Check the complete direct membership
-- edge set for every private capability/definer role, not only named API roles.
-- Any indirect path must contain a direct edge into one of these roles.
-- Synthetic PG17 only; this does NOT verify signed JWT/session revocation.
DO $private_role_membership_allowlist$
DECLARE unexpected text;
BEGIN
 SELECT pg_catalog.format('%s -> %s',member.rolname,privileged.rolname)
 INTO unexpected
 FROM pg_catalog.pg_auth_members m
 JOIN pg_catalog.pg_roles privileged ON privileged.oid=m.roleid
 JOIN pg_catalog.pg_roles member ON member.oid=m.member
 WHERE privileged.rolname IN (
   'ws02_owner_engine','ws02_owner_rpc','ws02_owner_lock')
 LIMIT 1;
 IF unexpected IS NOT NULL THEN
   RAISE EXCEPTION 'PRIVATE_CAPABILITY_ROLE_MEMBERSHIP_DRIFT_%',unexpected;
 END IF;
END $private_role_membership_allowlist$;

-- Inject a previously unknown principal (not one of anon/auth/engine) and
-- grant it two privileged memberships. A direct-grantee ACL check alone
-- would miss this path. Verify catalog detection, then rollback the role
-- and grants in the disposable database without changing the real contract.
BEGIN;
SAVEPOINT ws02_unreviewed_member_probe;
CREATE ROLE ws02_unreviewed_runtime NOLOGIN;
GRANT ws02_owner_engine TO ws02_unreviewed_runtime;
GRANT ws02_owner_rpc TO ws02_unreviewed_runtime;
DO $unreviewed_membership_probe$
DECLARE matched integer;
BEGIN
 SELECT count(*) INTO matched
 FROM pg_catalog.pg_auth_members m
 JOIN pg_catalog.pg_roles privileged ON privileged.oid=m.roleid
 JOIN pg_catalog.pg_roles member ON member.oid=m.member
 WHERE member.rolname='ws02_unreviewed_runtime'
   AND privileged.rolname IN ('ws02_owner_engine','ws02_owner_rpc');
 IF matched IS DISTINCT FROM 2
    OR NOT pg_catalog.pg_has_role(
      'ws02_unreviewed_runtime','ws02_owner_engine','MEMBER')
 THEN RAISE EXCEPTION 'UNREVIEWED_MEMBER_ROLE_GRAPH_NOT_DETECTED'; END IF;
END $unreviewed_membership_probe$;
ROLLBACK TO SAVEPOINT ws02_unreviewed_member_probe;
RELEASE SAVEPOINT ws02_unreviewed_member_probe;
DO $unreviewed_membership_restored$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
            WHERE rolname='ws02_unreviewed_runtime')
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_auth_members m
      JOIN pg_catalog.pg_roles privileged ON privileged.oid=m.roleid
      WHERE privileged.rolname IN (
        'ws02_owner_engine','ws02_owner_rpc','ws02_owner_lock'))
 THEN RAISE EXCEPTION 'UNREVIEWED_MEMBER_ROLE_GRAPH_NOT_ROLLED_BACK'; END IF;
END $unreviewed_membership_restored$;
COMMIT;
SELECT 'PASS_SCOPED_PRIVATE_CAPABILITY_ROLE_GRAPH_ALLOWLIST_ROLLBACK_ONLY' AS marker;

-- Deliberately inject two unrelated grants and prove the exact-ACL
-- detector sees BOTH; rollback restores the original capability boundary.
BEGIN;
SAVEPOINT ws02_wrapper_acl_probe;
GRANT EXECUTE ON FUNCTION ws02_owner.nbr_commit_evaluation_versioned_candidate(
 uuid,uuid,text,text,text,text,text,text,jsonb,text,text) TO ws02_owner_lock;
GRANT USAGE ON SCHEMA ws02_owner TO ws02_owner_auth;
DO $wrapper_acl_tamper$
DECLARE function_drift boolean; schema_drift boolean;
BEGIN
 SELECT EXISTS (
   SELECT 1 FROM pg_catalog.pg_proc p
   CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) acl
   WHERE p.oid='ws02_owner.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)'::regprocedure
     AND acl.grantee='ws02_owner_lock'::regrole::oid
     AND acl.privilege_type='EXECUTE'
 ) INTO function_drift;
 SELECT EXISTS (
   SELECT 1 FROM pg_catalog.pg_namespace n
   CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) acl
   WHERE n.nspname='ws02_owner'
     AND acl.grantee='ws02_owner_auth'::regrole::oid
     AND acl.privilege_type='USAGE'
 ) INTO schema_drift;
 IF NOT function_drift OR NOT schema_drift
 THEN RAISE EXCEPTION 'PRIVATE_WRAPPER_EXACT_ACL_TAMPER_UNDETECTED'; END IF;
END $wrapper_acl_tamper$;
ROLLBACK TO SAVEPOINT ws02_wrapper_acl_probe;
RELEASE SAVEPOINT ws02_wrapper_acl_probe;
DO $wrapper_acl_restored$
BEGIN
 IF pg_catalog.has_function_privilege('ws02_owner_lock',
  'ws02_owner.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)',
  'EXECUTE')
 OR pg_catalog.has_schema_privilege('ws02_owner_auth','ws02_owner','USAGE')
 THEN RAISE EXCEPTION 'PRIVATE_WRAPPER_EXACT_ACL_NOT_RESTORED'; END IF;
END $wrapper_acl_restored$;
COMMIT;
SELECT 'PASS_SCOPED_PRIVATE_WRAPPER_EXACT_ACL_ALLOWLIST_ROLLBACK_ONLY' AS marker;

-- Private SECURITY DEFINER body integrity is independent of owner, named
-- arguments, ACL, volatility and search_path. A CREATE OR REPLACE retaining
-- all of that metadata could still replace the owner-bound atomic commit
-- with an unconditional true. Pin the reviewed exact prosrc bytes and prove
-- detection plus transactional restoration of a permissive-body mutation.
-- Disposable PostgreSQL 17 only: no hosted SQL/Auth or public RPC exposure.
DO $versioned_body_integrity$
DECLARE expected_source text := $reviewed_ws02_body$
DECLARE decoded jsonb;
BEGIN
 IF p_trace_encoding_version IS DISTINCT FROM 'NBR_W5_CANONICAL_UTF8_V1'
    OR p_trace_bytes IS NULL
    OR p_audit_trace IS NULL
    OR pg_catalog.octet_length(pg_catalog.convert_to(p_trace_bytes,'UTF8')) > 262144
    OR p_trace_hash IS NULL OR p_trace_hash !~ '^[a-f0-9]{64}$'
    OR p_trace_hash IS DISTINCT FROM pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(p_trace_bytes,'UTF8')),'hex')
 THEN RETURN false; END IF;
 BEGIN
   decoded := p_trace_bytes::jsonb;
 EXCEPTION WHEN data_exception THEN
   RETURN false;
 END;
 IF pg_catalog.jsonb_typeof(decoded) IS DISTINCT FROM 'object'
    OR decoded IS DISTINCT FROM p_audit_trace
 THEN RETURN false; END IF;
 RETURN ws02_owner.nbr_commit_evaluation_atomically(
  p_auth_user_id,p_taxpayer_record_id,p_assessment_year,p_idempotency_key,
  p_request_hash,p_receipt_hash,p_trace_hash,p_result_state,p_audit_trace);
END $reviewed_ws02_body$;
        observed_source text;
BEGIN
 SELECT p.prosrc INTO observed_source FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_owner.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)'::regprocedure;
 IF observed_source IS DISTINCT FROM expected_source THEN
   RAISE EXCEPTION 'PRIVATE_VERSIONED_WRAPPER_BODY_DRIFT';
 END IF;
END $versioned_body_integrity$;

BEGIN;
SAVEPOINT ws02_versioned_body_tamper;
CREATE OR REPLACE FUNCTION ws02_owner.nbr_commit_evaluation_versioned_candidate(
 p_auth_user_id uuid,p_taxpayer_record_id uuid,p_assessment_year text,
 p_idempotency_key text,p_request_hash text,p_receipt_hash text,
 p_trace_hash text,p_result_state text,p_audit_trace jsonb,
 p_trace_bytes text,p_trace_encoding_version text
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,ws02_owner AS $unsafe_versioned_body$
BEGIN
 RETURN true;
END $unsafe_versioned_body$;
DO $versioned_body_tamper_check$
DECLARE expected_source text := $reviewed_ws02_body$
DECLARE decoded jsonb;
BEGIN
 IF p_trace_encoding_version IS DISTINCT FROM 'NBR_W5_CANONICAL_UTF8_V1'
    OR p_trace_bytes IS NULL
    OR p_audit_trace IS NULL
    OR pg_catalog.octet_length(pg_catalog.convert_to(p_trace_bytes,'UTF8')) > 262144
    OR p_trace_hash IS NULL OR p_trace_hash !~ '^[a-f0-9]{64}$'
    OR p_trace_hash IS DISTINCT FROM pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(p_trace_bytes,'UTF8')),'hex')
 THEN RETURN false; END IF;
 BEGIN
   decoded := p_trace_bytes::jsonb;
 EXCEPTION WHEN data_exception THEN
   RETURN false;
 END;
 IF pg_catalog.jsonb_typeof(decoded) IS DISTINCT FROM 'object'
    OR decoded IS DISTINCT FROM p_audit_trace
 THEN RETURN false; END IF;
 RETURN ws02_owner.nbr_commit_evaluation_atomically(
  p_auth_user_id,p_taxpayer_record_id,p_assessment_year,p_idempotency_key,
  p_request_hash,p_receipt_hash,p_trace_hash,p_result_state,p_audit_trace);
END $reviewed_ws02_body$;
        p record;
BEGIN
 SELECT prosrc,prosecdef,proconfig,proowner INTO p FROM pg_catalog.pg_proc
 WHERE oid='ws02_owner.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)'::regprocedure;
 IF NOT FOUND OR p.prosrc IS NOT DISTINCT FROM expected_source
    OR pg_catalog.strpos(p.prosrc,'RETURN true;')=0
    OR p.prosecdef IS DISTINCT FROM true
    OR p.proowner IS DISTINCT FROM 'ws02_owner_rpc'::regrole::oid
    OR p.proconfig IS NULL
    OR pg_catalog.cardinality(p.proconfig) IS DISTINCT FROM 1
    OR pg_catalog.replace(pg_catalog.split_part(p.proconfig[1],'=',2),' ','')
      IS DISTINCT FROM 'pg_catalog,ws02_owner'
 THEN RAISE EXCEPTION 'PRIVATE_VERSIONED_WRAPPER_BODY_MUTATION_NOT_DETECTED'; END IF;
END $versioned_body_tamper_check$;
ROLLBACK TO SAVEPOINT ws02_versioned_body_tamper;
RELEASE SAVEPOINT ws02_versioned_body_tamper;
DO $versioned_body_restored$
DECLARE expected_source text := $reviewed_ws02_body$
DECLARE decoded jsonb;
BEGIN
 IF p_trace_encoding_version IS DISTINCT FROM 'NBR_W5_CANONICAL_UTF8_V1'
    OR p_trace_bytes IS NULL
    OR p_audit_trace IS NULL
    OR pg_catalog.octet_length(pg_catalog.convert_to(p_trace_bytes,'UTF8')) > 262144
    OR p_trace_hash IS NULL OR p_trace_hash !~ '^[a-f0-9]{64}$'
    OR p_trace_hash IS DISTINCT FROM pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(p_trace_bytes,'UTF8')),'hex')
 THEN RETURN false; END IF;
 BEGIN
   decoded := p_trace_bytes::jsonb;
 EXCEPTION WHEN data_exception THEN
   RETURN false;
 END;
 IF pg_catalog.jsonb_typeof(decoded) IS DISTINCT FROM 'object'
    OR decoded IS DISTINCT FROM p_audit_trace
 THEN RETURN false; END IF;
 RETURN ws02_owner.nbr_commit_evaluation_atomically(
  p_auth_user_id,p_taxpayer_record_id,p_assessment_year,p_idempotency_key,
  p_request_hash,p_receipt_hash,p_trace_hash,p_result_state,p_audit_trace);
END $reviewed_ws02_body$;
        observed_source text;
BEGIN
 SELECT p.prosrc INTO observed_source FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_owner.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)'::regprocedure;
 IF observed_source IS DISTINCT FROM expected_source THEN
   RAISE EXCEPTION 'PRIVATE_VERSIONED_WRAPPER_BODY_NOT_RESTORED';
 END IF;
END $versioned_body_restored$;
COMMIT;
SELECT 'PASS_SCOPED_VERSIONED_WRAPPER_BODY_DRIFT_ROLLBACK_ONLY' AS marker;

-- The reviewed wrapper must not depend on an atomic RPC whose body silently
-- changed while keeping its signature, owner, grants and SECURITY DEFINER
-- metadata. Pin the underlying private atomic implementation independently.
-- The digest is SHA-256 of pg_proc.prosrc, sourced from the exact WS02
-- isolated_owner_receipt_contract.sql DDL at this review checkpoint.
-- This is a disposable PG17 regression, not a deployed integrity mechanism.
DO $atomic_dependency_body_pin$
DECLARE actual_digest text;
BEGIN
 SELECT pg_catalog.encode(pg_catalog.sha256(
          pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
 INTO actual_digest FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF actual_digest IS DISTINCT FROM '30f0bf609986311ecba2fcbd8bb18a790a0b04f2a2898013d4a9a074dd189436'
 THEN RAISE EXCEPTION 'PRIVATE_ATOMIC_DEPENDENCY_BODY_DRIFT'; END IF;
END $atomic_dependency_body_pin$;

-- A deliberately unsafe replacement keeps the existing function signature,
-- owner, security mode and search path. Detect its body drift without calling
-- it, then roll back the mutation and prove the reviewed body was restored.
BEGIN;
SAVEPOINT ws02_atomic_dependency_body_tamper;
CREATE OR REPLACE FUNCTION ws02_owner.nbr_commit_evaluation_atomically(
 p_auth_user_id uuid,p_taxpayer_record_id uuid,p_assessment_year text,
 p_idempotency_key text,p_request_hash text,p_receipt_hash text,
 p_trace_hash text,p_result_state text,p_audit_trace jsonb
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,ws02_owner AS $unsafe_atomic_dependency$
BEGIN
 RETURN true;
END $unsafe_atomic_dependency$;
DO $atomic_dependency_mutation_detected$
DECLARE p record;
BEGIN
 SELECT pg_catalog.encode(pg_catalog.sha256(
          pg_catalog.convert_to(prosrc,'UTF8')),'hex') AS digest,
        prosecdef,proowner,proconfig,prorettype
 INTO p FROM pg_catalog.pg_proc
 WHERE oid='ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF NOT FOUND
    OR p.digest IS NOT DISTINCT FROM '30f0bf609986311ecba2fcbd8bb18a790a0b04f2a2898013d4a9a074dd189436'
    OR p.prosecdef IS DISTINCT FROM true
    OR p.proowner IS DISTINCT FROM 'ws02_owner_rpc'::regrole::oid
    OR p.prorettype IS DISTINCT FROM 'boolean'::regtype::oid
    OR p.proconfig IS NULL OR pg_catalog.cardinality(p.proconfig) IS DISTINCT FROM 1
    OR pg_catalog.replace(pg_catalog.split_part(p.proconfig[1],'=',2),' ','')
       IS DISTINCT FROM 'pg_catalog,ws02_owner'
 THEN RAISE EXCEPTION 'PRIVATE_ATOMIC_DEPENDENCY_MUTATION_NOT_DETECTED'; END IF;
END $atomic_dependency_mutation_detected$;
ROLLBACK TO SAVEPOINT ws02_atomic_dependency_body_tamper;
RELEASE SAVEPOINT ws02_atomic_dependency_body_tamper;
DO $atomic_dependency_body_restored$
DECLARE actual_digest text;
BEGIN
 SELECT pg_catalog.encode(pg_catalog.sha256(
          pg_catalog.convert_to(p.prosrc,'UTF8')),'hex')
 INTO actual_digest FROM pg_catalog.pg_proc p
 WHERE p.oid='ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)'::regprocedure;
 IF actual_digest IS DISTINCT FROM '30f0bf609986311ecba2fcbd8bb18a790a0b04f2a2898013d4a9a074dd189436'
 THEN RAISE EXCEPTION 'PRIVATE_ATOMIC_DEPENDENCY_BODY_NOT_RESTORED'; END IF;
END $atomic_dependency_body_restored$;
COMMIT;
SELECT 'PASS_SCOPED_PRIVATE_ATOMIC_DEPENDENCY_BODY_DRIFT_ROLLBACK_ONLY' AS marker;

-- Disposable PostgreSQL 17 ONLY: a PostgREST-style caller can write arbitrary
-- request.jwt.claims GUCs in this fixture. They are NOT signed Auth evidence,
-- and must never grant the private wrapper or its trusted producer role.
-- This is a real negative EXECUTE/SET ROLE attempt, not just catalog metadata.
BEGIN;
-- Switch the SESSION identity, not only current_role: a superuser
-- session_user could otherwise SET ROLE back into any private role.
SET SESSION AUTHORIZATION ws02_owner_auth;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '60000000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('request.jwt.claim.role','ws02_owner_engine',true);
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"60000000-0000-4000-8000-000000000001","role":"ws02_owner_engine"}',true);
DO $forged_auth_claims$
DECLARE execute_denied boolean:=false; escalation_denied boolean:=false;
BEGIN
 BEGIN
  PERFORM ws02_owner.nbr_commit_evaluation_versioned_candidate(
   '60000000-0000-4000-8000-000000000001'::uuid,
   '50000000-0000-4000-8000-000000000001'::uuid,
   '2026-27','spoofed-jwt-guc-no-slot-00001',
   pg_catalog.repeat('a',64),pg_catalog.repeat('b',64),
   pg_catalog.repeat('c',64),'NEEDS_FACTS','{}'::jsonb,
   '{}','NBR_W5_CANONICAL_UTF8_V1');
 EXCEPTION WHEN insufficient_privilege THEN execute_denied:=true;
 END;
 BEGIN
  EXECUTE 'SET ROLE ws02_owner_engine';
 EXCEPTION WHEN insufficient_privilege THEN escalation_denied:=true;
 END;
 IF NOT execute_denied OR NOT escalation_denied
    OR current_user IS DISTINCT FROM 'ws02_owner_auth'
 THEN RAISE EXCEPTION 'FORGED_AUTH_CLAIMS_REACHED_PRIVATE_WRAPPER_OR_ROLE'; END IF;
END $forged_auth_claims$;
ROLLBACK;

BEGIN;
SET SESSION AUTHORIZATION ws02_owner_anon;
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"60000000-0000-4000-8000-000000000001","role":"ws02_owner_engine"}',true);
DO $forged_anon_claims$
DECLARE execute_denied boolean:=false; escalation_denied boolean:=false;
BEGIN
 BEGIN
  PERFORM ws02_owner.nbr_commit_evaluation_versioned_candidate(
   '60000000-0000-4000-8000-000000000001'::uuid,
   '50000000-0000-4000-8000-000000000001'::uuid,
   '2026-27','spoofed-jwt-guc-no-slot-00002',
   pg_catalog.repeat('a',64),pg_catalog.repeat('b',64),
   pg_catalog.repeat('c',64),'NEEDS_FACTS','{}'::jsonb,
   '{}','NBR_W5_CANONICAL_UTF8_V1');
 EXCEPTION WHEN insufficient_privilege THEN execute_denied:=true;
 END;
 BEGIN
  EXECUTE 'SET ROLE ws02_owner_engine';
 EXCEPTION WHEN insufficient_privilege THEN escalation_denied:=true;
 END;
 IF NOT execute_denied OR NOT escalation_denied
    OR current_user IS DISTINCT FROM 'ws02_owner_anon'
 THEN RAISE EXCEPTION 'FORGED_ANON_CLAIMS_REACHED_PRIVATE_WRAPPER_OR_ROLE'; END IF;
END $forged_anon_claims$;
ROLLBACK;

DO $forged_claims_no_rows$
BEGIN
 IF EXISTS (SELECT 1 FROM ws02_owner.slots
             WHERE idem_key LIKE 'spoofed-jwt-guc-no-slot-%')
    OR EXISTS (SELECT 1 FROM ws02_owner.evaluation_logs
             WHERE idem_key LIKE 'spoofed-jwt-guc-no-slot-%')
 THEN RAISE EXCEPTION 'FORGED_CLAIMS_LEFT_AUDIT_OR_RECEIPT_ROWS'; END IF;
END $forged_claims_no_rows$;
SELECT 'PASS_SCOPED_FORGED_JWT_GUC_CANNOT_EXECUTE_PRIVATE_WRAPPER' AS marker;

-- WS02: 11-argument versioned PostgREST-style facade, isolated PG17 ONLY.
-- This is an unexposed review schema, not an approved public RPC/migration.
-- Invoker cannot elevate auth/anon to the trusted producer; the private
-- versioned digest wrapper remains the only callable finalization dependency.
BEGIN;
CREATE SCHEMA ws02_review_api;
REVOKE ALL ON SCHEMA ws02_review_api FROM PUBLIC;
GRANT USAGE ON SCHEMA ws02_review_api TO ws02_owner_engine;
CREATE FUNCTION ws02_review_api.nbr_commit_evaluation_versioned_candidate(
 p_auth_user_id uuid,p_taxpayer_record_id uuid,p_assessment_year text,
 p_idempotency_key text,p_request_hash text,p_receipt_hash text,
 p_trace_hash text,p_result_state text,p_audit_trace jsonb,
 p_trace_bytes text,p_trace_encoding_version text
) RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,ws02_owner AS $review_facade$
 SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
  p_auth_user_id,p_taxpayer_record_id,p_assessment_year,
  p_idempotency_key,p_request_hash,p_receipt_hash,
  p_trace_hash,p_result_state,p_audit_trace,
  p_trace_bytes,p_trace_encoding_version);
$review_facade$;
REVOKE ALL ON FUNCTION ws02_review_api.nbr_commit_evaluation_versioned_candidate(
 uuid,uuid,text,text,text,text,text,text,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ws02_review_api.nbr_commit_evaluation_versioned_candidate(
 uuid,uuid,text,text,text,text,text,text,jsonb,text,text) TO ws02_owner_engine;
DO $review_facade_acl$
DECLARE p record;
BEGIN
 SELECT f.prosecdef,f.provolatile,f.proretset,f.prorettype,f.proargnames,
        f.pronargdefaults,f.provariadic,f.proconfig,l.lanname
 INTO p FROM pg_catalog.pg_proc f
 JOIN pg_catalog.pg_language l ON l.oid=f.prolang
 WHERE f.oid='ws02_review_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)'::regprocedure;
 IF NOT FOUND OR p.prosecdef IS DISTINCT FROM false
    OR p.provolatile IS DISTINCT FROM 'v'
    OR p.proretset IS DISTINCT FROM false
    OR p.prorettype IS DISTINCT FROM 'boolean'::regtype::oid
    OR p.lanname IS DISTINCT FROM 'sql'
    OR p.pronargdefaults IS DISTINCT FROM 0
    OR p.provariadic IS DISTINCT FROM 0::oid
    OR p.proargnames IS DISTINCT FROM ARRAY[
      'p_auth_user_id','p_taxpayer_record_id','p_assessment_year',
      'p_idempotency_key','p_request_hash','p_receipt_hash',
      'p_trace_hash','p_result_state','p_audit_trace',
      'p_trace_bytes','p_trace_encoding_version']::text[]
    OR pg_catalog.cardinality(p.proconfig) IS DISTINCT FROM 1
    OR pg_catalog.replace(pg_catalog.split_part(p.proconfig[1],'=',2),' ','')
       IS DISTINCT FROM 'pg_catalog,ws02_owner'
    OR NOT has_schema_privilege('ws02_owner_engine','ws02_review_api','USAGE')
    OR has_schema_privilege('ws02_owner_auth','ws02_review_api','USAGE')
    OR has_schema_privilege('ws02_owner_anon','ws02_review_api','USAGE')
    OR NOT has_function_privilege('ws02_owner_engine',
       'ws02_review_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)','EXECUTE')
    OR has_function_privilege('ws02_owner_auth',
       'ws02_review_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)','EXECUTE')
    OR has_function_privilege('ws02_owner_anon',
       'ws02_review_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)','EXECUTE')
    OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc f
       CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(f.proacl,pg_catalog.acldefault('f',f.proowner))) a
       WHERE f.oid='ws02_review_api.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)'::regprocedure
         AND (a.grantee=0 OR a.grantee NOT IN
              ('ws02_owner_engine'::regrole::oid,f.proowner)))
 THEN RAISE EXCEPTION 'VERSIONED_REVIEW_FACADE_EXPOSURE_OR_METADATA_DRIFT'; END IF;
END $review_facade_acl$;

-- Real non-superuser attempts, not merely catalog checks. No signed JWT
-- verification is implied by the synthetic PostgreSQL role boundary.
SAVEPOINT review_auth_attempt;
SET LOCAL ROLE ws02_owner_auth;
DO $review_auth_denial$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM ws02_review_api.nbr_commit_evaluation_versioned_candidate(
   '60000000-0000-4000-8000-000000000001'::uuid,
   '50000000-0000-4000-8000-000000000001'::uuid,
   '2026-27','review-facade-auth-deny-00001',
   pg_catalog.repeat('a',64),pg_catalog.repeat('b',64),
   pg_catalog.repeat('c',64),'NEEDS_FACTS','{}'::jsonb,
   '{}','NBR_W5_CANONICAL_UTF8_V1');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'AUTH_REACHED_VERSIONED_REVIEW_FACADE'; END IF;
END $review_auth_denial$;
ROLLBACK TO SAVEPOINT review_auth_attempt;
RELEASE SAVEPOINT review_auth_attempt;

SAVEPOINT review_anon_attempt;
SET LOCAL ROLE ws02_owner_anon;
DO $review_anon_denial$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM ws02_review_api.nbr_commit_evaluation_versioned_candidate(
   '60000000-0000-4000-8000-000000000001'::uuid,
   '50000000-0000-4000-8000-000000000001'::uuid,
   '2026-27','review-facade-anon-deny-00001',
   pg_catalog.repeat('a',64),pg_catalog.repeat('b',64),
   pg_catalog.repeat('c',64),'NEEDS_FACTS','{}'::jsonb,
   '{}','NBR_W5_CANONICAL_UTF8_V1');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 IF NOT denied THEN RAISE EXCEPTION 'ANON_REACHED_VERSIONED_REVIEW_FACADE'; END IF;
END $review_anon_denial$;
ROLLBACK TO SAVEPOINT review_anon_attempt;
RELEASE SAVEPOINT review_anon_attempt;

-- WS02: JWT request GUCs are caller-writable in this disposable fixture.
-- They are NOT verified signatures and must never confer the review facade's
-- trusted producer EXECUTE privilege. Exercise the actual non-superuser
-- SESSION identity (not SET LOCAL ROLE under a superuser session).
SAVEPOINT review_forged_auth_claims;
SET SESSION AUTHORIZATION ws02_owner_auth;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '60000000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('request.jwt.claim.role','ws02_owner_engine',true);
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"60000000-0000-4000-8000-000000000001","role":"ws02_owner_engine"}',true);
DO $review_forged_auth_claims$
DECLARE denied boolean:=false; escalation_denied boolean:=false;
BEGIN
 BEGIN
  PERFORM ws02_review_api.nbr_commit_evaluation_versioned_candidate(
   '60000000-0000-4000-8000-000000000001'::uuid,
   '50000000-0000-4000-8000-000000000001'::uuid,
   '2026-27','review-facade-claims-auth-00001',
   pg_catalog.repeat('a',64),pg_catalog.repeat('b',64),
   pg_catalog.repeat('c',64),'NEEDS_FACTS','{}'::jsonb,
   '{}','NBR_W5_CANONICAL_UTF8_V1');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 BEGIN
  EXECUTE 'SET ROLE ws02_owner_engine';
 EXCEPTION WHEN insufficient_privilege THEN escalation_denied:=true;
 END;
 IF NOT denied OR NOT escalation_denied
    OR current_user IS DISTINCT FROM 'ws02_owner_auth'
 THEN RAISE EXCEPTION 'FORGED_AUTH_JWT_GUC_REACHED_REVIEW_FACADE_OR_ROLE'; END IF;
END $review_forged_auth_claims$;
ROLLBACK TO SAVEPOINT review_forged_auth_claims;
RELEASE SAVEPOINT review_forged_auth_claims;

SAVEPOINT review_forged_anon_claims;
SET SESSION AUTHORIZATION ws02_owner_anon;
SELECT pg_catalog.set_config('request.jwt.claim.sub',
 '60000000-0000-4000-8000-000000000001',true);
SELECT pg_catalog.set_config('request.jwt.claim.role','ws02_owner_engine',true);
SELECT pg_catalog.set_config('request.jwt.claims',
 '{"sub":"60000000-0000-4000-8000-000000000001","role":"ws02_owner_engine"}',true);
DO $review_forged_anon_claims$
DECLARE denied boolean:=false; escalation_denied boolean:=false;
BEGIN
 BEGIN
  PERFORM ws02_review_api.nbr_commit_evaluation_versioned_candidate(
   '60000000-0000-4000-8000-000000000001'::uuid,
   '50000000-0000-4000-8000-000000000001'::uuid,
   '2026-27','review-facade-claims-anon-00001',
   pg_catalog.repeat('a',64),pg_catalog.repeat('b',64),
   pg_catalog.repeat('c',64),'NEEDS_FACTS','{}'::jsonb,
   '{}','NBR_W5_CANONICAL_UTF8_V1');
 EXCEPTION WHEN insufficient_privilege THEN denied:=true;
 END;
 BEGIN
  EXECUTE 'SET ROLE ws02_owner_engine';
 EXCEPTION WHEN insufficient_privilege THEN escalation_denied:=true;
 END;
 IF NOT denied OR NOT escalation_denied
    OR current_user IS DISTINCT FROM 'ws02_owner_anon'
 THEN RAISE EXCEPTION 'FORGED_ANON_JWT_GUC_REACHED_REVIEW_FACADE_OR_ROLE'; END IF;
END $review_forged_anon_claims$;
ROLLBACK TO SAVEPOINT review_forged_anon_claims;
RELEASE SAVEPOINT review_forged_anon_claims;
SELECT 'PASS_SCOPED_FORGED_JWT_GUCS_DENIED_BY_REVIEW_FACADE' AS marker;

-- Trusted synthetic producer can invoke the wrapper, but cannot finalize
-- without a matching reserved slot and digest. No rows may be written.
SAVEPOINT review_engine_attempt;
SET LOCAL ROLE ws02_owner_engine;
DO $review_engine_denial$
DECLARE actual boolean;
BEGIN
 actual:=ws02_review_api.nbr_commit_evaluation_versioned_candidate(
  '60000000-0000-4000-8000-000000000001'::uuid,
  '50000000-0000-4000-8000-000000000001'::uuid,
  '2026-27','review-facade-no-slot-00001',
  pg_catalog.repeat('a',64),pg_catalog.repeat('b',64),
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('{}','UTF8')),'hex'),
  'NEEDS_FACTS','{}'::jsonb,'{}','NBR_W5_CANONICAL_UTF8_V1');
 IF actual IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'REVIEW_FACADE_UNRESERVED_COMMIT_ACCEPTED'; END IF;
END $review_engine_denial$;
ROLLBACK TO SAVEPOINT review_engine_attempt;
RELEASE SAVEPOINT review_engine_attempt;
DO $review_no_rows$
BEGIN
 IF EXISTS(SELECT 1 FROM ws02_owner.slots WHERE idem_key LIKE 'review-facade-%')
 OR EXISTS(SELECT 1 FROM ws02_owner.evaluation_logs WHERE idem_key LIKE 'review-facade-%')
 THEN RAISE EXCEPTION 'REVIEW_FACADE_NEGATIVES_LEFT_ROWS'; END IF;
END $review_no_rows$;
ROLLBACK;
SELECT 'PASS_SCOPED_11_ARG_INVOKER_REVIEW_FACADE_NO_PUBLIC_EXPOSURE' AS marker;
