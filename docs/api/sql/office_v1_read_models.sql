-- NBR Office Management: secure, source-gated backend for the 30 legacy read routes.
-- Zero synthetic rows: every accepted record must have a registered source and
-- source revision; browser users have no direct table privileges.

create schema if not exists office_backend;
revoke all on schema office_backend from public,anon,authenticated;

create table if not exists office_backend.route_contracts (
  route_key text primary key check (route_key ~ '^[a-z][a-z0-9_]{2,70}$'),
  route_path text not null unique,
  response_kind text not null check (response_kind in ('list','object')),
  field_types jsonb not null check (jsonb_typeof(field_types)='object'),
  created_at timestamptz not null default now()
);

create table if not exists office_backend.registered_sources (
  route_key text primary key references office_backend.route_contracts(route_key),
  source_system text not null check (length(source_system) between 8 and 250),
  attestation_reference text not null check (length(attestation_reference) between 8 and 500),
  connected boolean not null default false,
  connected_at timestamptz,
  last_ingested_at timestamptz
);

create table if not exists office_backend.records (
  route_key text not null references office_backend.route_contracts(route_key),
  source_record_id text not null check (length(source_record_id) between 1 and 160),
  source_revision integer not null check (source_revision>=1),
  source_recorded_at timestamptz not null,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  imported_at timestamptz not null default now(),
  primary key(route_key,source_record_id)
);
create index if not exists office_records_recorded_idx
  on office_backend.records(route_key,source_recorded_at desc,source_record_id);
create index if not exists office_records_payload_idx
  on office_backend.records using gin(payload jsonb_path_ops);

alter table office_backend.route_contracts enable row level security;
alter table office_backend.registered_sources enable row level security;
alter table office_backend.records enable row level security;
revoke all on office_backend.route_contracts from public,anon,authenticated;
revoke all on office_backend.registered_sources from public,anon,authenticated;
revoke all on office_backend.records from public,anon,authenticated;

create or replace function office_backend.assert_officer()
returns uuid language plpgsql stable security definer set search_path to '' as $function$
declare v_actor uuid := auth.uid(); v_origin text;
begin
  select origin into v_origin from payment_sync.settings where singleton;
  if v_actor is null or v_origin<>'OFFICE_SQL' or not exists(
    select 1 from payment_sync.officer_roles r
    where r.user_uid=v_actor and r.active and r.role in ('MAKER','REVIEWER','APPROVER')) then
    raise exception 'OFFICE_ROLE_REQUIRED';
  end if;
  return v_actor;
end;
$function$;

create or replace function office_backend.validate_payload(
  p_route text,p_data jsonb
) returns boolean language plpgsql stable security definer set search_path to '' as $function$
declare v_types jsonb; v_key text; v_expected text; v_actual text;
  v_fields integer; v_supplied integer;
begin
  select field_types into v_types from office_backend.route_contracts
    where route_key=p_route;
  if v_types is null or jsonb_typeof(p_data) is distinct from 'object'
     or length(p_data::text)>100000 then
    raise exception 'INVALID_RECORD_SCHEMA'; end if;
  select count(*) into v_fields from jsonb_object_keys(v_types);
  select count(*) into v_supplied from jsonb_object_keys(p_data);
  if v_fields<>v_supplied then raise exception 'INVALID_RECORD_FIELD_COUNT'; end if;
  for v_key,v_expected in select key,value
    from jsonb_each_text(v_types) loop
    if not p_data ? v_key then raise exception 'MISSING_REQUIRED_FIELD: %',v_key; end if;
    v_actual := jsonb_typeof(p_data->v_key);
    if v_actual<>v_expected then raise exception 'INVALID_FIELD_TYPE: %',v_key; end if;
  end loop;
  return true;
end;
$function$;

-- Read API: role-gated; unknown and unconnected domains fail closed.
create or replace function public.office_v1_query(
  p_route text,p_page integer default 1,p_per_page integer default 20,
  p_filters jsonb default '{}'::jsonb
) returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare
  v_kind text; v_total bigint; v_rows jsonb; v_single jsonb;
  v_filter jsonb := coalesce(p_filters,'{}'::jsonb);
  v_status boolean;
