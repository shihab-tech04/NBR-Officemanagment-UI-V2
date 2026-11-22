-- Disposable transactional acceptance of Office's signed-mirror SQL boundary.
-- No hosted Office, taxpayer, authorization, permission or financial writes.
BEGIN;

DO $office_authorization_thirty$
DECLARE
  v_id uuid := gen_random_uuid();
  v_output jsonb;
  v_invalid boolean := false;
BEGIN
  v_output := public.demo_auth_office_mirror(jsonb_build_object(
    'id',v_id::text,
    'payerId','user19',
    'taxpayerId','user30',
    'status','PENDING',
    'requestedAt', now()::text,
    'codeResends',0
  ));
  IF v_output->>'id' <> v_id::text OR v_output->>'status' <> 'PENDING' THEN
    RAISE EXCEPTION 'OFFICE_30_ACCOUNT_MIRROR_ACK_FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM demo_payment.authorization_audit
    WHERE id=v_id AND payer_id='user19' AND taxpayer_id='user30'
  ) THEN
    RAISE EXCEPTION 'OFFICE_30_ACCOUNT_MIRROR_READBACK_FAILED';
  END IF;

  BEGIN
    PERFORM public.demo_auth_office_mirror(jsonb_build_object(
      'id',gen_random_uuid()::text,
      'payerId','user31',
      'taxpayerId','user1',
      'status','PENDING',
      'requestedAt',now()::text,
      'codeResends',0
    ));
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%INVALID_AUTHORIZATION_SNAPSHOT%' THEN
      v_invalid := true;
    ELSE RAISE; END IF;
  END;
  IF NOT v_invalid THEN
    RAISE EXCEPTION 'OFFICE_UNAPPROVED_ACTOR_ACCEPTED';
  END IF;

  IF has_function_privilege('anon','public.demo_auth_office_mirror(jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.demo_auth_office_mirror(jsonb)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.demo_auth_office_mirror(jsonb)','EXECUTE')
     OR has_table_privilege('anon','demo_payment.authorization_audit','SELECT')
  THEN
    RAISE EXCEPTION 'OFFICE_MIRROR_PRIVATE_ACCESS_WEAKENED';
  END IF;
  IF NOT (
    SELECT relrowsecurity FROM pg_class
    WHERE oid='demo_payment.authorization_audit'::regclass
  ) THEN
    RAISE EXCEPTION 'OFFICE_AUTHORIZATION_AUDIT_RLS_DISABLED';
  END IF;
  IF NOT (
    SELECT 'security_invoker=true'=ANY(reloptions)
    FROM pg_class WHERE oid='demo_payment.authorized_allocation_audit'::regclass
  ) THEN
    RAISE EXCEPTION 'OFFICE_AUTHORIZATION_VIEW_NOT_SECURITY_INVOKER';
  END IF;
  IF pg_get_viewdef('demo_payment.authorized_allocation_audit'::regclass,true)
     NOT LIKE '%[12][0-9]%' THEN
    RAISE EXCEPTION 'OFFICE_AUTHORIZATION_VIEW_EXCLUDES_APPROVED_ACCOUNT_RANGE';
  END IF;
  RAISE NOTICE 'PASS: user19/user30 signed mirror SQL readback; bad actor denied; private grants/RLS/view retained';
END $office_authorization_thirty$;

ROLLBACK;
