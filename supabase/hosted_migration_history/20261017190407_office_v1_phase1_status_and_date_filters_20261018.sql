-- Make status filtering use the route's configured status field; reject bad dates.
create or replace function public.office_v1_handoff_query(
 p_route text,p_page integer default 1,p_per_page integer default 20,
 p_filters jsonb default '{}'::jsonb
) returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_kind text;v_filter jsonb:=coalesce(p_filters,'{}'::jsonb);
 v_total bigint;v_data jsonb;v_single jsonb;v_status_field text;
 v_date_text text;
begin
 if p_route is null or p_page is null or p_page not between 1 and 100000
    or p_per_page is null or p_per_page not between 1 and 100
    or jsonb_typeof(v_filter) is distinct from 'object'
    or length(v_filter::text)>4000 then
   raise exception 'INVALID_QUERY_PARAMETERS';
 end if;
 if exists(select 1 from jsonb_object_keys(v_filter) k(key)
    where k.key not in ('search','tin','caseType','circle','zone',
      'assessmentYear','status','fromDate','toDate'))
    or exists(select 1 from jsonb_each_text(v_filter) as f(key,value)
      where length(f.value)>100) then
    raise exception 'INVALID_QUERY_FILTER';
 end if;
 for v_date_text in select unnest(array[v_filter->>'fromDate',v_filter->>'toDate']) loop
   if coalesce(v_date_text,'')<>'' then
     if v_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
       raise exception 'INVALID_DATE_FILTER';
     end if;
     begin
       perform v_date_text::date;
     exception when invalid_datetime_format or datetime_field_overflow then
       raise exception 'INVALID_DATE_FILTER';
     end;
   end if;
 end loop;
 select response_kind into v_kind from office_backend.route_contracts
   where route_key=p_route;
 if v_kind is null then raise exception 'UNKNOWN_OFFICE_ROUTE'; end if;
 if v_kind='object' then
   select payload into v_single from office_backend.handoff_sample_records
     where route_key=p_route and sample_id='SAMPLE-001';
   return jsonb_build_object('success',true,'data',v_single,'origin','SYNTHETIC_HANDOFF');
 end if;
 select field_name into v_status_field from office_backend.handoff_status_contracts
   where route_key=p_route;
 with filtered as (
   select r.payload,r.sample_id,r.recorded_at
   from office_backend.handoff_sample_records r
   where r.route_key=p_route
     and (coalesce(v_filter->>'search','')='' or
          r.payload::text ilike '%'||(v_filter->>'search')||'%')
     and (coalesce(v_filter->>'tin','')='' or r.payload->>'tin'=v_filter->>'tin')
     and (coalesce(v_filter->>'caseType','')='' or r.payload->>'caseType'=v_filter->>'caseType')
     and (coalesce(v_filter->>'circle','')='' or r.payload->>'circle'=v_filter->>'circle')
     and (coalesce(v_filter->>'zone','')='' or r.payload->>'zone'=v_filter->>'zone')
     and (coalesce(v_filter->>'assessmentYear','')='' or
       r.payload->>'assessmentYear'=v_filter->>'assessmentYear')
     and (coalesce(v_filter->>'status','')='' or
       coalesce(r.payload->>v_status_field,r.payload->>'status',
         r.payload->>'approvalStatus',r.payload->>'caseStatus',
         r.payload->>'paymentStatus',r.payload->>'auditStatus')=v_filter->>'status')
     and (coalesce(v_filter->>'fromDate','')='' or
       r.recorded_at::date>=(v_filter->>'fromDate')::date)
     and (coalesce(v_filter->>'toDate','')='' or
       r.recorded_at::date<=(v_filter->>'toDate')::date)
 ), c as (select count(*) as total from filtered), paged as (
   select * from filtered order by recorded_at desc,sample_id
   limit p_per_page offset (p_page-1)*p_per_page
 )
 select c.total,coalesce((select jsonb_agg(p.payload order by p.recorded_at desc,p.sample_id)
   from paged p),'[]'::jsonb) into v_total,v_data from c;
 return jsonb_build_object('success',true,'data',v_data,
   'total',v_total,'page',p_page,'perPage',p_per_page,'origin','SYNTHETIC_HANDOFF');
end;
$function$;
revoke all on function public.office_v1_handoff_query(text,integer,integer,jsonb)
 from public,anon,authenticated;
grant execute on function public.office_v1_handoff_query(text,integer,integer,jsonb)
 to anon,authenticated;
