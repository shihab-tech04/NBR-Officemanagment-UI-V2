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
  v_v2 jsonb;
  v_travel jsonb;
  v_line_1 jsonb;
  v_line_2 jsonb;
  v_allocation_1 jsonb;
  v_allocation_2 jsonb;
  v_passengers jsonb;
  v_page jsonb;
  v_projected jsonb;
  v_stored jsonb;
  v_sum bigint;
  v_conflict boolean;
BEGIN
  v_fn := pg_get_functiondef('public.demo_story1_mirror(jsonb)'::regprocedure);
  IF position('''OTHER_TAX_PAYMENT'',''TAX_WITH_RETURN''' IN v_fn)=0 OR
     position('THEN 800000 ELSE 16000' IN v_fn)=0 THEN
    RAISE EXCEPTION 'OFFICE_RETURN_COMBINED_CONTRACT_MISSING';
  END IF;
  -- The source-readback RPC must be inaccessible directly to anon and users.
  IF has_function_privilege('anon','public.demo_story1_mirror(jsonb)','EXECUTE') OR
     has_function_privilege('authenticated','public.demo_story1_mirror(jsonb)','EXECUTE') OR
     NOT has_function_privilege('service_role','public.demo_story1_mirror(jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'OFFICE_MIRROR_DIRECT_DATA_API_BYPASS'; END IF;
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

  -- V2 non-Return mixed allocations must remain one immutable parent in Office.
  -- Values are disposable; they mirror the approved head 8 + head 145 contract.
  v_line_1:=jsonb_build_object(
    'headId',8,'economicCode','50','headNameEn','Deduction from Salary',
    'taxAmount',15,'penaltyAmount',0,'surchargeAmount',0,'interestAmount',0,
    'totalAmount',15,'serviceCode','SOURCE_TAX_DEPOSIT','isWithholding',true
  );
  v_line_2:=jsonb_build_object(
    'headId',145,'economicCode','135','headNameEn','Tax on notice of demand',
    'taxAmount',35,'penaltyAmount',0,'surchargeAmount',0,'interestAmount',0,
    'totalAmount',35,'serviceCode','ASSESSED_DEMAND','isWithholding',false
  );
  v_allocation_1:=jsonb_build_object(
    'taxpayerTin','111111111111','taxpayerName','WS3 QA Recipient A',
    'headId',8,'assessmentYear','2026-27','amountMinor',1500,
    'serviceCode','SOURCE_TAX_DEPOSIT','isWithholding',true
  );
  v_allocation_2:=jsonb_build_object(
    'taxpayerTin','222222222222','taxpayerName','WS3 QA Recipient B',
    'headId',145,'assessmentYear','2025-26','amountMinor',3500,
    'serviceCode','ASSESSED_DEMAND','isWithholding',false
  );
  v_v2:=jsonb_build_object(
    'id',gen_random_uuid(),'sessionId',gen_random_uuid(),
    'service','OTHER_TAX_PAYMENT','amountMinor',5000,
    'status','SIMULATED_SUCCESS','createdAt',now(),
    'data',jsonb_build_object(
      'origin','TAXPAY_UI','service','OTHER_TAX_PAYMENT','amountMinor',5000,
      'details',jsonb_build_object(
        'payerName','WS3 disposable payer','payerTin','999999999999',
        'payerMode','OTHER','combinedPayment',true,'allocationCount',2,
        'allocationContractVersion',2,'taxpayerCount',2,'taxpayerTin','',
        'taxpayerName','2 taxpayers','assessmentYear','2026-27, 2025-26',
        'totalAmount',50,
        'lines',jsonb_build_array(v_line_1,v_line_2),
        'allocations',jsonb_build_array(v_allocation_1,v_allocation_2),
        'receiptSnapshot',jsonb_build_object(
          'paymentCategory','OTHER_TAX_PAYMENT','totalAmount',50,
          'challanNo','WS3-QA-COMB-1','isSimulatedDemo',true,
          'items',jsonb_build_array(v_line_1,v_line_2),
          'allocationItems',jsonb_build_array(
            jsonb_build_object('taxpayerName','WS3 QA Recipient A','taxpayerTin','111111111111',
              'paymentServiceEn','Deduction from Salary','assessmentYear','2026-27',
              'amountMinor',1500,'economicCode','50'),
            jsonb_build_object('taxpayerName','WS3 QA Recipient B','taxpayerTin','222222222222',
              'paymentServiceEn','Tax on notice of demand','assessmentYear','2025-26',
              'amountMinor',3500,'economicCode','135')
          )
        )
      )
    )
  );
  SELECT sum((a->>'amountMinor')::bigint) INTO v_sum
    FROM jsonb_array_elements(v_v2->'data'->'details'->'allocations') a;
  IF v_sum<>5000 THEN RAISE EXCEPTION 'V2_SOURCE_ALLOCATION_TOTAL_MISMATCH'; END IF;
  v_result:=public.demo_story1_mirror(v_v2);
  IF v_result->>'id' IS DISTINCT FROM v_v2->>'id' OR v_result->>'mirrored'<>'true'
    OR (SELECT count(*) FROM demo_payment.story_payments
        WHERE id=(v_v2->>'id')::uuid AND service_code='OTHER_TAX_PAYMENT'
          AND amount_minor=5000)<>1
  THEN RAISE EXCEPTION 'V2_OFFICE_PARENT_MIRROR_FAILED'; END IF;
  SELECT data INTO v_stored FROM demo_payment.story_payments
    WHERE id=(v_v2->>'id')::uuid;
  IF v_stored IS DISTINCT FROM v_v2->'data'
  THEN RAISE EXCEPTION 'V2_OFFICE_SQL_PAYLOAD_LOSS'; END IF;
  v_replay:=public.demo_story1_mirror(v_v2);
  IF v_replay->>'replayed'<>'true' OR
    (SELECT count(*) FROM demo_payment.story_payments WHERE id=(v_v2->>'id')::uuid)<>1
  THEN RAISE EXCEPTION 'V2_OFFICE_REPLAY_DUPLICATED_PARENT'; END IF;
  v_conflict:=false;
  v_bad:=jsonb_set(v_v2,'{data,details,allocations,0,amountMinor}','1400'::jsonb);
  BEGIN PERFORM public.demo_story1_mirror(v_bad);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='MIRROR_CONFLICT' THEN v_conflict:=true; ELSE RAISE; END IF;
  END;
  IF NOT v_conflict THEN RAISE EXCEPTION 'V2_OFFICE_CONFLICTING_REPLAY_ACCEPTED'; END IF;

  -- The Office/Admin payment endpoint keeps the parent, allocations, receipt
  -- lines, recipients and deterministic certificate reference in readback.
  IF NOT has_function_privilege('anon','public.demo_story1_office_payment_page(integer,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.demo_story1_office_payment_page(integer,integer)','EXECUTE')
  THEN RAISE EXCEPTION 'OFFICE_CERTIFICATE_PAGE_ACCESS_REGRESSION'; END IF;
  v_page:=public.demo_story1_office_payment_page(1,100);
  SELECT item INTO v_projected
    FROM jsonb_array_elements(v_page->'items') AS rows(item)
    WHERE item->>'id'=v_v2->>'id'
    LIMIT 1;
  IF v_projected IS NULL
    OR v_projected->>'certificateReference' IS DISTINCT FROM 'SK-PC-' || (v_v2->>'id')
    OR v_projected->>'amountMinor' IS DISTINCT FROM '5000'
    OR v_projected->'details'->'lines' IS DISTINCT FROM v_v2->'data'->'details'->'lines'
    OR v_projected->'details'->'allocations' IS DISTINCT FROM v_v2->'data'->'details'->'allocations'
    OR v_projected->'details'->'receiptSnapshot' IS DISTINCT FROM v_v2->'data'->'details'->'receiptSnapshot'
  THEN RAISE EXCEPTION 'V2_OFFICE_ADMIN_CERTIFICATE_READBACK_MISMATCH'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(v_projected->'details'->'allocations'))<>2
     OR (SELECT sum((a->>'amountMinor')::bigint)
         FROM jsonb_array_elements(v_projected->'details'->'allocations') a)<>5000
     OR (SELECT count(*) FROM demo_payment.story_payments WHERE id=(v_v2->>'id')::uuid)<>1
  THEN RAISE EXCEPTION 'V2_OFFICE_ADMIN_RECIPIENT_TOTAL_OR_PARENT_MISMATCH'; END IF;
  IF (SELECT data FROM demo_payment.story_payments WHERE id=(v_v2->>'id')::uuid)
      IS DISTINCT FROM v_stored
  THEN RAISE EXCEPTION 'OFFICE_READBACK_MUTATED_SOURCE_SNAPSHOT'; END IF;

  -- Travel Tax readback preserves every masked passenger under the same parent,
  -- while stripping raw passport values and raw passport text from line notes.
  v_passengers:=jsonb_build_array(
    jsonb_build_object('passengerName','WS3 QA Passenger A','passportNumberMasked','••••1234',
      'nationality','Bangladeshi','country','Bangladesh','age',32,'amountMinor',6000),
    jsonb_build_object('passengerName','WS3 QA Passenger B','passportNumberMasked','••••5678',
      'nationality','Bangladeshi','country','Bangladesh','age',28,'amountMinor',6000)
  );
  v_travel:=jsonb_build_object(
    'id',gen_random_uuid(),'sessionId',gen_random_uuid(),
    'service','TRAVEL_TAX','amountMinor',12000,
    'status','SIMULATED_SUCCESS','createdAt',now(),
    'data',jsonb_build_object(
      'origin','TAXPAY_UI','service','TRAVEL_TAX','amountMinor',12000,
      'details',jsonb_build_object(
        'payerName','WS3 disposable payer','payerTin','999999999999',
        'travelMode','AIR','departurePort','DAC','destination','KUL',
        'travelDate','2026-11-13','economicCode','TRAVEL-QA',
        'totalAmount',120,'passportNumber','QA-PASSPORT-SECRET-XYZ',
        'passengers',v_passengers,
        'lines',jsonb_build_array(jsonb_build_object(
          'amountMinor',12000,'note','Passport: QA-PASSPORT-SECRET-XYZ'
        )),
        'receiptSnapshot',jsonb_build_object(
          'paymentCategory','TRAVEL_TAX','totalAmount',120,
          'travelDetails',jsonb_build_object('passengers',v_passengers)
        )
      )
    )
  );
  v_result:=public.demo_story1_mirror(v_travel);
  IF v_result->>'mirrored'<>'true' THEN RAISE EXCEPTION 'TRAVEL_TAX_OFFICE_PARENT_MIRROR_FAILED'; END IF;
  v_replay:=public.demo_story1_mirror(v_travel);
  IF v_replay->>'replayed'<>'true' OR
    (SELECT count(*) FROM demo_payment.story_payments WHERE id=(v_travel->>'id')::uuid)<>1
  THEN RAISE EXCEPTION 'TRAVEL_TAX_OFFICE_REPLAY_DUPLICATED_PARENT'; END IF;
  v_page:=public.demo_story1_office_payment_page(1,100);
  SELECT item INTO v_projected
    FROM jsonb_array_elements(v_page->'items') AS rows(item)
    WHERE item->>'id'=v_travel->>'id'
    LIMIT 1;
  IF v_projected IS NULL
    OR v_projected->>'certificateReference' IS DISTINCT FROM 'SK-PC-' || (v_travel->>'id')
    OR v_projected->>'amountMinor' IS DISTINCT FROM '12000'
    OR v_projected->'details'->>'travelMode' IS DISTINCT FROM 'AIR'
    OR v_projected->'details'->>'departurePort' IS DISTINCT FROM 'DAC'
    OR v_projected->'details'->>'destination' IS DISTINCT FROM 'KUL'
    OR v_projected->'details'->>'travelDate' IS DISTINCT FROM '2026-11-13'
    OR v_projected->'details'->'passengers' IS DISTINCT FROM v_passengers
    OR v_projected->'details' ? 'passportNumber'
    OR position('QA-PASSPORT-SECRET-XYZ' IN v_projected::text)>0
    OR (SELECT count(*) FROM jsonb_array_elements(v_projected->'details'->'passengers'))<>2
    OR (SELECT sum((p->>'amountMinor')::bigint)
        FROM jsonb_array_elements(v_projected->'details'->'passengers') p)<>12000
  THEN RAISE EXCEPTION 'TRAVEL_TAX_OFFICE_PASSENGER_CERTIFICATE_READBACK_MISMATCH'; END IF;

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
  RAISE NOTICE 'PASS: Return-only and Other Tax mirrors, v2 allocation and certificate readback, Travel Tax passenger projection, exact replay and legacy 16k guards';
END $office_return_combined_test$;
ROLLBACK;
