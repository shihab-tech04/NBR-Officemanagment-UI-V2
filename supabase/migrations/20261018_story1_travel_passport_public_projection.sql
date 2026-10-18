-- Full travel passport references remain in private, RLS-protected SQL mirrors.
-- The unauthenticated Office transaction feed must never return the raw value,
-- including its legacy copy inside each receipt line's note.
-- Preserve the existing TaxPay-UI and pre-release fixture exclusion filters.
create or replace function public.demo_story1_office_page(
 p_page integer default 1,p_per_page integer default 100
) returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
declare v_total bigint;v_items jsonb;
begin
 if p_page is null or p_page<1 or p_per_page is null or p_per_page<1 or p_per_page>100
 then raise exception 'INVALID_PAGINATION';end if;
 select count(*) into v_total from demo_payment.story_payments
 where data->>'origin'='TAXPAY_UI'
 and not (
   data->'details'->>'payerName'='Taxpayer / withholding agent'
   and data->'details'->>'taxpayerTin'='123456789012'
   and created_at<'2026-10-18 06:55:00+00'::timestamptz
 );
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'service',r.service_code,'amountMinor',r.amount_minor,
  'status',r.status,'createdAt',r.created_at,
  'details',case when r.service_code='TRAVEL_TAX' then
    (coalesce(r.data->'details','{}'::jsonb)-'passportNumber'-'lines') ||
    jsonb_build_object(
      'passportNumberMasked',case when length(coalesce(
        nullif(r.data->'details'->>'passportNumber',''),
        nullif(substring(r.data->'details'->'lines'->0->>'note' from 'Passport: ([^ |]+)'), 'Not')
      ,''))>0 then
        repeat('•',greatest(length(coalesce(
          nullif(r.data->'details'->>'passportNumber',''),
          nullif(substring(r.data->'details'->'lines'->0->>'note' from 'Passport: ([^ |]+)'), 'Not')
        ,''))-3,0)) || right(coalesce(
          nullif(r.data->'details'->>'passportNumber',''),
          nullif(substring(r.data->'details'->'lines'->0->>'note' from 'Passport: ([^ |]+)'), 'Not')
        ,''),3)
        else null end,
      'lines',(select coalesce(jsonb_agg(
        case when jsonb_typeof(line)='object' then line-'note' else line end
      ),'[]'::jsonb) from jsonb_array_elements(
        case when jsonb_typeof(r.data->'details'->'lines')='array'
          then r.data->'details'->'lines' else '[]'::jsonb end
      ) as entries(line))
    )
  else r.data->'details' end
 ) order by r.created_at desc,r.id desc),'[]'::jsonb)
 into v_items from (
 select * from demo_payment.story_payments
 where data->>'origin'='TAXPAY_UI'
 and not (
   data->'details'->>'payerName'='Taxpayer / withholding agent'
   and data->'details'->>'taxpayerTin'='123456789012'
   and created_at<'2026-10-18 06:55:00+00'::timestamptz
 )
 order by created_at desc,id desc
 limit p_per_page offset (p_page-1)*p_per_page
 ) r;
 return jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'perPage',p_per_page);
end;$fn$;

revoke all on function public.demo_story1_office_page(integer,integer) from public;
grant execute on function public.demo_story1_office_page(integer,integer) to anon,authenticated;
