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
ROLLBACK;
SELECT 'DISPOSABLE_JSONB_SHA256_CANDIDATE_NEGATIVE_PASS_ONLY' AS scoped_result;
