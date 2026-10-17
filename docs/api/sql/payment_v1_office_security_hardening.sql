-- Office API audit finding: public.rls_auto_enable() is an event-trigger handler,
-- not an authenticated/anonymous RPC. Its default EXECUTE grant is unnecessary.
-- This change does not remove or disable the event trigger itself.
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
