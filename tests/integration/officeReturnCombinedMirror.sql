-- Execute against disposable PostgreSQL only. No records persist after ROLLBACK.
BEGIN;
DO $office_return_combined_test$
DECLARE
  v_fn text;
  v_input jsonb;
  v_replay jsonb;
  v_result jsonb;
  v_bad jsonb;
  v_denied boolean;
  v_other jsonb;
BEGIN
  v_fn := pg_get_functiondef('public.demo_story1_mirror(jsonb)'::regprocedure);
  IF position('''OTHER_TAX_PAYMENT'',''TAX_WITH_RETURN''' IN v_fn)=0 OR
     position('THEN 800000 ELSE 16000' IN v_fn)=0 THEN
    RAISE EXCEPTION 'OFFICE_RETURN_COMBINED_CONTRACT_MISSING';
  END IF;
  -- 30KB combined Return mirrors without splitting its SQL row / challan.
  v_input := jsonb_build_object(
    'id',gen_random_uuid(),'sessionId',gen_random_uuid(),
    'service','TAX_WITH_RETURN','amountMinor',5000,
    'status','SIMULATED_SUCCESS','createdAt',now(),
    'data',jsonb_build_object(
      'service','TAX_WITH_RETURN','amountMinor',5000,
      'details',jsonb_build_object(
        'combinedPayment',true,'allocationCount',2,
        'allocations',jsonb_build_array(
          jsonb_build_object('taxpayerTin','1111111111111','headId',125,'assessmentYear','2026-27','amountMinor',1500),
          jsonb_build_object('taxpayerTin','2222222222222','headId',125,'assessmentYear','2025-26','amountMinor',3500)),
        'syntheticPaddingForLimitTest',repeat('x',30000))));
  v_result := public.demo_story1_mirror(v_input);
  IF v_result->>'id' IS DISTINCT FROM v_input->>'id' OR v_result->>'mirrored'<>'true'
     OR (SELECT count(*) FROM demo_payment.story_payments
        WHERE id=(v_input->>'id')::uuid AND service_code='TAX_WITH_RETURN' AND amount_minor=5000)<>1
  THEN RAISE EXCEPTION 'RETURN_COMBINED_MIRROR_FAILED'; END IF;
  v_replay := public.demo_story1_mirror(v_input);
  IF v_replay->>'replayed'<>'true' OR
    (SELECT count(*) FROM demo_payment.story_payments WHERE id=(v_input->>'id')::uuid)<>1
  THEN RAISE EXCEPTION 'RETURN_MIRROR_IDEMPOTENCY_FAILED'; END IF;

  -- The previous Other Tax combined category remains supported at 30KB.
  v_other := jsonb_set(v_input,'{id}',to_jsonb(gen_random_uuid()::text));
  v_other := jsonb_set(v_other,'{service}',to_jsonb('OTHER_TAX_PAYMENT'::text));
  v_other := jsonb_set(v_other,'{data,service}',to_jsonb('OTHER_TAX_PAYMENT'::text));
  v_result := public.demo_story1_mirror(v_other);
  IF v_result->>'mirrored'<>'true' THEN RAISE EXCEPTION 'OTHER_COMBINED_MIRROR_REGRESSION'; END IF;

  -- An uncombined large Return must still fail closed at 16k.
  v_bad := jsonb_set(v_input,'{id}',to_jsonb(gen_random_uuid()::text));
  v_bad := jsonb_set(v_bad,'{data,details,combinedPayment}','false'::jsonb);
  v_denied := false;
  BEGIN PERFORM public.demo_story1_mirror(v_bad);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INVALID_MIRROR%' THEN v_denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'LEGACY_RETURN_SIZE_LIMIT_LOST'; END IF;

  -- Marking an unrelated service as combined must not grant a larger body limit.
  v_bad := jsonb_set(v_input,'{id}',to_jsonb(gen_random_uuid()::text));
  v_bad := jsonb_set(v_bad,'{service}',to_jsonb('ADVANCE_TAX'::text));
  v_bad := jsonb_set(v_bad,'{data,service}',to_jsonb('ADVANCE_TAX'::text));
  v_denied := false;
  BEGIN PERFORM public.demo_story1_mirror(v_bad);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INVALID_MIRROR%' THEN v_denied:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'UNRELATED_SERVICE_SIZE_LIMIT_LOST'; END IF;
  RAISE NOTICE 'PASS: Return-only and Other Tax mirrors, idempotent payment, legacy 16k guards';
END $office_return_combined_test$;
ROLLBACK;
