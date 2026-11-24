-- Dedicated fictional Taxpayer-v2 correction lane. Preserve existing original
-- TaxPay/Office bridge settings, existing queue and three-officer review.
begin;
create table payment_sync.demo_correction_bridge_key(
 singleton boolean primary key default true check(singleton),
 signing_key text not null check(signing_key ~ '^[0-9a-f]{64}$')
);
alter table payment_sync.demo_correction_bridge_key enable row level security;
revoke all on payment_sync.demo_correction_bridge_key from public,anon,authenticated;
create function public.payment_v1_demo_correction_key()
returns text language sql stable security definer set search_path='' as $$
 select signing_key from payment_sync.demo_correction_bridge_key where singleton
$$;
revoke all on function public.payment_v1_demo_correction_key() from public,anon,authenticated;
grant execute on function public.payment_v1_demo_correction_key() to service_role;

create table payment_sync.demo_correction_sources(
 inquiry_id uuid primary key references payment_sync.correction_mirrors(inquiry_id),
 source_event_id uuid not null unique,
 source_project text not null check(source_project='v2')
);
alter table payment_sync.demo_correction_sources enable row level security;
revoke all on payment_sync.demo_correction_sources from public,anon,authenticated;

create function public.payment_v1_internal_ingest_demo_correction(p_event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_event uuid; v_parent uuid; v_allocation text; v_payload jsonb; v_payment jsonb; v_result jsonb;
begin
 if p_event->>'sourceProject' is distinct from 'v2' or p_event->>'simulationOnly' is distinct from 'true'
    or p_event->>'eventType' is distinct from 'CORRECTION_SUBMITTED' then
   raise exception 'INVALID_DEMO_CORRECTION_SOURCE';
 end if;
 v_id:=(p_event->>'requestId')::uuid;v_event:=(p_event->>'eventId')::uuid;
 v_payload:=p_event->'payload';
 v_parent:=(v_payload->>'originalPaymentId')::uuid;
 v_allocation:=v_payload->>'targetAllocationId';
 if v_id is null or v_event is null or v_parent is null
    or v_payload->>'originalPaymentKind' is distinct from 'TAXPAY_STORY_PAYMENT'
    or v_payload->>'caseKind' is distinct from 'CORRECTION_REVIEW'
    or jsonb_typeof(v_payload->'correctionChanges') is distinct from 'object' then
   raise exception 'INVALID_DEMO_CORRECTION_PARENT';
 end if;
 -- The parent must have reached the existing trusted simulation mirror.
 select data into v_payment from demo_payment.story_payments where id=v_parent
   and status='SIMULATED_SUCCESS' and data->>'origin'='TAXPAY_UI';
 if v_payment is null then raise exception 'DEMO_CORRECTION_PAYMENT_MIRROR_PENDING'; end if;
 if v_payload->>'originalReference' is distinct from v_payment#>>'{details,receiptSnapshot,challanNo}'
    and v_payload->>'originalReference' is distinct from v_payment#>>'{details,receiptReference}'
    and v_payload->>'originalReference' is distinct from v_parent::text then
   raise exception 'DEMO_CORRECTION_REFERENCE_MISMATCH';
 end if;
 if v_allocation is not null and (
   select count(*) from jsonb_array_elements(case
     when jsonb_typeof(v_payment#>'{details,allocations}')='array'
       then v_payment#>'{details,allocations}'
     else '[]'::jsonb end) a where a->>'allocationId'=v_allocation
 )<>1 then raise exception 'DEMO_CORRECTION_ALLOCATION_MISMATCH'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
 if exists(select 1 from payment_sync.correction_mirrors where inquiry_id=v_id)
    and not exists(select 1 from payment_sync.demo_correction_sources
      where inquiry_id=v_id and source_event_id=v_event and source_project='v2') then
   raise exception 'DEMO_CORRECTION_SOURCE_CONFLICT';
 end if;
 v_result:=public.payment_v1_internal_ingest_correction(p_event);
 if v_result->>'stored' is distinct from 'true' then raise exception 'DEMO_CORRECTION_NOT_STORED'; end if;
 insert into payment_sync.demo_correction_sources(inquiry_id,source_event_id,source_project)
 values(v_id,v_event,'v2') on conflict(inquiry_id) do nothing;
 return v_result;
end;
$$;
revoke all on function public.payment_v1_internal_ingest_demo_correction(jsonb) from public,anon,authenticated;
grant execute on function public.payment_v1_internal_ingest_demo_correction(jsonb) to service_role;

-- Keep the existing officer role and workflow RPC untouched. Only commands
-- produced for an authenticated dedicated-lane mirror receive a route marker.
create function payment_sync.route_demo_correction_command()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.payload->>'commandType'='CORRECTION_REVIEW' and
   exists(select 1 from payment_sync.demo_correction_sources where inquiry_id=new.request_id) then
   new.payload:=new.payload||jsonb_build_object('sourceProject','v2','simulationOnly',true);
 end if;
 return new;
end;
$$;
revoke all on function payment_sync.route_demo_correction_command() from public,anon,authenticated;
create trigger route_demo_correction_command before insert on payment_sync.control_outbox
 for each row execute function payment_sync.route_demo_correction_command();
commit;
