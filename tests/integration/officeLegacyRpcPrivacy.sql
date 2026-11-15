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
CREATE OR REPLACE FUNCTION public.demo_story1_office_page(p_page integer,p_per_page integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $stub$ SELECT '[]'::jsonb $stub$;
CREATE OR REPLACE FUNCTION public.demo_story1_office_notices()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $stub$ SELECT '[]'::jsonb $stub$;
-- Match the signatures of the public synthetic prototype functions.
-- They must become service-only even when an RPC already exists on a live DB.
CREATE OR REPLACE FUNCTION public.office_v1_handoff_query(
  p_route text,p_page integer,p_per_page integer,p_filters jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $stub$ SELECT '[]'::jsonb $stub$;
CREATE OR REPLACE FUNCTION public.office_v1_handoff_status_history(
  p_route text,p_sample_id text,p_limit integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $stub$ SELECT '[]'::jsonb $stub$;
CREATE OR REPLACE FUNCTION public.office_v1_handoff_set_status(
  p_route text,p_sample_id text,p_new_status text,p_actor_code text,
  p_reason text,p_idempotency_key uuid,p_expected_revision integer)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $stub$ SELECT '{}'::jsonb $stub$;
GRANT EXECUTE ON FUNCTION public.demo_auth_office_mirror(jsonb),
  public.demo_story1_office_list(),public.demo_story1_office_notices(),
  public.demo_story1_office_page(integer,integer),
  public.office_v1_handoff_query(text,integer,integer,jsonb),
  public.office_v1_handoff_status_history(text,text,integer),
  public.office_v1_handoff_set_status(text,text,text,text,text,uuid,integer)
  TO PUBLIC,anon,authenticated;
COMMIT;
\i supabase/migrations/20261115183000_office_private_legacy_rpc.sql
DO $privilege_check$
DECLARE v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.demo_auth_office_mirror(jsonb)',
    'public.demo_story1_office_list()',
    'public.demo_story1_office_notices()',
    'public.demo_story1_office_page(integer,integer)',
    'public.office_v1_handoff_query(text,integer,integer,jsonb)',
    'public.office_v1_handoff_status_history(text,text,integer)',
    'public.office_v1_handoff_set_status(text,text,text,text,text,uuid,integer)'
  ] LOOP
    IF to_regprocedure(v_signature) IS NULL
      OR has_function_privilege('anon',v_signature,'EXECUTE')
      OR has_function_privilege('authenticated',v_signature,'EXECUTE')
      OR NOT has_function_privilege('service_role',v_signature,'EXECUTE')
    THEN RAISE EXCEPTION 'UNSAFE_OFFICE_LEGACY_RPC_EXECUTE: %',v_signature; END IF;
  END LOOP;
END;
$privilege_check$;
