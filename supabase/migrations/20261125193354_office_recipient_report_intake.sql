-- Preserve the live V2 payment-linked intake and accept only the existing fictional User1 reference catalog without a payment parent.
begin;
create or replace function public.payment_v1_internal_ingest_demo_correction(p_event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_event uuid; v_parent uuid; v_allocation text; v_payload jsonb; v_payment jsonb; v_result jsonb; v_year text; v_recipient_event text; v_ordinal integer; v_item jsonb;
begin
 if p_event->>'sourceProject' is distinct from 'v2' or p_event->>'simulationOnly' is distinct from 'true'
    or p_event->>'eventType' is distinct from 'CORRECTION_SUBMITTED' then
   raise exception 'INVALID_DEMO_CORRECTION_SOURCE';
 end if;
 v_id:=(p_event->>'requestId')::uuid;v_event:=(p_event->>'eventId')::uuid;
 v_payload:=p_event->'payload';
 -- The original User1 storybook references have no payment or receipt row.
 -- They enter the same evidence-pending review queue, without financial linkage.
 if v_payload->>'historicalScenario'='USER1_REFERENCE_ONLY' then
   if v_id is null or v_event is null or v_payload ? 'originalPaymentId'
      or v_payload ? 'originalPaymentKind' or v_payload ? 'targetAllocationId'
      or v_payload->>'caseKind' is distinct from 'CORRECTION_REVIEW'
      or jsonb_typeof(v_payload->'correctionChanges') is distinct from 'object' then
     raise exception 'INVALID_DEMO_HISTORICAL_SOURCE';
   end if;
   select c.ay into v_year from (values ('DEMO-ETDS-SAL-01','2025-2026'),
       ('DEMO-AIT-01','2025-2026'),
       ('DEMO-ETDS-BANK-02','2025-2026'),
       ('DEMO-AIT-02','2025-2026'),
       ('DEMO-ETDS-PRO-03','2025-2026'),
       ('DEMO-TRAVEL-01','2025-2026'),
       ('DEMO-PAY-01','2025-2026'),
       ('DEMO-PAY-02','2025-2026'),
       ('DEMO-ETDS-24-01','2024-2025'),
       ('DEMO-AIT-24-01','2024-2025'),
       ('DEMO-PAY-24-01','2024-2025'),
       ('DEMO-PAY-24-02','2024-2025'),
       ('DEMO-ETDS-23-01','2023-2024'),
       ('DEMO-AIT-23-01','2023-2024'),
       ('DEMO-PAY-23-01','2023-2024')) c(ref,ay)
      where c.ref=v_payload->>'originalReference';
   if v_year is null or v_payload#>>'{correctionChanges,currentAY}' is distinct from v_year
      or coalesce(v_payload#>>'{correctionChanges,currentCircle}','')<>''
      or coalesce(v_payload#>>'{correctionChanges,currentHeadCode}','')<>''
      or v_payload#>>'{correctionChanges,allocationIndex}' is not null then
     raise exception 'INVALID_DEMO_HISTORICAL_SOURCE';
   end if;
 else
 v_parent:=(v_payload->>'originalPaymentId')::uuid;
 v_allocation:=v_payload->>'targetAllocationId';
 if v_id is null or v_event is null or v_parent is null
    or v_payload->>'originalPaymentKind' is distinct from 'TAXPAY_STORY_PAYMENT'
    or (v_payload->>'caseKind' is distinct from 'CORRECTION_REVIEW' and v_payload->>'caseKind' is distinct from 'UNSOLICITED_PAYMENT_REPORT')
    or (v_payload->>'caseKind'='CORRECTION_REVIEW' and jsonb_typeof(v_payload->'correctionChanges') is distinct from 'object')
    or (v_payload->>'caseKind'='UNSOLICITED_PAYMENT_REPORT' and
         (coalesce(jsonb_typeof(v_payload->'correctionChanges'),'null')<>'null' or v_payload->>'changeKind' is not null or v_payload->>'oldValue' is not null or v_payload->>'newValue' is not null)) then
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
 if v_payload->>'caseKind'='UNSOLICITED_PAYMENT_REPORT' then
   v_recipient_event:=v_payload->>'recipientEventId';
   if v_recipient_event is null or v_recipient_event !~ ('^'||v_parent::text||':(allocation|legacy):[1-9][0-9]{0,8}$') then
     raise exception 'DEMO_REPORT_RECIPIENT_EVENT_MISMATCH';
   end if;
   v_ordinal:=split_part(v_recipient_event,':',3)::integer-1;
   if split_part(v_recipient_event,':',2)='allocation' then
     v_item:=(v_payment#>'{details,allocations}')->v_ordinal;
     if jsonb_typeof(v_item) is distinct from 'object' or v_item->>'allocationId' is distinct from v_allocation then raise exception 'DEMO_CORRECTION_ALLOCATION_MISMATCH'; end if;
   else
     v_item:=(v_payment#>'{details,lines}')->v_ordinal;
     if jsonb_typeof(v_item) is distinct from 'object' or v_allocation is not null or jsonb_typeof(v_payment#>'{details,allocations}')='array' then raise exception 'DEMO_CORRECTION_ALLOCATION_MISMATCH'; end if;
   end if;
 end if;
 if v_allocation is not null and (
   select count(*) from jsonb_array_elements(case
     when jsonb_typeof(v_payment#>'{details,allocations}')='array'
       then v_payment#>'{details,allocations}'
     else '[]'::jsonb end) a where a->>'allocationId'=v_allocation
 )<>1 then raise exception 'DEMO_CORRECTION_ALLOCATION_MISMATCH'; end if;
 end if;
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

commit;
