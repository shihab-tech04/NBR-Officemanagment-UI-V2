-- Read-only demonstration audit synchronized from TaxPay SQL through the Office mirror.
-- No one-time code or real taxpayer credentials are copied here.
create table if not exists demo_payment.authorization_audit (
  id uuid primary key,
  payer_id text not null check (payer_id ~ '^user([1-9]|10)$'),
  taxpayer_id text not null check (taxpayer_id ~ '^user([1-9]|10)$'),
  status text not null check (status in ('PENDING','CODE_ISSUED','ACTIVE','DENIED','REVOKED','EXPIRED')),
  requested_at timestamptz not null,
  confirmed_at timestamptz,
  revoked_at timestamptz,
  synced_at timestamptz not null default now()
);
create index if not exists demo_office_authorization_pair on demo_payment.authorization_audit(payer_id,taxpayer_id);
alter table demo_payment.authorization_audit enable row level security;
revoke all on demo_payment.authorization_audit from public,anon,authenticated;

create or replace function public.demo_auth_office_mirror(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_row demo_payment.authorization_audit%rowtype;
begin
 if coalesce(p_input->>'id','') !~ '^[0-9a-fA-F-]{36}$'
   or coalesce(p_input->>'payerId','') !~ '^user([1-9]|10)$'
   or coalesce(p_input->>'taxpayerId','') !~ '^user([1-9]|10)$'
   or coalesce(p_input->>'status','') not in ('PENDING','CODE_ISSUED','ACTIVE','DENIED','REVOKED','EXPIRED')
   then raise exception 'INVALID_AUTHORIZATION_SNAPSHOT';end if;
 v_id:=(p_input->>'id')::uuid;
 insert into demo_payment.authorization_audit(id,payer_id,taxpayer_id,status,requested_at,confirmed_at,revoked_at)
 values(v_id,p_input->>'payerId',p_input->>'taxpayerId',p_input->>'status',
   (p_input->>'requestedAt')::timestamptz,
   nullif(p_input->>'confirmedAt','')::timestamptz,
   nullif(p_input->>'revokedAt','')::timestamptz)
 on conflict(id) do update set status=excluded.status,confirmed_at=excluded.confirmed_at,
   revoked_at=excluded.revoked_at,synced_at=now()
 returning * into v_row;
 return jsonb_build_object('id',v_row.id,'status',v_row.status,'syncedAt',v_row.synced_at);
end;$$;
revoke all on function public.demo_auth_office_mirror(jsonb) from public;
grant execute on function public.demo_auth_office_mirror(jsonb) to anon,authenticated;

-- One row per beneficiary allocation, making payer/beneficiary and consent visible
-- to officer queries without parsing nested JSON by hand.
create or replace view demo_payment.authorized_allocation_audit with (security_invoker=true) as
select p.id as payment_id,p.created_at,p.status as payment_status,
 p.data->'details'->>'payerId' as payer_id,
 line.value->>'beneficiary' as beneficiary_id,
 line.value->>'authorizationId' as authorization_id,
 line.value->>'category' as payment_category,
 line.value->>'assessmentYear' as assessment_year,
 (line.value->>'amountMinor')::bigint as amount_minor
from demo_payment.story_payments p
cross join lateral jsonb_array_elements(
 case when jsonb_typeof(p.data->'details'->'lines')='array'
   then p.data->'details'->'lines' else '[]'::jsonb end
) line
where p.data->'details'->>'payerId' ~ '^user([1-9]|10)$';
revoke all on demo_payment.authorized_allocation_audit from public,anon,authenticated;