begin
  perform office_backend.assert_officer();
  if p_route is null or p_page is null or p_per_page is null or p_page<1
     or p_page>100000 or p_per_page not between 1 and 100 or
     jsonb_typeof(v_filter) is distinct from 'object' or length(v_filter::text)>4000 then
    raise exception 'INVALID_QUERY_PARAMETERS'; end if;
  if length(coalesce(v_filter->>'search',''))>100 or
     length(coalesce(v_filter->>'tin',''))>20 or
     length(coalesce(v_filter->>'caseType',''))>60 then
    raise exception 'INVALID_QUERY_FILTER'; end if;
  if exists(select 1 from jsonb_object_keys(v_filter) f(key)
    where f.key not in ('search','circle','zone','assessmentYear','status',
      'fromDate','toDate','tin','caseType')) then
    raise exception 'UNKNOWN_QUERY_FILTER'; end if;
  select response_kind into v_kind from office_backend.route_contracts
    where route_key=p_route;
  if v_kind is null then raise exception 'UNKNOWN_OFFICE_ROUTE'; end if;
  select s.connected into strict v_status from office_backend.registered_sources s
    where s.route_key=p_route;
  if v_status is not true then raise exception 'OFFICE_SOURCE_NOT_CONNECTED'; end if;
  if v_kind='object' then
    select payload into v_single from office_backend.records
      where route_key=p_route and source_record_id='singleton';
    if v_single is null then raise exception 'OFFICE_SOURCE_EMPTY'; end if;
    return jsonb_build_object('success',true,'data',v_single);
  end if;
  with filtered as (
    select r.payload,r.source_record_id,r.source_recorded_at
    from office_backend.records r where r.route_key=p_route
      and (coalesce(v_filter->>'search','')='' or
        r.payload::text ilike '%'||(v_filter->>'search')||'%')
      and (coalesce(v_filter->>'circle','')='' or
        r.payload->>'circle'=v_filter->>'circle')
      and (coalesce(v_filter->>'zone','')='' or
        r.payload->>'zone'=v_filter->>'zone')
      and (coalesce(v_filter->>'assessmentYear','')='' or
        r.payload->>'assessmentYear'=v_filter->>'assessmentYear')
      and (coalesce(v_filter->>'tin','')='' or
        r.payload->>'tin'=v_filter->>'tin')
      and (coalesce(v_filter->>'caseType','')='' or
        r.payload->>'caseType'=v_filter->>'caseType')
      and (coalesce(v_filter->>'status','')='' or
        coalesce(r.payload->>'status',r.payload->>'approvalStatus',
          r.payload->>'caseStatus',r.payload->>'paymentStatus',
          r.payload->>'activeStatus',r.payload->>'auditStatus')=v_filter->>'status')
      and (coalesce(v_filter->>'fromDate','')='' or
        r.source_recorded_at::date>=(v_filter->>'fromDate')::date)
      and (coalesce(v_filter->>'toDate','')='' or
        r.source_recorded_at::date<=(v_filter->>'toDate')::date)
  ), count_rows as (select count(*) cnt from filtered), window_rows as (
    select payload,source_recorded_at,source_record_id from filtered
    order by source_recorded_at desc,source_record_id
    limit p_per_page offset (p_page-1)*p_per_page
  )
  select c.cnt,coalesce((select jsonb_agg(w.payload order by
     w.source_recorded_at desc,w.source_record_id) from window_rows w),'[]'::jsonb)
  into v_total,v_rows from count_rows c;
  return jsonb_build_object('success',true,'data',v_rows,'total',v_total,
    'page',p_page,'perPage',p_per_page);
exception when no_data_found then
  raise exception 'OFFICE_SOURCE_NOT_CONNECTED';
end;
$function$;

-- Privileged operator connects only an identified upstream data source.
-- No source or records are configured by this migration.
create or replace function public.office_v1_internal_configure_source(
  p_route text,p_source_system text,p_attestation_reference text,p_connected boolean
) returns boolean language plpgsql security definer set search_path to '' as $function$
begin
  if p_route is null or p_connected is null or
     length(coalesce(p_source_system,'')) not between 8 and 250 or
     length(coalesce(p_attestation_reference,'')) not between 8 and 500 or
     not exists(select 1 from office_backend.route_contracts where route_key=p_route) then
    raise exception 'INVALID_SOURCE_REGISTRATION'; end if;
  insert into office_backend.registered_sources
    (route_key,source_system,attestation_reference,connected,connected_at)
  values(p_route,p_source_system,p_attestation_reference,p_connected,
    case when p_connected then now() else null end)
  on conflict(route_key) do update set
    source_system=excluded.source_system,
    attestation_reference=excluded.attestation_reference,
    connected=excluded.connected,connected_at=excluded.connected_at;
  return true;
