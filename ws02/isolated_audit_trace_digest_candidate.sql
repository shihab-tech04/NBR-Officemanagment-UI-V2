-- Candidate-only cryptographic binding for nested JSONB audit evidence.
-- Disposable PG17, not the deployed WS02 atomic RPC or approved trace encoding.
-- PostgreSQL JSONB::text is the explicit byte representation for this candidate;
-- cross-runtime canonicalization and W5 traceHash compatibility remain unverified.
BEGIN;
CREATE TEMP TABLE ws02_digest_candidate (
  synthetic_id text PRIMARY KEY,
  audit_trace jsonb NOT NULL CHECK (jsonb_typeof(audit_trace)='object'),
  trace_sha256 text NOT NULL CHECK (trace_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT trace_matches_stored_jsonb CHECK (
    trace_sha256 = pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(audit_trace::text,'UTF8')), 'hex'))
);
DO $candidate$
DECLARE
  original jsonb := '{"actor_user_id":"synthetic","assessment_year":"2026-27","evidence":{"refs":["gazette-abc","rule-xyz"],"metadata":{"locale":"বাংলা","flags":[]}},"review":{"status":"NEEDS_FACTS"}}'::jsonb;
  reordered jsonb := '{"review":{"status":"NEEDS_FACTS"},"evidence":{"metadata":{"flags":[],"locale":"বাংলা"},"refs":["gazette-abc","rule-xyz"]},"assessment_year":"2026-27","actor_user_id":"synthetic"}'::jsonb;
  altered jsonb;
  expected_hash text;
  denied boolean;
BEGIN
  expected_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(original::text,'UTF8')), 'hex');
  IF original IS DISTINCT FROM reordered OR
     expected_hash IS DISTINCT FROM pg_catalog.encode(
       pg_catalog.sha256(pg_catalog.convert_to(reordered::text,'UTF8')), 'hex')
  THEN RAISE EXCEPTION 'CANDIDATE_JSONB_KEY_ORDER_NOT_DETERMINISTIC'; END IF;

  INSERT INTO ws02_digest_candidate VALUES ('original',original,expected_hash);
  IF (SELECT count(*) FROM ws02_digest_candidate WHERE synthetic_id='original'
      AND trace_sha256=expected_hash AND audit_trace=original)<>1
  THEN RAISE EXCEPTION 'CANDIDATE_VALID_INSERT_READBACK_FAILED'; END IF;

  denied := false;
  BEGIN
    INSERT INTO ws02_digest_candidate VALUES ('forged-hash',original,repeat('0',64));
  EXCEPTION WHEN check_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'CANDIDATE_FORGED_HASH_ACCEPTED'; END IF;

  altered := pg_catalog.jsonb_set(original,'{evidence,metadata,locale}','"altered"'::jsonb);
  denied := false;
  BEGIN
    INSERT INTO ws02_digest_candidate VALUES ('forged-trace',altered,expected_hash);
  EXCEPTION WHEN check_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'CANDIDATE_MUTATED_NESTED_TRACE_ACCEPTED'; END IF;

  denied := false;
  BEGIN
    UPDATE ws02_digest_candidate SET audit_trace=altered
    WHERE synthetic_id='original';
  EXCEPTION WHEN check_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'CANDIDATE_POST_INSERT_TRACE_MUTATION_ACCEPTED'; END IF;

  denied := false;
  BEGIN
    UPDATE ws02_digest_candidate SET trace_sha256=repeat('f',64)
    WHERE synthetic_id='original';
  EXCEPTION WHEN check_violation THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'CANDIDATE_POST_INSERT_HASH_MUTATION_ACCEPTED'; END IF;

  IF (SELECT count(*) FROM ws02_digest_candidate)<>1 OR
     (SELECT audit_trace FROM ws02_digest_candidate WHERE synthetic_id='original')
       IS DISTINCT FROM original OR
     (SELECT trace_sha256 FROM ws02_digest_candidate WHERE synthetic_id='original')
       IS DISTINCT FROM expected_hash
  THEN RAISE EXCEPTION 'CANDIDATE_NEGATIVE_CASES_LEFT_MUTATED_STATE'; END IF;
END $candidate$;

-- Candidate-only invoker wrapper exercises the REAL private atomic RPC using
-- the PostgreSQL JSONB::text digest representation. The existing RPC is
-- intentionally unchanged: W5 Edge canonicalization is NOT yet proven equal.
-- This wrapper is not in an exposed schema, and never leaves disposable PG17.
CREATE FUNCTION ws02_owner.nbr_commit_evaluation_sha256_candidate(
 p_auth_user_id uuid,p_taxpayer_record_id uuid,p_assessment_year text,
 p_idempotency_key text,p_request_hash text,p_receipt_hash text,
 p_trace_hash text,p_result_state text,p_audit_trace jsonb
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path=pg_catalog,ws02_owner AS $candidate_wrapper$
BEGIN
 IF p_audit_trace IS NULL OR pg_catalog.jsonb_typeof(p_audit_trace) IS DISTINCT FROM 'object'
    OR p_trace_hash IS DISTINCT FROM pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(p_audit_trace::text,'UTF8')),'hex')
 THEN RETURN false; END IF;
 RETURN ws02_owner.nbr_commit_evaluation_atomically(
   p_auth_user_id,p_taxpayer_record_id,p_assessment_year,p_idempotency_key,
   p_request_hash,p_receipt_hash,p_trace_hash,p_result_state,p_audit_trace);
