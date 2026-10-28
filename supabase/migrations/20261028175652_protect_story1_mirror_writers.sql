-- A public Edge Function verifies each source record before mirroring it.
-- Prevent direct RPC callers from bypassing that verification. These grants
-- do not alter existing payment records or grant Office read access.
revoke all on function public.demo_story1_mirror(jsonb) from public, anon, authenticated;
revoke all on function public.demo_auth_office_mirror(jsonb) from public, anon, authenticated;
grant execute on function public.demo_story1_mirror(jsonb) to service_role;
grant execute on function public.demo_auth_office_mirror(jsonb) to service_role;
