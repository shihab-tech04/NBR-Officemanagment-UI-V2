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
