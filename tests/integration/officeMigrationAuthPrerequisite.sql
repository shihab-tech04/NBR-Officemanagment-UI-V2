-- Auth reference prerequisite for SQL migration tests only.
-- The CI database is disposable; this does not create or replace Auth in either project.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(
  id uuid PRIMARY KEY,
  email text UNIQUE
);
