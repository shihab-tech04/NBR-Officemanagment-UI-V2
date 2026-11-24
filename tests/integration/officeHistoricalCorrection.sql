begin;
do $$
declare e jsonb; r jsonb;
begin
 e:=jsonb_build_object('schemaVersion','1.0.0','eventType','CORRECTION_SUBMITTED','origin','TAXPAY_SQL',
 'sourceProject','v2','simulationOnly',true,'eventId',gen_random_uuid(),'requestId',gen_random_uuid(),
 'revision',1,'occurredAt','2026-11-24T05:00:00Z','payload',jsonb_build_object(
 'originalReference','DEMO-PAY-23-01','historicalScenario','USER1_REFERENCE_ONLY',
 'caseKind','CORRECTION_REVIEW','reason','Historical year requires review',
 'requestedOutcome','Review simulated historical assessment year 2023-2024 to 2024-2025',
 'evidenceState','PENDING_EVIDENCE','claimantVerified',false,'originalReceiptVerified',false,
 'mayChangeFinancialRecords',false,'changeKind',null,'oldValue',null,'newValue',null,
 'correctionChanges',jsonb_build_object('currentAY','2023-2024','proposedAY','2024-2025','currentCircle','','currentHeadCode','','allocationIndex',null),
 'createdAt','2026-11-24T05:00:00Z'));
 r:=public.payment_v1_internal_ingest_demo_correction(e);
 if r->>'stored' is distinct from 'true' or not exists(
 select 1 from payment_sync.correction_mirrors m where m.inquiry_id=(e->>'requestId')::uuid
 and m.source_payment_id is null and m.source_payment_kind is null and m.target_allocation_id is null
 and m.inquiry_payload->>'historicalScenario'='USER1_REFERENCE_ONLY'
 and public.payment_v1_demo_correction_route(m.inquiry_id)='v2') then raise exception 'Historical correction did not preserve reference-only status'; end if;
 r:=public.payment_v1_internal_ingest_demo_correction(e);
 if r->>'duplicate' is distinct from 'true' then raise exception 'Historical retry duplicated case'; end if;
 begin
 perform public.payment_v1_internal_ingest_demo_correction(jsonb_set(e,'{payload,originalReference}','"DEMO-UNKNOWN"'));
 raise exception 'UNLISTED_REFERENCE_ACCEPTED';
 exception when others then if sqlerrm<>'INVALID_DEMO_HISTORICAL_SOURCE' then raise; end if; end;
 begin
 perform public.payment_v1_internal_ingest_demo_correction(jsonb_set(e,'{payload,originalPaymentId}',to_jsonb(gen_random_uuid())));
 raise exception 'FAKE_PAYMENT_ACCEPTED';
 exception when others then if sqlerrm<>'INVALID_DEMO_HISTORICAL_SOURCE' then raise; end if; end;
 raise notice 'PASS: historical reference-only correction, source allowlist, replay and no fabricated payment';
end $$;
rollback;
