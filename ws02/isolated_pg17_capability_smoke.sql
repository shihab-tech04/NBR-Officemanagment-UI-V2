-- WS02 disposable PostgreSQL 17 capability smoke. No production schema/tenant data.
-- Synthetic objects ONLY: this does NOT test the original WS02 legal migration.
DO $
BEGIN
  IF current_setting('server_version_num')::int < 170000 THEN
    RAISE EXCEPTION 'POSTGRES_17_REQUIRED';
  END IF;
END $;

CREATE ROLE nbr_probe_anon NOLOGIN;
CREATE ROLE nbr_probe_authenticated NOLOGIN;
CREATE SCHEMA ws02_probe;
REVOKE ALL ON SCHEMA ws02_probe FROM PUBLIC;
CREATE TABLE ws02_probe.review_candidates (
  candidate_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_locator text NOT NULL CHECK (length(trim(source_locator)) > 0),
  review_state text NOT NULL CHECK (review_state IN ('DRAFT','REVIEW_REQUIRED'))
);
ALTER TABLE ws02_probe.review_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA ws02_probe FROM PUBLIC;

DO $$
BEGIN
  IF has_schema_privilege('nbr_probe_anon','ws02_probe','USAGE') OR
     has_schema_privilege('nbr_probe_authenticated','ws02_probe','USAGE') OR
     has_table_privilege('nbr_probe_anon','ws02_probe.review_candidates','SELECT') OR
     has_table_privilege('nbr_probe_authenticated','ws02_probe.review_candidates','INSERT') THEN
      RAISE EXCEPTION 'UNAUTHORIZED_ROLE_PRIVILEGE';
  END IF;
END $$;

-- Exercise a successful insert, rejection of duplicate idempotency, and rollback.
BEGIN;
  INSERT INTO ws02_probe.review_candidates
    (idempotency_key,source_sha256,source_locator,review_state)
  VALUES
    ('synthetic-review-01',repeat('a',64),'SYNTHETIC:PAGE:1','DRAFT');
  SAVEPOINT synthetic_dedup;
  INSERT INTO ws02_probe.review_candidates
    (idempotency_key,source_sha256,source_locator,review_state)
  VALUES
    ('synthetic-review-01',repeat('a',64),'SYNTHETIC:PAGE:1','DRAFT')
  ON CONFLICT (idempotency_key) DO NOTHING;
  DO $$
  BEGIN
    IF (SELECT count(*) FROM ws02_probe.review_candidates) <> 1 THEN
      RAISE EXCEPTION 'DUPLICATE_IDEMPOTENCY_INSERTED';
    END IF;
  END $$;
ROLLBACK;

DO $$
BEGIN
  IF (SELECT count(*) FROM ws02_probe.review_candidates) <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK_DID_NOT_RESTORE_EMPTY_TABLE';
  END IF;
END $$;

DROP SCHEMA ws02_probe CASCADE;
DROP ROLE nbr_probe_authenticated;
DROP ROLE nbr_probe_anon;

SELECT 'DISPOSABLE_PG17_CAPABILITY_PROBE_PASS_ONLY' AS result;
