-- Phase 3: only after the verified Office Edge is using its server-side
-- role, remove the legacy Data API bypass. Preserve all other public functions.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.demo_story1_mirror(jsonb) FROM PUBLIC,anon,authenticated;
DO $office_private_mirror_check$
BEGIN
  IF has_function_privilege('anon','public.demo_story1_mirror(jsonb)','EXECUTE') OR
     has_function_privilege('authenticated','public.demo_story1_mirror(jsonb)','EXECUTE') OR
     NOT has_function_privilege('service_role','public.demo_story1_mirror(jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'OFFICE_PUBLIC_MIRROR_PERMISSION_NOT_HARDENED'; END IF;
END $office_private_mirror_check$;
COMMIT;