END $candidate_wrapper$;
REVOKE ALL ON FUNCTION ws02_owner.nbr_commit_evaluation_sha256_candidate(
 uuid,uuid,text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ws02_owner.nbr_commit_evaluation_sha256_candidate(
 uuid,uuid,text,text,text,text,text,text,jsonb) TO ws02_owner_engine;
INSERT INTO ws02_owner.owners(record_id,assessment_year,actor_id,state) VALUES
 ('50000000-0000-4000-8000-000000000091','2026-27',
  '60000000-0000-4000-8000-000000000091','ACTIVE');
SET LOCAL ROLE ws02_owner_engine;
DO $candidate_atomic_test$
DECLARE
 actor uuid:='60000000-0000-4000-8000-000000000091';
 record uuid:='50000000-0000-4000-8000-000000000091';
 idem text:='digest-candidate-atomic-00001';
 req text:=repeat('a',64);
 receipt text:=repeat('b',64);
 audit jsonb;
 altered jsonb;
 digest text;
 reservation jsonb;
BEGIN
 audit:=pg_catalog.jsonb_build_object(
  'actor_user_id',actor::text,'taxpayer_record_id',record::text,
  'assessment_year','2026-27','income_year','2025-26',
  'authorized_request_hash',req,'receipt_hash',receipt,
  'idempotency_key',idem,'result_status','NEEDS_FACTS',
  'contract_version','NBR_ENGINE_CITIZEN_V2_REVIEW',
  'evidence',pg_catalog.jsonb_build_object('refs',pg_catalog.jsonb_build_array('synthetic-only'),
     'metadata',pg_catalog.jsonb_build_object('locale','বাংলা','flags','[]'::jsonb)));
 digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(audit::text,'UTF8')),'hex');
 reservation:=ws02_owner.nbr_reserve_citizen_evaluation(
  actor,record,'2026-27',idem,req,'NBR_ENGINE_CITIZEN_V2_REVIEW');
 IF reservation->>'state' IS DISTINCT FROM 'RESERVED'
 THEN RAISE EXCEPTION 'DIGEST_CANDIDATE_ATOMIC_RESERVATION_FAILED'; END IF;
 IF ws02_owner.nbr_commit_evaluation_sha256_candidate(
  actor,record,'2026-27',idem,req,receipt,repeat('0',64),'NEEDS_FACTS',audit)
 THEN RAISE EXCEPTION 'DIGEST_CANDIDATE_FORGED_HASH_ACCEPTED'; END IF;
 altered:=pg_catalog.jsonb_set(audit,'{evidence,metadata,locale}','"tampered"'::jsonb);
 IF ws02_owner.nbr_commit_evaluation_sha256_candidate(
  actor,record,'2026-27',idem,req,receipt,digest,'NEEDS_FACTS',altered)
 THEN RAISE EXCEPTION 'DIGEST_CANDIDATE_NESTED_TAMPER_ACCEPTED'; END IF;
 IF ws02_owner.nbr_commit_evaluation_sha256_candidate(
  '60000000-0000-4000-8000-000000000092'::uuid,record,'2026-27',
  idem,req,receipt,digest,'NEEDS_FACTS',audit)
 THEN RAISE EXCEPTION 'DIGEST_CANDIDATE_WRONG_ACTOR_ACCEPTED'; END IF;
 IF ws02_owner.nbr_commit_evaluation_sha256_candidate(
  actor,record,'2027-28',idem,req,receipt,digest,'NEEDS_FACTS',audit)
 THEN RAISE EXCEPTION 'DIGEST_CANDIDATE_CROSS_YEAR_ACCEPTED'; END IF;
 IF NOT ws02_owner.nbr_commit_evaluation_sha256_candidate(
  actor,record,'2026-27',idem,req,receipt,digest,'NEEDS_FACTS',audit)
 THEN RAISE EXCEPTION 'DIGEST_CANDIDATE_VALID_ATOMIC_COMMIT_DENIED'; END IF;
 IF ws02_owner.nbr_commit_evaluation_sha256_candidate(
  actor,record,'2026-27',idem,req,receipt,digest,'NEEDS_FACTS',audit)
 THEN RAISE EXCEPTION 'DIGEST_CANDIDATE_ATOMIC_REPLAY_ACCEPTED'; END IF;
END $candidate_atomic_test$;
RESET ROLE;
DO $candidate_atomic_readback$
BEGIN
 IF (SELECT count(*) FROM ws02_owner.slots
     WHERE idem_key='digest-candidate-atomic-00001'
       AND assessment_year='2026-27' AND state='FINALIZED'
       AND receipt_hash=repeat('b',64)) IS DISTINCT FROM 1
 OR (SELECT count(*) FROM ws02_owner.evaluation_logs
     WHERE idem_key='digest-candidate-atomic-00001'
       AND assessment_year='2026-27' AND result_state='NEEDS_FACTS'
       AND trace_hash=pg_catalog.encode(
         pg_catalog.sha256(pg_catalog.convert_to(audit_trace::text,'UTF8')),'hex')
       AND audit_trace #>> '{evidence,metadata,locale}'='বাংলা')
       IS DISTINCT FROM 1
 THEN RAISE EXCEPTION 'DIGEST_CANDIDATE_ATOMIC_TRACE_RECEIPT_READBACK_FAILED'; END IF;
END $candidate_atomic_readback$;
SELECT 'DISPOSABLE_JSONB_SHA256_CANDIDATE_ATOMIC_RPC_PASS_ONLY' AS scoped_result;

ROLLBACK;
SELECT 'DISPOSABLE_JSONB_SHA256_CANDIDATE_NEGATIVE_PASS_ONLY' AS scoped_result;
