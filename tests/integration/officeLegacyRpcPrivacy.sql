-- Disposable PostgreSQL only. Intentionally start with vulnerable
-- legacy definitions/grants to prove the real privilege migration revokes
-- public and anonymous execution while retaining service-to-service use.
BEGIN;
CREATE OR REPLACE FUNCTION public.demo_auth_office_mirror(p_input jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $stub$ SELECT '{}'::jsonb $stub$;
CREATE OR REPLACE FUNCTION public.demo_story1_office_list()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $stub$ SELECT '[]'::jsonb $stub$;
CREATE OR REPLACE FUNCTION public.demo_story1_office_notices()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $stub$ SELECT '[]'::jsonb $stub$;
GRANT EXECUTE ON FUNCTION public.demo_auth_office_mirror(jsonb),
  public.demo_story1_office_list(),public.demo_story1_office_notices()
  TO PUBLIC,anon,authenticated;
COMMIT;
\i supabase/migrations/20261115183000_office_private_legacy_rpc.sql
DO $privilege_check$
DECLARE v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.demo_auth_office_mirror(jsonb)',
    'public.demo_story1_office_list()',
    'public.demo_story1_office_notices()'
  ] LOOP
    IF to_regprocedure(v_signature) IS NULL
      OR has_function_privilege('anon',v_signature,'EXECUTE')
      OR has_function_privilege('authenticated',v_signature,'EXECUTE')
      OR NOT has_function_privilege('service_role',v_signature,'EXECUTE')
    THEN RAISE EXCEPTION 'UNSAFE_OFFICE_LEGACY_RPC_EXECUTE: %',v_signature; END IF;
  END LOOP;
END;
$privilege_check$;
