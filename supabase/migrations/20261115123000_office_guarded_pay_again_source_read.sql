-- WS3 Pay Again lineage: existing Office maker/reviewer/approver-only
-- read of the repeat and its separately mirrored historical parent.
-- Do NOT create a second payment/receipt, copy private source credentials, or
-- treat an out-of-order Office mirror as a source record not existing.
-- Source/Office SQL and Auth stay distinct. No RLS or status change.
BEGIN;

CREATE OR REPLACE FUNCTION public.payment_v1_office_guarded_pay_again_lineage(
  p_payment_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $office_pay_again$
DECLARE
  v_actor uuid := auth.uid();
  v_origin text;
  v_repeat demo_payment.story_payments%ROWTYPE;
  v_source demo_payment.story_payments%ROWTYPE;
  v_source_id text;
BEGIN
  SELECT s.origin INTO v_origin
  FROM payment_sync.settings s WHERE s.singleton;
  IF v_actor IS NULL OR v_origin IS DISTINCT FROM 'OFFICE_SQL' OR
     NOT EXISTS (
       SELECT 1 FROM payment_sync.officer_roles r
       WHERE r.user_uid=v_actor AND r.active
         AND r.role IN ('MAKER','REVIEWER','APPROVER')
     )
  THEN
    RAISE EXCEPTION 'Active authorized Office payment officer required'
      USING ERRCODE='42501';
  END IF;
  IF p_payment_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_repeat
  FROM demo_payment.story_payments p WHERE p.id=p_payment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_source_id := v_repeat.data#>>'{details,sourcePaymentId}';
  IF v_source_id IS NULL THEN RETURN NULL; END IF;
  IF v_source_id !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'INVALID_OFFICE_PAY_AGAIN_SOURCE';
  END IF;

  SELECT * INTO v_source
  FROM demo_payment.story_payments p WHERE p.id=v_source_id::uuid;
  IF NOT FOUND THEN
    -- Taxpayer's source may be queued for the separate, signed Office mirror.
    -- Never fabricate the missing historic allocations or a settlement.
    RETURN pg_catalog.jsonb_build_object(
      'paymentId',v_repeat.id,
      'sourcePaymentId',v_source_id,
      'sourceMirrored',false
    );
  END IF;
  IF v_repeat.status IS DISTINCT FROM 'SIMULATED_SUCCESS'
     OR v_source.status IS DISTINCT FROM 'SIMULATED_SUCCESS'
     OR v_repeat.service_code IS DISTINCT FROM v_source.service_code
     OR v_repeat.data#>>'{details,payerId}'
          IS DISTINCT FROM v_source.data#>>'{details,payerId}'
     OR v_repeat.id IS NOT DISTINCT FROM v_source.id
  THEN RAISE EXCEPTION 'OFFICE_PAY_AGAIN_LINEAGE_CONFLICT'; END IF;

  RETURN pg_catalog.jsonb_build_object(
    'paymentId',v_repeat.id,
    'sourcePaymentId',v_source.id,
    'sourceMirrored',true,
    'payerId',v_repeat.data#>>'{details,payerId}',
    'payerTin',v_repeat.data#>>'{details,payerTin}',
    'sourceService',v_source.service_code,
    'repeatService',v_repeat.service_code,
    'sourceAmountMinor',v_source.amount_minor::text,
    'repeatAmountMinor',v_repeat.amount_minor::text,
    'sourceReceiptReference',v_source.data#>>'{details,receiptReference}',
    'sourceCertificateReference','SK-PC-'||v_source.id::text,
    'repeatReceiptReference',v_repeat.data#>>'{details,receiptReference}',
    'repeatCertificateReference','SK-PC-'||v_repeat.id::text,
    'sourceAllocations',coalesce(v_source.data#>'{details,allocations}','[]'::jsonb),
    'repeatAllocations',coalesce(v_repeat.data#>'{details,allocations}','[]'::jsonb),
    'sourceCreatedAt',v_source.created_at,
    'repeatCreatedAt',v_repeat.created_at
  );
END;
$office_pay_again$;

REVOKE ALL ON FUNCTION public.payment_v1_office_guarded_pay_again_lineage(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payment_v1_office_guarded_pay_again_lineage(uuid)
  TO authenticated;

DO $verify_office_pay_again_grants$
BEGIN
  IF has_function_privilege('anon',
     'public.payment_v1_office_guarded_pay_again_lineage(uuid)','EXECUTE')
     OR NOT has_function_privilege('authenticated',
     'public.payment_v1_office_guarded_pay_again_lineage(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'OFFICE_PAY_AGAIN_READ_PERMISSION_REGRESSION'; END IF;
END;
$verify_office_pay_again_grants$;
COMMIT;
