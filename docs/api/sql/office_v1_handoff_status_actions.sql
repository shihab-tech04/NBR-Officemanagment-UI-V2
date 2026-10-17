-- Optional synthetic Office row status edits for user-story walkthroughs.
-- Never updates authoritative Office data or protected payment reviews.
alter table office_backend.handoff_sample_records
 add column if not exists revision integer not null default 1
 check(revision>=1);

create table if not exists office_backend.handoff_status_contracts (
 route_key text primary key references office_backend.route_contracts(route_key),
 field_name text not null,
 allowed_values text[] not null
);
insert into office_backend.handoff_status_contracts
 (route_key,field_name,allowed_values)
values
 ('dashboard_psr_recent','approvalStatus',array['Pending','Approved','Rejected']),
 ('dashboard_submissions_recent','submissionStatus',array['Pending','Approved','Rejected','Verified']),
 ('returns_approvals','approvalStatus',array['Pending','Approved','Rejected']),
 ('returns_online','status',array['Pending','Approved','Rejected','Verified']),
 ('returns_offline','status',array['Pending','Approved','Rejected','Verified']),
 ('psr_approvals','approvalStatus',array['Pending','Approved','Rejected']),
 ('psr_edit_requests','approvalStatus',array['Pending','Approved','Rejected']),
 ('psr_double_entry_status','matchStatus',array['Matched','Pending','Mismatched']),
 ('psr_double_entry_verification','verifStatus',array['Verified','Pending','Failed']),
 ('litigation_cases','caseStatus',array['Pending','Approved','Rejected','Active']),
 ('appeals','appealStatus',array['Pending','Approved','Rejected','Under Review']),
 ('tribunal','tribunalStatus',array['Pending','Decided','Adjourned']),
 ('demand_payment_demands','paymentStatus',array['Paid','Unpaid','Partially Paid']),
 ('demand_payment_refunds','refundStatus',array['Pending','Approved','Rejected','Disbursed']),
 ('certificates_requests','approvalStatus',array['Pending','Approved','Rejected','Issued']),
 ('certificates_edit_requests','editStatus',array['Pending','Approved','Rejected']),
 ('admin_users','activeStatus',array['Active','Inactive','Suspended']),
 ('admin_special_registrations','activeStatus',array['Active','Inactive','Suspended']),
 ('admin_time_extensions','approvalStatus',array['Pending','Approved','Rejected']),
 ('admin_audit_selections','auditStatus',array['Selected','In Progress','Completed','Cancelled'])
on conflict(route_key) do update
set field_name=excluded.field_name,allowed_values=excluded.allowed_values;
alter table office_backend.handoff_status_contracts enable row level security;
revoke all on office_backend.handoff_status_contracts
 from public,anon,authenticated;

create table if not exists office_backend.handoff_status_events(
 event_id bigint generated always as identity primary key,
 route_key text not null,
 sample_id text not null,
 idempotency_key uuid not null unique,
 actor_code text not null,
 reason text not null,
 field_name text not null,
 previous_status text not null,
 next_status text not null,
 resulting_revision integer not null,
 occurred_at timestamptz not null default now(),
 foreign key (route_key,sample_id)
   references office_backend.handoff_sample_records(route_key,sample_id)
);
create index if not exists office_handoff_status_event_idx
 on office_backend.handoff_status_events(route_key,sample_id,occurred_at desc);
alter table office_backend.handoff_status_events enable row level security;
revoke all on office_backend.handoff_status_events from public,anon,authenticated;

