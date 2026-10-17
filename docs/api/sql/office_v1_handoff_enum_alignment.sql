-- Align all synthetic-only Office sample enum values with TS union types.
-- This does not alter any authoritative-source records.
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
update office_backend.handoff_sample_records r
set payload=office_backend.handoff_sample_payload(r.route_key,
  substring(r.sample_id from 8)::integer);
