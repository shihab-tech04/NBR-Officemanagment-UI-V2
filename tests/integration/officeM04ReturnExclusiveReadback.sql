-- M04 Office DB isolated readback of one exclusive Return source parent.
-- All writes are disposable and rolled back; historical combined records stay intact.
BEGIN;
CREATE SCHEMA IF NOT EXISTS payment_sync;
CREATE TABLE IF NOT EXISTS payment_sync.settings(singleton boolean PRIMARY KEY,origin text NOT NULL);
INSERT INTO payment_sync.settings VALUES(true,'OFFICE_SQL')
  ON CONFLICT(singleton) DO NOTHING;
CREATE TABLE IF NOT EXISTS payment_sync.officer_roles(
  user_uid uuid PRIMARY KEY REFERENCES auth.users(id),
  role text NOT NULL CHECK(role IN ('MAKER','REVIEWER','APPROVER')),
  active boolean NOT NULL DEFAULT true);
DO $m04$
DECLARE
  v_id uuid:=gen_random_uuid();
  v_data jsonb;
  v_input jsonb;
  v_output jsonb;
  v_read jsonb;
  v_row jsonb;
  v_denied boolean:=false;
BEGIN
  v_data:=jsonb_build_object('origin','TAXPAY_UI','service','TAX_WITH_RETURN',
    'amountMinor',1975,'details',jsonb_build_object(
      'payerMode','OTHER','payerTin','222222222222','payerName','Disposable payer',
      'taxpayerTin','111111111111','assessmentYear','2025-26',
      'receiptReference','SIM-'||v_id::text,
      'lines',jsonb_build_array(jsonb_build_object(
        'headId',125,'totalAmount',19.75,'economicCode','74')),
      'receiptSnapshot',jsonb_build_object(
        'paymentCategory','TAX_WITH_RETURN','payerTin','222222222222',
        'taxpayerTin','111111111111','assessmentYear','2025-26',
        'challanNo','SIM-'||v_id::text,'totalAmount',19.75,
        'items',jsonb_build_array(jsonb_build_object(
          'headId',125,'totalAmount',19.75,'economicCode','74')))));
  v_input:=jsonb_build_object('id',v_id,'sessionId',gen_random_uuid(),
    'service','TAX_WITH_RETURN','amountMinor',1975,'status','SIMULATED_SUCCESS',
    'createdAt',now(),'data',v_data);
  v_output:=public.demo_story1_mirror(v_input);
  IF v_output->>'id' IS DISTINCT FROM v_id::text OR
     v_output->>'mirrored'<>'true'
  THEN RAISE EXCEPTION 'M04_OFFICE_SINGLE_RETURN_MIRROR_FAILED'; END IF;
  v_output:=public.demo_story1_mirror(v_input);
  IF v_output->>'replayed'<>'true' OR
    (SELECT count(*) FROM demo_payment.story_payments WHERE id=v_id)<>1
  THEN RAISE EXCEPTION 'M04_OFFICE_RETURN_IDEMPOTENCY_FAILED'; END IF;
  v_read:=public.demo_story1_office_payment_page(1,100);
  SELECT item INTO v_row FROM jsonb_array_elements(v_read->'items') items(item)
    WHERE item->>'id'=v_id::text LIMIT 1;
  IF v_row IS NULL
     OR v_row->>'certificateReference' IS DISTINCT FROM 'SK-PC-'||v_id::text
     OR v_row->>'amountMinor' IS DISTINCT FROM '1975'
     OR v_row->'details'->>'payerTin' IS DISTINCT FROM '222222222222'
     OR v_row->'details'->>'taxpayerTin' IS DISTINCT FROM '111111111111'
     OR v_row->'details'->>'assessmentYear' IS DISTINCT FROM '2025-26'
     OR v_row->'details'->'lines' IS DISTINCT FROM v_data#>'{details,lines}'
     OR v_row->'details'->'receiptSnapshot' IS DISTINCT FROM v_data#>'{details,receiptSnapshot}'
  THEN RAISE EXCEPTION 'M04_OFFICE_RETURN_RECEIPT_CERTIFICATE_PARITY_FAILED'; END IF;
  BEGIN
    PERFORM public.demo_story1_mirror(jsonb_set(v_input,
      '{data,details,assessmentYear}','"2026-27"'::jsonb));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='MIRROR_CONFLICT' THEN v_denied:=true;
    ELSE RAISE; END IF;
  END;
  IF NOT v_denied OR
    (SELECT data FROM demo_payment.story_payments WHERE id=v_id) IS DISTINCT FROM v_data
  THEN RAISE EXCEPTION 'M04_OFFICE_RETURN_CONFLICT_MUTATED_SOURCE'; END IF;
  IF has_function_privilege('anon',
      'public.demo_story1_office_payment_page(integer,integer)','EXECUTE')
     OR has_function_privilege('authenticated',
      'public.demo_story1_office_payment_page(integer,integer)','EXECUTE')
  THEN RAISE EXCEPTION 'M04_OFFICE_RETURN_UNSCOPED_SOURCE_ACCESS'; END IF;
  RAISE NOTICE 'M04_OFFICE_RETURN_READBACK_PASS';
END $m04$;
ROLLBACK;
