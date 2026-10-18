-- Story 1: transactions is exclusively a list of UI-submitted simulated payments.
-- Keep the 136 prior QA requests intact as historical test evidence, but do not
-- expose them as taxpayer transactions. No data is deleted.
create or replace function public.demo_story1_office_page(
 p_page integer default 1,p_per_page integer default 100
) returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
declare v_total bigint;v_items jsonb;
begin
 if p_page is null or p_page<1 or p_per_page is null or p_per_page<1 or p_per_page>100
 then raise exception 'INVALID_PAGINATION';end if;
 select count(*) into v_total from demo_payment.story_payments
 where data->>'origin'='TAXPAY_UI';
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'service',r.service_code,
 'amountMinor',r.amount_minor,'status',r.status,'createdAt',r.created_at,
 'details',r.data->'details') order by r.created_at desc,r.id desc),'[]'::jsonb)
 into v_items from (
 select * from demo_payment.story_payments
 where data->>'origin'='TAXPAY_UI'
 order by created_at desc,id desc
 limit p_per_page offset (p_page-1)*p_per_page
 ) r;
 return jsonb_build_object('items',v_items,'total',v_total,'page',p_page,'perPage',p_per_page);
end;$fn$;
create or replace function public.demo_story1_office_list()
returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
begin
 return (select public.demo_story1_office_page(1,100)->'items');
end;$fn$;
create or replace function public.demo_story1_office_notices()
returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'paymentId',n.payment_id,
 'type',n.event_type,'createdAt',n.created_at) order by n.id desc)
 from (select sn.* from demo_payment.story_notifications sn
 join demo_payment.story_payments p on p.id=sn.payment_id
 where p.data->>'origin'='TAXPAY_UI'
 order by sn.id desc limit 100) n),'[]'::jsonb);
end;$fn$;
revoke all on function public.demo_story1_office_page(integer,integer) from public;
grant execute on function public.demo_story1_office_page(integer,integer) to anon,authenticated;
