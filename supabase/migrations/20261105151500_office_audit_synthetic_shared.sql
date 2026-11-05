-- Synthetic, intentionally login-free Office Audit workspace only.
-- Does NOT change protected office_audit_* or TaxPay/payment tables.
CREATE TABLE IF NOT EXISTS public.office_audit_demo_candidates (
 candidate_id text PRIMARY KEY,
 batch_id text NOT NULL,
 assessment_year text NOT NULL CHECK (assessment_year ~ '^20[0-9]{2}-[0-9]{2}$'),
 return_id text NOT NULL CHECK (return_id ~ '^RET-2026-[0-9]+$'),
 record jsonb NOT NULL CHECK (jsonb_typeof(record) = 'object'),
 audit_status text NOT NULL DEFAULT 'Not Started',
 last_note text,
 revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
 updated_at timestamptz NOT NULL DEFAULT now(),
 source_kind text NOT NULL DEFAULT 'synthetic' CHECK (source_kind = 'synthetic'),
 UNIQUE (assessment_year, return_id)
);
CREATE INDEX IF NOT EXISTS office_audit_demo_candidates_batch_year_idx
 ON public.office_audit_demo_candidates (assessment_year, batch_id);
CREATE TABLE IF NOT EXISTS public.office_audit_demo_events (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 candidate_id text NOT NULL REFERENCES public.office_audit_demo_candidates(candidate_id),
 return_id text NOT NULL,
 assessment_year text NOT NULL,
 from_status text NOT NULL,
 to_status text NOT NULL,
 note text NOT NULL CHECK (char_length(note) BETWEEN 10 AND 500),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 source_kind text NOT NULL DEFAULT 'synthetic' CHECK (source_kind = 'synthetic')
);
CREATE INDEX IF NOT EXISTS office_audit_demo_events_year_at_idx
 ON public.office_audit_demo_events (assessment_year, occurred_at DESC);

ALTER TABLE public.office_audit_demo_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_audit_demo_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.office_audit_demo_candidates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.office_audit_demo_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.office_audit_demo_candidates TO anon, authenticated;
GRANT UPDATE (audit_status, last_note, revision)
 ON public.office_audit_demo_candidates TO anon, authenticated;
GRANT SELECT ON public.office_audit_demo_events TO anon, authenticated;
CREATE POLICY office_audit_demo_candidates_select
 ON public.office_audit_demo_candidates FOR SELECT TO anon, authenticated
 USING (source_kind = 'synthetic');
CREATE POLICY office_audit_demo_candidates_insert
 ON public.office_audit_demo_candidates FOR INSERT TO anon, authenticated
 WITH CHECK (source_kind = 'synthetic' AND record->>'return_id' = return_id
 AND record->>'candidate_id' = candidate_id
 AND record->>'assessment_year' = assessment_year);
CREATE POLICY office_audit_demo_candidates_update
 ON public.office_audit_demo_candidates FOR UPDATE TO anon, authenticated
 USING (source_kind = 'synthetic') WITH CHECK (source_kind = 'synthetic');
CREATE POLICY office_audit_demo_events_select
 ON public.office_audit_demo_events FOR SELECT TO anon, authenticated
 USING (source_kind = 'synthetic');

CREATE SCHEMA IF NOT EXISTS office_audit_private;
REVOKE ALL ON SCHEMA office_audit_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION office_audit_private.validate_demo_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
 IF NEW.candidate_id IS DISTINCT FROM OLD.candidate_id
  OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
  OR NEW.return_id IS DISTINCT FROM OLD.return_id
  OR NEW.assessment_year IS DISTINCT FROM OLD.assessment_year
  OR NEW.record IS DISTINCT FROM OLD.record
  OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
 THEN RAISE EXCEPTION 'Only demo audit status changes are permitted'; END IF;
 IF NEW.revision <> OLD.revision + 1 THEN
  RAISE EXCEPTION 'Stale Audit record revision; reload and try again';
 END IF;
 IF NEW.audit_status = OLD.audit_status OR NOT (
  (OLD.audit_status='Not Started' AND NEW.audit_status='Assigned') OR
  (OLD.audit_status='Assigned' AND NEW.audit_status='Verifying') OR
  (OLD.audit_status='Verifying' AND NEW.audit_status IN ('Evidence Pending','Ready for Review')) OR
  (OLD.audit_status='Evidence Pending' AND NEW.audit_status IN ('Verifying','Ready for Review')) OR
  (OLD.audit_status='Ready for Review' AND NEW.audit_status IN ('Verifying','Second Review')) OR
  (OLD.audit_status='Second Review' AND NEW.audit_status IN ('Ready for Review','Rework Requested','Closed')) OR
  (OLD.audit_status='Rework Requested' AND NEW.audit_status IN ('Verifying','Ready for Review'))
 ) THEN RAISE EXCEPTION 'Invalid demo Audit status transition'; END IF;
 NEW.last_note := btrim(regexp_replace(coalesce(NEW.last_note,''), '[[:space:]]+', ' ', 'g'));
 IF char_length(NEW.last_note) NOT BETWEEN 10 AND 500 THEN
  RAISE EXCEPTION 'A review note of 10 to 500 characters is required';
 END IF;
 NEW.updated_at := now();
 RETURN NEW;
END
$$;
CREATE OR REPLACE FUNCTION office_audit_private.append_demo_status_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $$
BEGIN
 INSERT INTO public.office_audit_demo_events
 (candidate_id, return_id, assessment_year, from_status, to_status, note)
 VALUES (NEW.candidate_id, NEW.return_id, NEW.assessment_year,
         OLD.audit_status, NEW.audit_status, NEW.last_note);
 RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION office_audit_private.validate_demo_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION office_audit_private.append_demo_status_event() FROM PUBLIC;
DROP TRIGGER IF EXISTS office_audit_demo_validate_status ON public.office_audit_demo_candidates;
CREATE TRIGGER office_audit_demo_validate_status BEFORE UPDATE
 ON public.office_audit_demo_candidates FOR EACH ROW
 EXECUTE FUNCTION office_audit_private.validate_demo_status();
DROP TRIGGER IF EXISTS office_audit_demo_log_status ON public.office_audit_demo_candidates;
CREATE TRIGGER office_audit_demo_log_status AFTER UPDATE
 ON public.office_audit_demo_candidates FOR EACH ROW
 EXECUTE FUNCTION office_audit_private.append_demo_status_event();
