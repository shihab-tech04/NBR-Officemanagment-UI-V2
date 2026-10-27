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
