-- Run in an isolated SQL acceptance database after the approved-fixture Office migration.
-- Everything below is rolled back; it does not create a payment or notice permanently.
begin;
do $verify$
declare
  v_before integer;
  v_after integer;
  v_approved uuid:=gen_random_uuid();
  v_unapproved uuid:=gen_random_uuid();
  v_session uuid:=gen_random_uuid();
  v_row jsonb;
  v_notices jsonb;
begin
  v_before := (public.demo_story1_office_page(1,100)->>'total')::integer;
  perform public.demo_story1_mirror(jsonb_build_object(
    'id',v_approved,'sessionId',v_session,'service','TRAVEL_TAX',
    'amountMinor',12500,'status','SIMULATED_SUCCESS','createdAt',now(),
    'data',jsonb_build_object('origin','TAXPAY_SQL_FIXTURE',
      'service','TRAVEL_TAX','amountMinor',12500,
      'details',jsonb_build_object(
        'payerId','user1','sampleOnly',true,
        'fixtureBatch','TAXPAY-20261107-30-PROFILE-COVERAGE',
        'passportNumber','SENSITIVEPASS123',
        'passportNumberMasked','••••S123',
        'passengers',jsonb_build_array(jsonb_build_object('passportMasked','••••S123')),
        'lines',jsonb_build_array(jsonb_build_object(
          'beneficiary','user1','category','TRAVEL_TAX',
          'assessmentYear','2026-27','amountMinor',12500,
          'note','Passport: SENSITIVEPASS123'))))));
  perform public.demo_story1_mirror(jsonb_build_object(
    'id',v_unapproved,'sessionId',gen_random_uuid(),'service','TRAVEL_TAX',
    'amountMinor',12500,'status','SIMULATED_SUCCESS','createdAt',now(),
    'data',jsonb_build_object('origin','TAXPAY_SQL_FIXTURE',
      'service','TRAVEL_TAX','amountMinor',12500,
      'details',jsonb_build_object(
        'payerId','user1','sampleOnly',true,
        'fixtureBatch','UNAPPROVED-NEVER-EXPOSE',
        'lines',jsonb_build_array(jsonb_build_object(
          'beneficiary','user1','category','TRAVEL_TAX',
          'assessmentYear','2026-27','amountMinor',12500))))));
  v_after := (public.demo_story1_office_page(1,100)->>'total')::integer;
  if v_after <> v_before+1 then
    raise exception 'Office fixture whitelist total mismatch: % vs %',v_after,v_before;
  end if;
  select value into v_row from jsonb_array_elements(public.demo_story1_office_page(1,100)->'items')
    where value->>'id'=v_approved::text;
  if v_row is null then raise exception 'Approved fixture not visible in Office page'; end if;
  if position('SENSITIVEPASS123' in v_row::text)>0
     or (v_row->'details')?'passportNumber'
     or (v_row->'details'->'lines'->0)?'note' then
    raise exception 'Travel passport redaction regressed';
  end if;
  if exists(select 1 from jsonb_array_elements(public.demo_story1_office_page(1,100)->'items')
    where value->>'id'=v_unapproved::text) then
    raise exception 'Unapproved fixture leaked into Office page';
  end if;
  v_notices := public.demo_story1_office_notices();
  if not exists(select 1 from jsonb_array_elements(v_notices) x
    where x->>'paymentId'=v_approved::text)
    or exists(select 1 from jsonb_array_elements(v_notices) x
    where x->>'paymentId'=v_unapproved::text) then
    raise exception 'Office notification fixture allowlist differs from transactions';
  end if;
  raise notice 'PASS: approved fixture visible; unapproved fixture excluded; Travel Tax passport masked; notice projection matched';
end;
$verify$;
rollback;
