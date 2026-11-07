-- Approved, synthetic fixture projection only. Unapproved batches excluded.
-- Preserve the existing Office nonfixture release exclusion, pagination,
-- and Travel Tax passport/note redaction. Not a certified payment ledger.
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
 where (data->>'origin'='TAXPAY_UI' or (data->>'origin'='TAXPAY_SQL_FIXTURE'
  and data->'details'->>'sampleOnly'='true'
  and data->'details'->>'fixtureBatch' in (
    'TAXPAY-20261107-30-PROFILE-COVERAGE',
    'TAXPAY-20261107-ACTIVE-HEAD-CATALOGUE')
  and data->'details'->>'payerId' ~ '^user([1-9]|[12][0-9]|30)$'))
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
 where (data->>'origin'='TAXPAY_UI' or (data->>'origin'='TAXPAY_SQL_FIXTURE'
  and data->'details'->>'sampleOnly'='true'
  and data->'details'->>'fixtureBatch' in (
    'TAXPAY-20261107-30-PROFILE-COVERAGE',
    'TAXPAY-20261107-ACTIVE-HEAD-CATALOGUE')
  and data->'details'->>'payerId' ~ '^user([1-9]|[12][0-9]|30)$'))
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


CREATE OR REPLACE FUNCTION public.demo_story1_office_notices()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'paymentId',n.payment_id,
 'type',n.event_type,'createdAt',n.created_at) order by n.id desc)
 from (select sn.* from demo_payment.story_notifications sn
 join demo_payment.story_payments p on p.id=sn.payment_id
 where (p.data->>'origin'='TAXPAY_UI' or (p.data->>'origin'='TAXPAY_SQL_FIXTURE'
  and p.data->'details'->>'sampleOnly'='true'
  and p.data->'details'->>'fixtureBatch' in (
    'TAXPAY-20261107-30-PROFILE-COVERAGE',
    'TAXPAY-20261107-ACTIVE-HEAD-CATALOGUE')
  and p.data->'details'->>'payerId' ~ '^user([1-9]|[12][0-9]|30)$'))
 and not (p.data->'details'->>'payerName'='Taxpayer / withholding agent'
   and p.data->'details'->>'taxpayerTin'='123456789012'
   and p.created_at<'2026-10-18 06:55:00+00'::timestamptz)
 order by sn.id desc limit 100) n),'[]'::jsonb);
end;$function$
;
