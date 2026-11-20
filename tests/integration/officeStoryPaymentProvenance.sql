-- Disposable acceptance only. No live records are read or written.
BEGIN;
DO $check$
DECLARE
  source_id uuid:=gen_random_uuid();
  source_parent_id uuid:=gen_random_uuid();
  session_id uuid:=gen_random_uuid();
  v_source_revision text:=repeat('a',64);
  input jsonb;
  response jsonb;
  replay jsonb;
  bad_input jsonb;
  office_page jsonb;
  office_row jsonb;
  stored_data jsonb;
BEGIN
  IF to_regclass('demo_payment.story_payment_provenance') IS NULL OR
     NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
       WHERE oid='demo_payment.story_payment_provenance'::regclass) THEN
    RAISE EXCEPTION 'OFFICE_PROVENANCE_RLS_MISSING';
  END IF;
  IF has_table_privilege('anon','demo_payment.story_payment_provenance','SELECT') OR
     has_table_privilege('authenticated','demo_payment.story_payment_provenance','SELECT') OR
     has_table_privilege('service_role','demo_payment.story_payment_provenance','SELECT') OR
     has_function_privilege('anon','public.demo_story1_mirror(jsonb)','EXECUTE') OR
     has_function_privilege('authenticated','public.demo_story1_mirror(jsonb)','EXECUTE') OR
     NOT has_function_privilege('service_role','public.demo_story1_mirror(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'OFFICE_PROVENANCE_PRIVILEGE_BOUNDARY_INVALID';
  END IF;

  input:=jsonb_build_object(
    'id',source_id,'sessionId',session_id,'service','OTHER_TAX_PAYMENT',
    'amountMinor',5000,'status','SIMULATED_SUCCESS',
    'createdAt','2026-11-20T09:00:00Z',
    'sourceProject','v2','sourceParentId',source_parent_id,
    'sourceRevision',v_source_revision,
    'data',jsonb_build_object('origin','TAXPAY_UI','service','OTHER_TAX_PAYMENT',
      'amountMinor',5000,'details',jsonb_build_object(
        'payerId','user1','payerTin','111111111111',
        'allocations',jsonb_build_array(
          jsonb_build_object('allocationId','d3-a1','taxpayerTin','222222222222',
            'headId',121,'assessmentYear','2026-27','amountMinor',2000),
          jsonb_build_object('allocationId','d3-a2','taxpayerTin','333333333333',
            'headId',145,'assessmentYear','2025-26','amountMinor',3000)),
        'receiptSnapshot',jsonb_build_object('challanNo','SIM-D3-PROVENANCE',
          'totalAmount',50,'isSimulatedDemo',true))));

  response:=public.demo_story1_mirror(input);
  IF response->>'id'<>source_id::text OR response->>'replayed'<>'false' OR
     response->>'sourceProject'<>'v2' OR
     response->>'sourceParentId'<>source_parent_id::text OR
     response->>'sourceRevision'<>v_source_revision THEN
    RAISE EXCEPTION 'OFFICE_PROVENANCE_FIRST_MIRROR_MISMATCH';
  END IF;
  SELECT data INTO stored_data FROM demo_payment.story_payments WHERE id=source_id;
  IF stored_data IS DISTINCT FROM input->'data' OR stored_data ? 'sourceProject' OR
     (SELECT count(*) FROM demo_payment.story_payment_provenance WHERE payment_id=source_id)<>1 OR
     (SELECT count(*) FROM demo_payment.story_notifications WHERE payment_id=source_id)<>1 THEN
    RAISE EXCEPTION 'OFFICE_PROVENANCE_MUTATED_SOURCE_OR_DUPLICATED_NOTICE';
  END IF;

  replay:=public.demo_story1_mirror(input);
  IF replay->>'replayed'<>'true' OR replay->>'sourceProject'<>'v2' OR
     replay->>'sourceParentId'<>source_parent_id::text OR
     replay->>'sourceRevision'<>v_source_revision OR
     (SELECT count(*) FROM demo_payment.story_payment_provenance WHERE payment_id=source_id)<>1 OR
     (SELECT count(*) FROM demo_payment.story_notifications WHERE payment_id=source_id)<>1 THEN
    RAISE EXCEPTION 'OFFICE_PROVENANCE_REPLAY_NOT_IDEMPOTENT';
  END IF;

  bad_input:=jsonb_set(input,'{sourceRevision}',to_jsonb(repeat('b',64)),true);
  BEGIN
    PERFORM public.demo_story1_mirror(bad_input);
    RAISE EXCEPTION 'EXPECTED_PROVENANCE_CONFLICT_NOT_RAISED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'MIRROR_CONFLICT' THEN RAISE; END IF;
  END;
  IF (SELECT data FROM demo_payment.story_payments WHERE id=source_id) IS DISTINCT FROM stored_data OR
     (SELECT provenance.source_revision FROM demo_payment.story_payment_provenance provenance
       WHERE provenance.payment_id=source_id)<>v_source_revision THEN
    RAISE EXCEPTION 'CONFLICTING_REPLAY_MUTATED_PARENT_OR_PROVENANCE';
  END IF;

  office_page:=public.demo_story1_office_payment_page(1,100);
  SELECT page_rows.item INTO office_row
    FROM jsonb_array_elements(office_page->'items') AS page_rows(item)
    WHERE page_rows.item->>'id'=source_id::text;
  IF office_row IS NULL OR
     office_row->>'certificateReference' IS DISTINCT FROM 'SK-PC-'||source_id::text OR
     office_row->>'sourceProject' IS DISTINCT FROM 'v2' OR
     office_row->>'sourceParentId' IS DISTINCT FROM source_parent_id::text OR
     office_row->>'sourceRevision' IS DISTINCT FROM v_source_revision OR
     office_row->'details'->'receiptSnapshot'->>'challanNo' IS DISTINCT FROM 'SIM-D3-PROVENANCE' OR
     office_row->'details'->>'payerTin' IS DISTINCT FROM '111111111111' OR
     jsonb_array_length(office_row->'details'->'allocations') IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'OFFICE_PROVENANCE_GUARDED_READBACK_MISMATCH';
  END IF;

  RAISE NOTICE 'PASS: new disposable parent and exact payload, v2 project/parent/revision sidecar, idempotent replay, conflicting replay immutability, allocation/TIN and receipt readback';
END;
$check$;
ROLLBACK;
