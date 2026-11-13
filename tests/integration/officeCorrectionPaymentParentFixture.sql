-- Minimal synthetic prerequisites for the correction parent-link migration test.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END;
$roles$;
ALTER ROLE service_role BYPASSRLS;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid
$function$;

CREATE SCHEMA IF NOT EXISTS payment_sync;
CREATE TABLE payment_sync.settings(singleton boolean PRIMARY KEY,origin text NOT NULL);
CREATE TABLE payment_sync.officer_roles(
  user_uid uuid PRIMARY KEY REFERENCES auth.users(id),role text NOT NULL,
  active boolean NOT NULL
);
CREATE TABLE payment_sync.control_outbox(
  message_id uuid PRIMARY KEY,request_id uuid NOT NULL,target_origin text NOT NULL,
  payload jsonb NOT NULL,delivery_state text NOT NULL DEFAULT 'PENDING',
  attempts integer NOT NULL DEFAULT 0,
  acknowledged_at timestamptz,last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),claim_token uuid
);
CREATE TABLE payment_sync.officer_decisions(
  decision_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,officer_uid uuid NOT NULL REFERENCES auth.users(id),
  officer_role text NOT NULL CHECK(officer_role IN ('MAKER','REVIEWER','APPROVER')),
  action_code text NOT NULL CHECK(action_code IN
    ('MAKER_ACKNOWLEDGE','REVIEWER_VERIFY','APPROVER_CLOSE','REJECT')),
  reason text,idempotency_key uuid NOT NULL,
  message_id uuid NOT NULL UNIQUE REFERENCES payment_sync.control_outbox(message_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(request_id,officer_uid,idempotency_key)
);

INSERT INTO auth.users(id,email)
VALUES ('80000000-0000-4000-8000-000000000011','correction-parent-maker@example.invalid')
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.users(id,email)
VALUES ('80000000-0000-4000-8000-000000000012','correction-parent-reviewer@example.invalid')
ON CONFLICT (id) DO NOTHING;
INSERT INTO payment_sync.settings(singleton,origin) VALUES(true,'OFFICE_SQL')
ON CONFLICT (singleton) DO UPDATE SET origin=EXCLUDED.origin;
INSERT INTO payment_sync.officer_roles(user_uid,role,active)
VALUES ('80000000-0000-4000-8000-000000000011','MAKER',true)
ON CONFLICT (user_uid) DO UPDATE SET role=EXCLUDED.role,active=true;
