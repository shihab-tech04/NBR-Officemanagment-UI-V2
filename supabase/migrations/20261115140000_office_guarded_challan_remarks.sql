-- F-178 / US-181: existing signed mirror transports the original parent JSON
-- byte-for-byte as JSONB. Expose only its challanRemarks via the same active
-- Office officer authorization as the existing guarded page.
BEGIN;
CREATE FUNCTION public.payment_v1_office_guarded_challan_remarks(p_payment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $office_remarks$
DECLARE v_actor uuid := auth.uid(); v_origin text; v_parent demo_payment.story_payments%ROWTYPE;
BEGIN
  SELECT s.origin INTO v_origin FROM payment_sync.settings s WHERE s.singleton;
  IF v_actor IS NULL OR v_origin IS DISTINCT FROM 'OFFICE_SQL'
     OR NOT EXISTS (
       SELECT 1 FROM payment_sync.officer_roles r
       WHERE r.user_uid=v_actor AND r.active
         AND r.role IN ('MAKER','REVIEWER','APPROVER')
     ) THEN
    RAISE EXCEPTION 'Active authorized Office payment officer required'
      USING ERRCODE='42501';
  END IF;
  IF p_payment_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_parent FROM demo_payment.story_payments p
    WHERE p.id=p_payment_id AND p.data->>'origin'='TAXPAY_UI';
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN pg_catalog.jsonb_build_object(
    'paymentId',v_parent.id::text,
    'challanRemarks',v_parent.data#>'{details,challanRemarks}',
    'receiptReference',v_parent.data#>>'{details,receiptReference}'
  );
END;
$office_remarks$;
REVOKE ALL ON FUNCTION public.payment_v1_office_guarded_challan_remarks(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payment_v1_office_guarded_challan_remarks(uuid)
 TO authenticated;
COMMENT ON FUNCTION public.payment_v1_office_guarded_challan_remarks(uuid) IS
 'F-178 guarded read of immutable original Taxpayer parent remarks after signed Office mirroring; no copied identity or altered payment.';
COMMIT;
