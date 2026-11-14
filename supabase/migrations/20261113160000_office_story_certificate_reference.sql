-- Add a deterministic certificate reference to the existing Office payment read model.
-- The original payment UUID remains the sole transaction identity; no payment or
-- certificate row is created. The wrapped SQL projection retains its existing
-- filters, pagination, RLS and Travel Tax redaction.
CREATE OR REPLACE FUNCTION public.demo_story1_office_payment_page(
 p_page integer DEFAULT 1,p_per_page integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
 v_page jsonb;
 v_items jsonb;
BEGIN
 v_page:=public.demo_story1_office_page(p_page,p_per_page);
 SELECT coalesce(jsonb_agg(
   item || pg_catalog.jsonb_build_object(
     'certificateReference','SK-PC-' || (item->>'id')
   ) ORDER BY ordinal
 ),'[]'::jsonb)
 INTO v_items
 FROM pg_catalog.jsonb_array_elements(
   coalesce(v_page->'items','[]'::jsonb)
 ) WITH ORDINALITY AS page_rows(item,ordinal);
 RETURN pg_catalog.jsonb_set(v_page,'{items}',v_items,true);
END;
$function$;

REVOKE ALL ON FUNCTION public.demo_story1_office_payment_page(integer,integer)
 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.demo_story1_office_payment_page(integer,integer)
 TO anon,authenticated;

COMMENT ON FUNCTION public.demo_story1_office_payment_page(integer,integer) IS
 'Office payment read projection over the immutable TaxPay parent. Exposes the existing deterministic SK-PC-{parent UUID} reference without creating a financial transaction.';

-- WS5 release privacy gate: keep the original, immutable projections but
-- retire direct anonymous execution before introducing private Office records.
-- Authorized Office RPC wrappers reuse the same MAKER/REVIEWER/APPROVER membership
-- and Office origin checks as the canonical payment notice cursor.
BEGIN;
CREATE OR REPLACE FUNCTION public.payment_v1_office_guarded_story_page(
  p_page integer DEFAULT 1,p_per_page integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $office_guard$
DECLARE v_actor uuid:=auth.uid(); v_origin text;
BEGIN
  SELECT s.origin INTO v_origin FROM payment_sync.settings s WHERE s.singleton;
  IF v_actor IS NULL OR v_origin IS DISTINCT FROM 'OFFICE_SQL' THEN
    RAISE EXCEPTION 'Authorized Office officer required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM payment_sync.officer_roles r
    WHERE r.user_uid=v_actor AND r.active
      AND r.role IN ('MAKER','REVIEWER','APPROVER')
  ) THEN
    RAISE EXCEPTION 'Active payment officer role required' USING ERRCODE='42501';
  END IF;
  RETURN public.demo_story1_office_payment_page(p_page,p_per_page);
END;
$office_guard$;

CREATE OR REPLACE FUNCTION public.payment_v1_office_guarded_story_notices()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $office_notice_guard$
DECLARE v_actor uuid:=auth.uid(); v_origin text;
BEGIN
  SELECT s.origin INTO v_origin FROM payment_sync.settings s WHERE s.singleton;
  IF v_actor IS NULL OR v_origin IS DISTINCT FROM 'OFFICE_SQL' THEN
    RAISE EXCEPTION 'Authorized Office officer required' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM payment_sync.officer_roles r
    WHERE r.user_uid=v_actor AND r.active
      AND r.role IN ('MAKER','REVIEWER','APPROVER')
  ) THEN
    RAISE EXCEPTION 'Active payment officer role required' USING ERRCODE='42501';
  END IF;
  RETURN public.demo_story1_office_notices();
END;
$office_notice_guard$;

REVOKE EXECUTE ON FUNCTION public.demo_story1_office_list()
  FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.demo_story1_office_page(integer,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.demo_story1_office_notices()
  FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.demo_story1_office_payment_page(integer,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.payment_v1_office_guarded_story_page(integer,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.payment_v1_office_guarded_story_notices()
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payment_v1_office_guarded_story_page(integer,integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.payment_v1_office_guarded_story_notices()
  TO authenticated;

DO $verify_office_story_privacy$
BEGIN
  IF has_function_privilege('anon','public.demo_story1_office_list()','EXECUTE')
     OR has_function_privilege('anon','public.demo_story1_office_page(integer,integer)','EXECUTE')
     OR has_function_privilege('anon','public.demo_story1_office_notices()','EXECUTE')
     OR has_function_privilege('anon','public.demo_story1_office_payment_page(integer,integer)','EXECUTE')
     OR has_function_privilege('anon','public.payment_v1_office_guarded_story_page(integer,integer)','EXECUTE')
     OR has_function_privilege('anon','public.payment_v1_office_guarded_story_notices()','EXECUTE')
     OR has_function_privilege('authenticated','public.demo_story1_office_page(integer,integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.demo_story1_office_notices()','EXECUTE')
     OR has_function_privilege('authenticated','public.demo_story1_office_payment_page(integer,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.payment_v1_office_guarded_story_page(integer,integer)','EXECUTE')
     OR NOT has_function_privilege('authenticated','public.payment_v1_office_guarded_story_notices()','EXECUTE')
  THEN RAISE EXCEPTION 'OFFICE_STORY_PRIVATE_READ_GRANTS_INVALID'; END IF;
END;
$verify_office_story_privacy$;
COMMIT;
