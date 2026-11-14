-- Auth reference prerequisite for SQL migration tests only.
-- The CI database is disposable; this does not create or replace Auth in either project.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(
  id uuid PRIMARY KEY,
  email text UNIQUE
);

-- Local PostgreSQL 17 CI has no Supabase Auth extension installed.
-- Reproduce only auth.uid() reading the existing JWT claim for the disposable
-- permissions test. Never create this function in production Supabase.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;

-- CI only: hosted Office settings/roles are not re-created by the candidate
-- migration series. Mirror their minimal identity contract in disposable PG17.
CREATE SCHEMA IF NOT EXISTS payment_sync;
CREATE TABLE IF NOT EXISTS payment_sync.settings(
  singleton boolean PRIMARY KEY,
  origin text NOT NULL
);
INSERT INTO payment_sync.settings(singleton,origin)
VALUES(true,'OFFICE_SQL') ON CONFLICT(singleton) DO NOTHING;
CREATE TABLE IF NOT EXISTS payment_sync.officer_roles(
  user_uid uuid PRIMARY KEY REFERENCES auth.users(id),
  role text NOT NULL CHECK(role IN ('MAKER','REVIEWER','APPROVER')),
  active boolean NOT NULL DEFAULT true
);
