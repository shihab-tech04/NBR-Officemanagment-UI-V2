-- Disposable database only: verify the public RPC cannot bypass source readback.
begin;

do $grants$
begin
  if has_function_privilege('anon','public.demo_story1_mirror(jsonb)','EXECUTE') or
     has_function_privilege('authenticated','public.demo_story1_mirror(jsonb)','EXECUTE') or
     has_function_privilege('anon','public.demo_auth_office_mirror(jsonb)','EXECUTE') or
     has_function_privilege('authenticated','public.demo_auth_office_mirror(jsonb)','EXECUTE') then
    raise exception 'A public role can call a privileged mirror writer';
  end if;
  if not has_function_privilege('service_role','public.demo_story1_mirror(jsonb)','EXECUTE') or
     not has_function_privilege('service_role','public.demo_auth_office_mirror(jsonb)','EXECUTE') then
    raise exception 'The trusted Edge Function cannot mirror';
  end if;
end;
$grants$;

set local role anon;
do $deny$
begin
  begin
    perform public.demo_story1_mirror('{}'::jsonb);
    raise exception 'Anonymous payment mirror unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.demo_auth_office_mirror('{}'::jsonb);
    raise exception 'Anonymous authorization mirror unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end;
$deny$;

set local role authenticated;
do $deny$
begin
  begin
    perform public.demo_story1_mirror('{}'::jsonb);
    raise exception 'Authenticated payment mirror unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
  begin
    perform public.demo_auth_office_mirror('{}'::jsonb);
    raise exception 'Authenticated authorization mirror unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end;
$deny$;

set local role service_role;
do $allow$
declare
  record_id uuid := 'a0000000-0000-4000-8000-000000000001';
  session_id uuid := 'a0000000-0000-4000-8000-000000000002';
  authorization_id uuid := 'a0000000-0000-4000-8000-000000000003';
  payment jsonb;
  result jsonb;
begin
  payment := jsonb_build_object('id',record_id,'sessionId',session_id,'service','TAX_WITH_RETURN',
    'amountMinor',12345,'status','SIMULATED_SUCCESS','createdAt','2026-10-28T00:00:00Z',
    'data',jsonb_build_object('origin','QA_BROWSER','service','TAX_WITH_RETURN','amountMinor',12345,
      'details',jsonb_build_object('payerName','Synthetic acceptance test')));
  result := public.demo_story1_mirror(payment);
  if result->>'id'<>record_id::text or result->>'replayed'<>'false' then
    raise exception 'Trusted first mirror failed'; end if;
  result := public.demo_story1_mirror(payment);
  if result->>'replayed'<>'true' then raise exception 'Trusted replay failed'; end if;
  result := public.demo_auth_office_mirror(jsonb_build_object('id',authorization_id,
    'payerId','user1','taxpayerId','user2','status','PENDING',
    'requestedAt','2026-10-28T00:00:00Z','codeResends',0));
  if result->>'id'<>authorization_id::text then raise exception 'Trusted authorization mirror failed'; end if;
end;
$allow$;
rollback;
