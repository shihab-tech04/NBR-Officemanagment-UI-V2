-- Disposable-only prerequisites for v9.5.3 F-177 / F-178 contract acceptance.
-- No original Office or Taxpayer project is contacted or mutated.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $auth_uid$
  SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid;
$auth_uid$;
CREATE SCHEMA payment_sync;
CREATE TABLE payment_sync.settings(singleton boolean PRIMARY KEY,origin text NOT NULL);
INSERT INTO payment_sync.settings VALUES(true,'OFFICE_SQL');
CREATE TABLE payment_sync.officer_roles(
  user_uid uuid PRIMARY KEY,
  role text NOT NULL CHECK(role IN ('MAKER','REVIEWER','APPROVER')),
  active boolean NOT NULL DEFAULT true
);
CREATE SCHEMA demo_payment;
CREATE TABLE demo_payment.story_payments(
  id uuid PRIMARY KEY,
  service_code text NOT NULL,
  amount_minor bigint NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  data jsonb NOT NULL
);
