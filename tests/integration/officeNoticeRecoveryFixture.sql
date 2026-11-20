-- Disposable-only mirror schema for cursor recovery contract tests.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END;
$roles$;

-- The cursor has the SAME authenticated officer gate as notice read/ack SQL.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE SET search_path TO '' AS $function$
    SELECT nullif(pg_catalog.current_setting('request.jwt.claim.sub',true),'')::uuid
  $function$;
CREATE SCHEMA IF NOT EXISTS payment_sync;
CREATE TABLE IF NOT EXISTS payment_sync.settings(
  singleton boolean PRIMARY KEY,origin text NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_sync.officer_roles(
  user_uid uuid PRIMARY KEY REFERENCES auth.users(id),
  role text NOT NULL,active boolean NOT NULL
);
INSERT INTO auth.users(id) VALUES
 ('80000000-0000-4000-8000-000000000011'),
 ('80000000-0000-4000-8000-000000000014')
 ON CONFLICT DO NOTHING;
INSERT INTO payment_sync.settings(singleton,origin) VALUES(true,'OFFICE_SQL')
  ON CONFLICT(singleton) DO UPDATE SET origin=EXCLUDED.origin;
INSERT INTO payment_sync.officer_roles(user_uid,role,active) VALUES
 ('80000000-0000-4000-8000-000000000011','MAKER',true),
 ('80000000-0000-4000-8000-000000000014','VIEWER',true)
 ON CONFLICT(user_uid) DO UPDATE SET role=EXCLUDED.role,active=EXCLUDED.active;

CREATE SCHEMA IF NOT EXISTS demo_payment;
CREATE TABLE demo_payment.story_payments (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL,
  service_code text NOT NULL,
  amount_minor bigint NOT NULL,
  data jsonb NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  mirrored_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount_minor>0),
  CHECK (jsonb_typeof(data)='object'),
  CHECK (status='SIMULATED_SUCCESS')
);
CREATE TABLE demo_payment.story_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id uuid NOT NULL REFERENCES demo_payment.story_payments(id),
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payment_id,event_type)
);
ALTER TABLE demo_payment.story_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_payment.story_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA demo_payment FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA demo_payment FROM PUBLIC,anon,authenticated;
