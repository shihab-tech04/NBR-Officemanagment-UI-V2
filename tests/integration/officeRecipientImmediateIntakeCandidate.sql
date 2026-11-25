-- Disposable fixture only: mirror V2 exact source, preserve existing Office
-- roles/queue and route only V2 officer commands to the V2 source.
begin;
insert into payment_sync.officer_roles(user_uid,role,active)
values('80000000-0000-4000-8000-000000000012','REVIEWER',true)
on conflict(user_uid) do update set role=excluded.role,active=true;
insert into demo_payment.story_payments(id,session_id,service_code,amount_minor,data,status,created_at)
values('80000000-0000-4000-8000-000000000041','80000000-0000-4000-8000-000000000042','OTHER_TAX_PAYMENT',25000,
 '{"origin":"TAXPAY_UI","details":{"receiptReference":"SIM-V2-CORR-001","allocations":[{"allocationId":"allocation-v2-001"}]}}',
 'SIMULATED_SUCCESS',now());
create temp table v2_correction_fixture(id uuid primary key,event jsonb not null) on commit drop;
insert into v2_correction_fixture values('80000000-0000-4000-8000-000000000050',
 jsonb_build_object('schemaVersion','1.0.0','eventId','80000000-0000-4000-8000-000000000051',
 'requestId','80000000-0000-4000-8000-000000000050','origin','TAXPAY_SQL','sourceProject','v2',
 'simulationOnly',true,'eventType','CORRECTION_SUBMITTED','revision',1,
 'occurredAt','2026-11-24T06:00:00Z','payload',jsonb_build_object(
 'originalReference','SIM-V2-CORR-001','originalPaymentId','80000000-0000-4000-8000-000000000041',
 'originalPaymentKind','TAXPAY_STORY_PAYMENT','targetAllocationId','allocation-v2-001',
 'caseKind','UNSOLICITED_PAYMENT_REPORT','recipientEventId','80000000-0000-4000-8000-000000000041:allocation:1','reason','Unrecognized simulated payment allocation',
 'requestedOutcome','Review the reported simulated payment without modifying the original payment record.','evidenceState','PENDING_EVIDENCE',
 'claimantVerified',false,'originalReceiptVerified',false,'mayChangeFinancialRecords',false,
 'changeKind',null,'oldValue',null,'newValue',null,
 'correctionChanges',null,
 'createdAt','2026-11-24T06:00:00Z')));
