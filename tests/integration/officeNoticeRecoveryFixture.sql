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
