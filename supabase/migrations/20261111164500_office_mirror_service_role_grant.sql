-- Phase 1: authorize the private server-side Office mirror client BEFORE
-- switching Edge to service_role. Keep current public grants temporarily so
-- existing valid mirrored requests do not stop between deployment steps.
BEGIN;
GRANT EXECUTE ON FUNCTION public.demo_story1_mirror(jsonb) TO service_role;
DO $office_private_mirror_grant$
BEGIN
  IF NOT has_function_privilege('service_role','public.demo_story1_mirror(jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'OFFICE_MIRROR_SERVICE_ROLE_GRANT_FAILED'; END IF;
END $office_private_mirror_grant$;
COMMIT;