do $$
declare event jsonb; result jsonb; invalid jsonb; pending jsonb; pending_id uuid:=gen_random_uuid(); pending_event uuid:=gen_random_uuid(); pending_payment uuid:=gen_random_uuid(); before_count bigint;
begin
 select f.event into event from v2_correction_fixture f;
 result:=public.payment_v1_internal_ingest_demo_correction(event);
 if result->>'stored' is distinct from 'true' or result->>'duplicate' is distinct from 'false' then
   raise exception 'V2 correction intake failed'; end if;
 result:=public.payment_v1_internal_ingest_demo_correction(event);
 if result->>'duplicate' is distinct from 'true' then raise exception 'V2 duplicate intake failed'; end if;
 if not exists(select 1 from payment_sync.correction_mirrors m join payment_sync.demo_correction_sources s on s.inquiry_id=m.inquiry_id
    where m.inquiry_id=(event->>'requestId')::uuid and m.inquiry_payload->'correctionChanges'=event#>'{payload,correctionChanges}'
      and m.source_payment_id=(event#>>'{payload,originalPaymentId}')::uuid and m.target_allocation_id='allocation-v2-001' and m.inquiry_payload->>'caseKind'='UNSOLICITED_PAYMENT_REPORT' and m.inquiry_payload->>'recipientEventId'=event#>>'{payload,recipientEventId}') then
   raise exception 'V2 allocation/parent/changes not preserved'; end if;
 invalid:=jsonb_set(jsonb_set(jsonb_set(event,'{eventId}',to_jsonb(gen_random_uuid())),'{requestId}',to_jsonb(gen_random_uuid())),
 '{payload,originalPaymentId}',to_jsonb(gen_random_uuid()));
 begin
   perform public.payment_v1_internal_ingest_demo_correction(invalid);
   raise exception 'MISSING_PARENT_ACCEPTED';
 exception when others then if sqlerrm<>'DEMO_CORRECTION_PAYMENT_MIRROR_PENDING' then raise; end if; end;
 invalid:=jsonb_set(jsonb_set(jsonb_set(event,'{eventId}',to_jsonb(gen_random_uuid())),'{requestId}',to_jsonb(gen_random_uuid())),
 '{payload,targetAllocationId}',to_jsonb('not-this-allocation'::text));
 begin
   perform public.payment_v1_internal_ingest_demo_correction(invalid);
   raise exception 'WRONG_ALLOCATION_ACCEPTED';
 exception when others then if sqlerrm<>'DEMO_CORRECTION_ALLOCATION_MISMATCH' then raise; end if; end;
 invalid:=jsonb_set(jsonb_set(jsonb_set(event,'{eventId}',to_jsonb(gen_random_uuid())),'{requestId}',to_jsonb(gen_random_uuid())),
 '{payload,recipientEventId}',to_jsonb('80000000-0000-4000-8000-000000000041:allocation:2'::text));
 begin
   perform public.payment_v1_internal_ingest_demo_correction(invalid);
   raise exception 'WRONG_EVENT_ACCEPTED';
 exception when others then if sqlerrm<>'DEMO_CORRECTION_ALLOCATION_MISMATCH' then raise; end if; end;
 -- Attested initiation: intake must not depend on a completed ledger row.
 select count(*) into before_count from demo_payment.story_payments;
 pending:=jsonb_set(jsonb_set(event,'{eventId}',to_jsonb(pending_event)),'{requestId}',to_jsonb(pending_id));
 pending:=jsonb_set(jsonb_set(pending,'{payload,originalPaymentId}',to_jsonb(pending_payment)),'{payload,recipientEventId}',to_jsonb(pending_payment::text||':allocation:1'));
 pending:=jsonb_set(pending,'{payload,recipientInitiation}',jsonb_build_object(
   'paymentId',pending_payment,'eventId',pending_payment::text||':allocation:1',
   'allocationId','allocation-v2-001','originalReference','SIM-V2-CORR-001',
   'state','SIMULATED_INITIATED','initiatedAt','2026-11-24T06:00:00Z'));
 result:=public.payment_v1_internal_ingest_demo_correction(pending);
 if result->>'stored' is distinct from 'true' or result->>'duplicate' is distinct from 'false'
 or not exists(select 1 from payment_sync.correction_mirrors where inquiry_id=pending_id and source_payment_id=pending_payment
   and inquiry_payload->'recipientInitiation'=pending#>'{payload,recipientInitiation}')
 or exists(select 1 from demo_payment.story_payments where id=pending_payment)
 or (select count(*) from demo_payment.story_payments)<>before_count then
   raise exception 'INITIATED_REPORT_NOT_ACKNOWLEDGED_WITHOUT_PAYMENT'; end if;
 result:=public.payment_v1_internal_ingest_demo_correction(pending);
 if result->>'duplicate' is distinct from 'true' then raise exception 'INITIATED_REPORT_REPLAY_FAILED'; end if;
 invalid:=jsonb_set(jsonb_set(jsonb_set(pending,'{eventId}',to_jsonb(gen_random_uuid())),'{requestId}',to_jsonb(gen_random_uuid())),
   '{payload,recipientInitiation,allocationId}',to_jsonb('wrong-allocation'::text));
 begin
   perform public.payment_v1_internal_ingest_demo_correction(invalid);
   raise exception 'INITIATION_MISMATCH_ACCEPTED';
 exception when others then if sqlerrm<>'DEMO_REPORT_INITIATION_MISMATCH' then raise; end if; end;
 -- An eventual actual completed mirror is compatible with the unchanged event.
 insert into demo_payment.story_payments(id,session_id,service_code,amount_minor,data,status,created_at)
 values(pending_payment,gen_random_uuid(),'OTHER_TAX_PAYMENT',25000,
 '{"origin":"TAXPAY_UI","details":{"receiptReference":"SIM-V2-CORR-001","allocations":[{"allocationId":"allocation-v2-001"}]}}','SIMULATED_SUCCESS',now());
 result:=public.payment_v1_internal_ingest_demo_correction(pending);
 if result->>'duplicate' is distinct from 'true' then raise exception 'INITIATED_REPORT_COMPLETION_REPLAY_FAILED'; end if;
 if has_function_privilege('anon','public.payment_v1_internal_ingest_demo_correction(jsonb)','EXECUTE')
 or has_function_privilege('authenticated','public.payment_v1_internal_ingest_demo_correction(jsonb)','EXECUTE')
 or has_function_privilege('anon','public.payment_v1_demo_correction_key()','EXECUTE')
 or has_function_privilege('authenticated','public.payment_v1_demo_correction_key()','EXECUTE')
 or has_function_privilege('anon','public.payment_v1_demo_correction_route(uuid)','EXECUTE')
 or has_function_privilege('authenticated','public.payment_v1_demo_correction_route(uuid)','EXECUTE')
 then raise exception 'Dedicated route is exposed publicly'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000011',true);
do $$
declare q jsonb; a jsonb;
begin
 q:=public.payment_v1_correction_queue_page(100,null,null);
 if not exists(select 1 from jsonb_array_elements(q->'items') i where i->>'requestId'='80000000-0000-4000-8000-000000000050'
 and i->>'sourcePaymentId'='80000000-0000-4000-8000-000000000041' and i->'availableActions' ? 'MAKER_ACKNOWLEDGE')
 then raise exception 'V2 case not available in existing Office queue'; end if;
 a:=public.payment_v1_correction_officer_action('80000000-0000-4000-8000-000000000050','MAKER_ACKNOWLEDGE','Received the correction request',gen_random_uuid());
 if a->>'queued' is distinct from 'true' then raise exception 'V2 maker action not queued'; end if;
end $$;
reset role;
do $$
declare c uuid:=gen_random_uuid(); m uuid;
begin
 update payment_sync.control_outbox set delivery_state='IN_FLIGHT',claim_token=c
 where request_id='80000000-0000-4000-8000-000000000050'
 and public.payment_v1_demo_correction_route(request_id)='v2'
 returning message_id into m;
 if m is null then raise exception 'V2 maker command was not routed'; end if;
 if not public.payment_v1_internal_ack_correction_command(m,c,true,'MAKER_ACKNOWLEDGED',null)
 then raise exception 'V2 Office command ACK failed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000012',true);
select public.payment_v1_correction_officer_action('80000000-0000-4000-8000-000000000050','REVIEWER_VERIFY','Reviewed the selected allocation',gen_random_uuid());
reset role;
do $$
declare c uuid:=gen_random_uuid(); m uuid;
begin
 update payment_sync.control_outbox set delivery_state='IN_FLIGHT',claim_token=c
 where request_id='80000000-0000-4000-8000-000000000050' and delivery_state='PENDING'
 and public.payment_v1_demo_correction_route(request_id)='v2' returning message_id into m;
 if m is null or not public.payment_v1_internal_ack_correction_command(m,c,true,'REVIEWER_VERIFIED',null)
 then raise exception 'V2 reviewer route failed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','80000000-0000-4000-8000-000000000013',true);
select public.payment_v1_correction_officer_action('80000000-0000-4000-8000-000000000050','APPROVER_CLOSE','Completed the simulated review',gen_random_uuid());
reset role;
do $$
declare c uuid:=gen_random_uuid(); m uuid;
begin
 update payment_sync.control_outbox set delivery_state='IN_FLIGHT',claim_token=c
 where request_id='80000000-0000-4000-8000-000000000050' and delivery_state='PENDING'
 and public.payment_v1_demo_correction_route(request_id)='v2' returning message_id into m;
 if m is null or not public.payment_v1_internal_ack_correction_command(m,c,true,'APPROVER_CLOSED',null)
 then raise exception 'V2 approver route failed'; end if;
 if (select review_state from payment_sync.correction_mirrors where inquiry_id='80000000-0000-4000-8000-000000000050')<>'APPROVER_CLOSED'
 then raise exception 'V2 Office decision did not complete'; end if;
 if (select amount_minor from demo_payment.story_payments where id='80000000-0000-4000-8000-000000000041')<>25000
 then raise exception 'Correction altered the source payment'; end if;
 raise notice 'PASS: distinct recipient report intake, exact event and allocation, replay, existing Office decisions, immutable payment and dedicated routing';
end $$;
rollback;