create or replace function public.office_v1_handoff_set_status(
 p_route text,p_sample_id text,p_new_status text,p_actor_code text,
 p_reason text,p_idempotency_key uuid,p_expected_revision integer default null
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
 v_record office_backend.handoff_sample_records%rowtype;
 v_contract office_backend.handoff_status_contracts%rowtype;
 v_old office_backend.handoff_status_events%rowtype;
 v_old_status text;v_count integer;v_next jsonb;
begin
 if p_route is null or p_sample_id is null or
   p_sample_id !~ '^SAMPLE-[0-9]{3}$'
   or p_new_status is null or p_actor_code is null or
   p_actor_code !~ '^[A-Za-z0-9_-]{3,30}$'
   or length(btrim(coalesce(p_reason,''))) not between 5 and 500
   or p_idempotency_key is null
   or (p_expected_revision is not null and p_expected_revision<1) then
   raise exception 'INVALID_HANDOFF_STATUS_ACTION';
 end if;
 select * into v_contract from office_backend.handoff_status_contracts
   where route_key=p_route;
 if not found then raise exception 'STATUS_ACTION_NOT_SUPPORTED';end if;
 if not (p_new_status=any(v_contract.allowed_values)) then
   raise exception 'STATUS_NOT_IN_ROUTE_CONTRACT'; end if;
 select * into v_record from office_backend.handoff_sample_records
   where route_key=p_route and sample_id=p_sample_id for update;
 if not found then raise exception 'SAMPLE_RECORD_NOT_FOUND';end if;
 select * into v_old from office_backend.handoff_status_events
   where idempotency_key=p_idempotency_key;
 if found then
   if v_old.route_key=p_route and v_old.sample_id=p_sample_id and
      v_old.next_status=p_new_status and v_old.actor_code=p_actor_code and
      v_old.reason=p_reason then
     return jsonb_build_object('status',v_old.next_status,
       'revision',v_old.resulting_revision,'replayed',true,'simulationOnly',true);
   end if;
   raise exception 'IDEMPOTENCY_COLLISION';
 end if;
 if p_expected_revision is not null and p_expected_revision<>v_record.revision
   then raise exception 'REVISION_CONFLICT';end if;
 v_old_status:=v_record.payload->>v_contract.field_name;
 if v_old_status=p_new_status then raise exception 'STATUS_UNCHANGED';end if;
 select count(*) into v_count from office_backend.handoff_status_events
   where route_key=p_route and sample_id=p_sample_id;
 if v_count>=20 then raise exception 'SAMPLE_ACTION_LIMIT';end if;
 v_next:=jsonb_set(v_record.payload,array[v_contract.field_name],
    to_jsonb(p_new_status),false);
 perform office_backend.validate_payload(p_route,v_next);
 update office_backend.handoff_sample_records
   set payload=v_next,revision=revision+1
   where route_key=p_route and sample_id=p_sample_id;
 insert into office_backend.handoff_status_events
  (route_key,sample_id,idempotency_key,actor_code,reason,field_name,
   previous_status,next_status,resulting_revision)
 values(p_route,p_sample_id,p_idempotency_key,p_actor_code,p_reason,
    v_contract.field_name,v_old_status,p_new_status,v_record.revision+1);
 return jsonb_build_object('status',p_new_status,
   'revision',v_record.revision+1,'replayed',false,'simulationOnly',true);
end;
$function$;

create or replace function public.office_v1_handoff_status_history(
 p_route text,p_sample_id text,p_limit integer default 100
) returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_result jsonb;
begin
 if p_route is null or p_sample_id is null or
    p_sample_id !~ '^SAMPLE-[0-9]{3}$'
    or p_limit is null or p_limit not between 1 and 100 then
   raise exception 'INVALID_HANDOFF_HISTORY_QUERY';end if;
 if not exists(select 1 from office_backend.handoff_sample_records
    where route_key=p_route and sample_id=p_sample_id) then
    raise exception 'SAMPLE_RECORD_NOT_FOUND';end if;
 select coalesce(jsonb_agg(jsonb_build_object('actorCode',e.actor_code,
   'previousStatus',e.previous_status,'nextStatus',e.next_status,
   'reason',e.reason,'revision',e.resulting_revision,'at',e.occurred_at)
   order by e.occurred_at desc,e.event_id desc),'[]'::jsonb)
 into v_result from
 (select * from office_backend.handoff_status_events
  where route_key=p_route and sample_id=p_sample_id
  order by occurred_at desc,event_id desc limit p_limit) e;
 return v_result;
end;
$function$;

revoke all on function public.office_v1_handoff_set_status(
 text,text,text,text,text,uuid,integer) from public,anon,authenticated;
revoke all on function public.office_v1_handoff_status_history(
 text,text,integer) from public,anon,authenticated;
grant execute on function public.office_v1_handoff_set_status(
 text,text,text,text,text,uuid,integer) to anon,authenticated;
grant execute on function public.office_v1_handoff_status_history(
 text,text,integer) to anon,authenticated;
