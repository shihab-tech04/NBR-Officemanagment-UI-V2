-- Office P0: Legacy mirror/read RPCs have SECURITY DEFINER privileges on
-- original hosted Office SQL. Never expose them to a caller without an
-- independently checked Office role. Existing officer-authenticated
-- payment_v1_* read RPCs remain unchanged.
--
-- These historical RPCs are for the existing service-to-service integration;
-- if absent in a disposable database, leave them absent. No roles, data,
-- payment identities or authorization states are created here.
BEGIN;
DO $legacy_private$
BEGIN
  IF to_regprocedure('public.demo_auth_office_mirror(jsonb)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.demo_auth_office_mirror(jsonb)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.demo_auth_office_mirror(jsonb)
      TO service_role;
  END IF;
  IF to_regprocedure('public.demo_story1_office_list()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.demo_story1_office_list()
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.demo_story1_office_list()
      TO service_role;
  END IF;
  -- Legacy payment page exposes mirrored payment details without an officer
  -- session check. Current Office Edge /payments uses the separately guarded
  -- payment_v1_office_guarded_story_page RPC; never change that read path.
  -- Keep the three public synthetic office_v1_handoff_* prototype RPCs intact.
  IF to_regprocedure('public.demo_story1_office_page(integer,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.demo_story1_office_page(integer,integer)
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.demo_story1_office_page(integer,integer)
      TO service_role;
  END IF;
  IF to_regprocedure('public.demo_story1_office_notices()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.demo_story1_office_notices()
      FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.demo_story1_office_notices()
      TO service_role;
  END IF;
END;
$legacy_private$;
COMMIT;
