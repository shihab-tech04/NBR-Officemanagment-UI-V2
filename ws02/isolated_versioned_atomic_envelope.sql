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
