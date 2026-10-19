-- Disposable SQL acceptance only. All fictional fixtures are rolled back.
-- This tests the Office projection, not a live source-to-Office delivery.
begin;
do $check$
declare
  categories text[] := array[
    'TAX_WITH_RETURN','ADVANCE_TAX','ASSESSED_DEMAND','PENALTY',
    'SOURCE_TAX_DEPOSIT','APPELLATE_TRIBUNAL','OTHER_TAX_PAYMENT','TRAVEL_TAX'];
  category text;
  source_id uuid;
  session_id uuid;
  input jsonb;
  response jsonb;
  audit_id uuid := gen_random_uuid();
  initial_audit jsonb;
  updated_audit jsonb;
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='demo_payment' and c.relname in
        ('story_payments','story_notifications','authorization_audit') and c.relkind='r') <> 3
  then raise exception 'Missing Office mirror tables'; end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='demo_payment' and c.relname in
        ('story_payments','story_notifications','authorization_audit') and c.relrowsecurity) <> 3
  then raise exception 'Office mirror tables must have RLS'; end if;

  foreach category in array categories loop
    source_id := gen_random_uuid();
    session_id := gen_random_uuid();
    input := jsonb_build_object(
      'id',source_id,'sessionId',session_id,'service',category,
      'amountMinor',12345,'status','SIMULATED_SUCCESS',
      'createdAt','2026-10-18T09:30:00Z',
      'data',jsonb_build_object('origin','TAXPAY_UI','service',category,'amountMinor',12345,
        'details',jsonb_build_object('payerName','Synthetic acceptance test')));
    response := public.demo_story1_mirror(input);
    if (response->>'id')::uuid <> source_id or response->>'replayed' <> 'false'
    then raise exception 'First mirror failed for %',category; end if;
    response := public.demo_story1_mirror(input);
    if response->>'replayed' <> 'true'
    then raise exception 'Idempotent mirror replay failed for %',category; end if;
  end loop;
  if (select count(*) from demo_payment.story_payments
      where service_code = any(categories)) <> 8
  then raise exception 'Eight-category payment mirror count mismatch'; end if;
  if (select count(*) from demo_payment.story_notifications
      where event_type='NEW_SIMULATED_PAYMENT') <> 8
  then raise exception 'Eight-category notification count mismatch'; end if;
  if jsonb_array_length(public.demo_story1_office_page(1,100)->'items') <> 8
  then raise exception 'Office UI pagination missed simulated categories'; end if;
  if (select count(*) from jsonb_array_elements(public.demo_story1_office_notices())) <> 8
  then raise exception 'Office UI notice list missed simulated categories'; end if;

  initial_audit := public.demo_auth_office_mirror(jsonb_build_object(
    'id',audit_id,'payerId','user1','taxpayerId','user2','status','PENDING',
    'requestedAt','2026-10-18T09:30:00Z','codeResends',0));
  updated_audit := public.demo_auth_office_mirror(jsonb_build_object(
    'id',audit_id,'payerId','user1','taxpayerId','user2','status','CANCELLED',
    'requestedAt','2026-10-18T09:30:00Z','codeResends',1,
    'codeSentAt','2026-10-18T09:33:00Z'));
  if initial_audit->>'status'<>'PENDING' or updated_audit->>'status'<>'CANCELLED'
     or updated_audit->>'codeResends'<>'1'
  then raise exception 'Authorization cancellation/resend mirror mismatch'; end if;
  if exists(select 1 from information_schema.columns
    where table_schema='demo_payment' and table_name='authorization_audit'
      and column_name in ('code_value','consent_code','otp','password'))
  then raise exception 'Office authorization audit contains a credential field'; end if;
  raise notice 'PASS: eight fictional payments, replay, notices, UI page, RLS and code-free authorization mirror';
end;
$check$;
rollback;
