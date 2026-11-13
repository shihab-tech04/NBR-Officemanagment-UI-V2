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
