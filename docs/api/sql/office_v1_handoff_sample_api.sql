-- NBR Office Management: deliberately synthetic UI-handoff read data.
-- Never inserted into, or accepted as, authoritative Office source records.
-- The existing office_v1_query() and officer role security are unchanged.

create table if not exists office_backend.handoff_sample_records (
  route_key text not null references office_backend.route_contracts(route_key),
  sample_id text not null,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  recorded_at timestamptz not null,
  origin text not null default 'SYNTHETIC_HANDOFF' check (origin='SYNTHETIC_HANDOFF'),
  primary key (route_key,sample_id)
);
create index if not exists office_handoff_sample_date_idx
 on office_backend.handoff_sample_records(route_key, recorded_at desc, sample_id);
alter table office_backend.handoff_sample_records enable row level security;
revoke all on office_backend.handoff_sample_records from public,anon,authenticated;

-- Reproducible typed test values. This deliberately uses fictional names and
-- reference numbers and is independent of real taxpayer and government data.
create or replace function office_backend.handoff_sample_payload(
 p_route text,p_ordinal integer
) returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare
 v_result jsonb;
 v_year text := '2026-27';
 v_amount text := '৳'||(p_ordinal*1250)::text;
 v_state text := case p_ordinal % 3 when 1 then 'Pending'
   when 2 then 'Approved' else 'Rejected' end;
begin
 if p_ordinal not between 1 and 100 then raise exception 'INVALID_SAMPLE_ORDINAL'; end if;
 select jsonb_object_agg(field.key,
   case when field.value='number' then to_jsonb(
     case when field.key='id' then p_ordinal
       when field.key like '%Today' then p_ordinal+2
       else p_ordinal*10 end)
   else to_jsonb(
     case
       when field.key='id' then p_ordinal::text
       when field.key='tin' then 'DEMO-TIN-'||lpad(p_ordinal::text,3,'0')
       when field.key='taxpayerName' then 'Sample Taxpayer '||lpad(p_ordinal::text,2,'0')
       when field.key='userName' then 'Sample Officer '||p_ordinal
       when field.key='circle' then 'circle-'||((p_ordinal-1)%10+1)
       when field.key='zone' then 'zone-'||((p_ordinal-1)%4+1)
       when field.key in ('assessmentYear','ayForAudit') then v_year
       when field.key='caseType' then
         case p_ordinal % 4 when 1 then 'income-tax' when 2 then 'appeal'
           when 3 then 'tribunal' else 'penalty' end
       when field.key='returnType' then 'Normal'
       when field.key='matchStatus' then
         case p_ordinal % 3 when 1 then 'Matched' when 2 then 'Pending'
           else 'Mismatched' end
       when field.key='verifStatus' then
         case p_ordinal % 3 when 1 then 'Verified' when 2 then 'Pending'
           else 'Failed' end
       when field.key='dormantStatus' then 'Dormant'
       when field.key='tribunalStatus' then
         case p_ordinal % 3 when 1 then 'Pending' when 2 then 'Decided'
           else 'Adjourned' end
       when field.key='paymentStatus' then
         case p_ordinal % 3 when 1 then 'Paid' when 2 then 'Unpaid'
           else 'Partially Paid' end
       when field.key='disposalStatus' then 'Disposed'
       when field.key='activeStatus' then
         case p_ordinal % 3 when 1 then 'Active' when 2 then 'Inactive'
           else 'Suspended' end
       when field.key='auditStatus' then
         case p_ordinal % 4 when 1 then 'Selected' when 2 then 'In Progress'
           when 3 then 'Completed' else 'Cancelled' end
       when field.key in ('status','approvalStatus','caseStatus','paymentStatus',
         'activeStatus','auditStatus','refundStatus','editStatus','appealStatus',
         'tribunalStatus','dormantStatus','matchStatus','verifStatus',
         'disposalStatus','submissionStatus') then v_state
       when field.key='email' then 'officer'||p_ordinal||'@example.invalid'
       when field.key='phone' then '00000000000'
       when field.key='bankName' then 'Sample Bank'
       when field.key='court' then 'Sample Tribunal'
       when field.key='certType' then 'Tax Clearance'
       when field.key='transactionDate' or field.key like '%Date'
         or field.key like '%At' or field.key like '%Deadline'
         or field.key in ('lastLogin','lastPassChange','lastReturn')
         then '2026-10-'||lpad(((p_ordinal-1)%20+1)::text,2,'0')
       when field.key in ('amount','taxAmount','taxPaid','taxTotal','outstanding',
         'balance','debit','credit','demandAmount','paidAmount','refundAmount',
         'revenue') then v_amount
       when field.key='fileSize' then '128 KB'
       when field.key='yearsDormant' then '2'
       when field.key='entryType' then
         case when p_ordinal%2=0 then 'Online' else 'Offline' end
       when field.key='disposalMethod' then
         case p_ordinal%3 when 1 then 'Handed Over' when 2 then 'Postal'
           else 'Digital' end
       when field.key='category' then 'Income Tax'
       else 'SAMPLE-'||upper(field.key)||'-'||lpad(p_ordinal::text,3,'0')
     end) end
 ) into v_result
 from office_backend.route_contracts c,
 lateral jsonb_each_text(c.field_types) as field(key,value)
 where c.route_key=p_route
 group by c.route_key;
 if v_result is null then raise exception 'UNKNOWN_OFFICE_ROUTE'; end if;
 perform office_backend.validate_payload(p_route,v_result);
 return v_result;
end;
$function$;
revoke all on function office_backend.handoff_sample_payload(text,integer)
 from public,anon,authenticated;

-- Add an independent, immutable source of representative data. Reapplying the
-- migration does not overwrite later test edits.
insert into office_backend.handoff_sample_records
 (route_key,sample_id,payload,recorded_at)
select c.route_key,'SAMPLE-'||lpad(i::text,3,'0'),
  office_backend.handoff_sample_payload(c.route_key,i),
  '2026-10-16T12:00:00Z'::timestamptz - (i||' hours')::interval
from office_backend.route_contracts c
cross join lateral generate_series(1,case when c.response_kind='object' then 1 else 12 end) as nums(i)
on conflict(route_key,sample_id) do nothing;

-- Public read access is exclusively to the fictional handoff schema and
-- always includes an explicit origin flag; no actual Office records leak.
create or replace function public.office_v1_handoff_query(
 p_route text,p_page integer default 1,p_per_page integer default 20,
 p_filters jsonb default '{}'::jsonb
) returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_kind text;v_filter jsonb:=coalesce(p_filters,'{}'::jsonb);
 v_total bigint;v_data jsonb;v_single jsonb;
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
 select response_kind into v_kind from office_backend.route_contracts
   where route_key=p_route;
 if v_kind is null then raise exception 'UNKNOWN_OFFICE_ROUTE'; end if;
 if v_kind='object' then
   select payload into v_single from office_backend.handoff_sample_records
     where route_key=p_route and sample_id='SAMPLE-001';
   return jsonb_build_object('success',true,'data',v_single,'origin','SYNTHETIC_HANDOFF');
 end if;
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
       coalesce(r.payload->>'status',r.payload->>'approvalStatus',
         r.payload->>'caseStatus',r.payload->>'paymentStatus',
         r.payload->>'auditStatus')=v_filter->>'status')
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
