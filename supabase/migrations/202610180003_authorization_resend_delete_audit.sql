-- Code-free mirror of synthetic TaxPay authorization resends and cancellations.
alter table demo_payment.authorization_audit
  add column if not exists code_resends smallint not null default 0
    check (code_resends between 0 and 3),
  add column if not exists code_sent_at timestamptz;

alter table demo_payment.authorization_audit
  drop constraint if exists authorization_audit_status_check;
alter table demo_payment.authorization_audit
  add constraint authorization_audit_status_check
    check (status in ('PENDING','CODE_ISSUED','ACTIVE','DENIED','REVOKED','EXPIRED','CANCELLED'));

create or replace function public.demo_auth_office_mirror(p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_row demo_payment.authorization_audit%rowtype; v_resends int;
begin
 v_resends:=coalesce((p_input->>'codeResends')::int,0);
 if coalesce(p_input->>'id','') !~ '^[0-9a-fA-F-]{36}$'
   or coalesce(p_input->>'payerId','') !~ '^user([1-9]|10)$'
   or coalesce(p_input->>'taxpayerId','') !~ '^user([1-9]|10)$'
   or coalesce(p_input->>'status','') not in ('PENDING','CODE_ISSUED','ACTIVE','DENIED','REVOKED','EXPIRED','CANCELLED')
   or v_resends not between 0 and 3
   then raise exception 'INVALID_AUTHORIZATION_SNAPSHOT';end if;
 v_id:=(p_input->>'id')::uuid;
 insert into demo_payment.authorization_audit
  (id,payer_id,taxpayer_id,status,requested_at,confirmed_at,revoked_at,code_resends,code_sent_at)
 values(v_id,p_input->>'payerId',p_input->>'taxpayerId',p_input->>'status',
   (p_input->>'requestedAt')::timestamptz,
   nullif(p_input->>'confirmedAt','')::timestamptz,
   nullif(p_input->>'revokedAt','')::timestamptz,
   v_resends,nullif(p_input->>'codeSentAt','')::timestamptz)
 on conflict(id) do update set status=excluded.status,confirmed_at=excluded.confirmed_at,
   revoked_at=excluded.revoked_at,code_resends=excluded.code_resends,
   code_sent_at=excluded.code_sent_at,synced_at=now()
 returning * into v_row;
 return jsonb_build_object('id',v_row.id,'status',v_row.status,
   'codeResends',v_row.code_resends,'syncedAt',v_row.synced_at);
end;$$;
revoke all on function public.demo_auth_office_mirror(jsonb) from public;
grant execute on function public.demo_auth_office_mirror(jsonb) to anon,authenticated;