end;
$function$;

-- Revision-monotonic import. Untrusted material cannot be silently made live;
-- this RPC is only available to the configured backend's service role.
create or replace function public.office_v1_internal_ingest(
  p_route text,p_rows jsonb
) returns jsonb language plpgsql security definer set search_path to '' as $function$
declare
  v_kind text; v_item jsonb; v_id text; v_revision integer;
  v_data jsonb; v_time timestamptz; v_changed integer := 0; v_inserted integer;
begin
  select c.response_kind into v_kind from office_backend.route_contracts c
    join office_backend.registered_sources s on s.route_key=c.route_key
    where c.route_key=p_route and s.connected;
  if v_kind is null then raise exception 'OFFICE_SOURCE_NOT_CONNECTED'; end if;
  if p_rows is null or jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) not between 1 and 200 or
     length(p_rows::text)>1000000 then raise exception 'INVALID_INGEST_BATCH'; end if;
  for v_item in select value from jsonb_array_elements(p_rows) loop
    v_id := v_item->>'sourceId';
    if length(coalesce(v_id,'')) not between 1 and 160 or
       (v_kind='object' and v_id<>'singleton') or
       coalesce(v_item->>'revision','') !~ '^[1-9][0-9]{0,8}$' or
       jsonb_typeof(v_item->'data') is distinct from 'object' or
       coalesce(v_item->>'recordedAt','') !~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T' then
      raise exception 'INVALID_SOURCE_RECORD'; end if;
    v_revision := (v_item->>'revision')::integer;
    v_time := (v_item->>'recordedAt')::timestamptz;
    v_data := v_item->'data';
    perform office_backend.validate_payload(p_route,v_data);
    insert into office_backend.records(route_key,source_record_id,source_revision,
      source_recorded_at,payload)
    values(p_route,v_id,v_revision,v_time,v_data)
    on conflict(route_key,source_record_id) do update set
      source_revision=excluded.source_revision,
      source_recorded_at=excluded.source_recorded_at,
      payload=excluded.payload,imported_at=now()
    where office_backend.records.source_revision<excluded.source_revision;
    get diagnostics v_inserted=row_count;
    v_changed := v_changed+v_inserted;
  end loop;
  update office_backend.registered_sources set last_ingested_at=now()
    where route_key=p_route;
  return jsonb_build_object('accepted',jsonb_array_length(p_rows),'changed',v_changed);
end;
$function$;

create or replace function public.office_v1_contract_status()
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_result jsonb;
begin
  perform office_backend.assert_officer();
  select coalesce(jsonb_agg(jsonb_build_object('route',c.route_path,'key',c.route_key,
    'kind',c.response_kind,'sourceConnected',coalesce(s.connected,false),
    'lastIngestedAt',s.last_ingested_at) order by c.route_path),'[]'::jsonb)
  into v_result from office_backend.route_contracts c
    left join office_backend.registered_sources s on s.route_key=c.route_key;
  return v_result;
end;
$function$;

revoke all on function public.office_v1_query(text,integer,integer,jsonb) from public,anon,authenticated;
revoke all on function public.office_v1_contract_status() from public,anon,authenticated;
grant execute on function public.office_v1_query(text,integer,integer,jsonb) to authenticated;
grant execute on function public.office_v1_contract_status() to authenticated;
revoke all on function public.office_v1_internal_configure_source(text,text,text,boolean)
  from public,anon,authenticated;
revoke all on function public.office_v1_internal_ingest(text,jsonb)
  from public,anon,authenticated;
grant execute on function public.office_v1_internal_configure_source(text,text,text,boolean)
  to service_role;
grant execute on function public.office_v1_internal_ingest(text,jsonb) to service_role;
revoke all on function office_backend.assert_officer() from public,anon,authenticated;
revoke all on function office_backend.validate_payload(text,jsonb)
  from public,anon,authenticated;
