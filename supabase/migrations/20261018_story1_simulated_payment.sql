-- User story 1: synthetic payment only, no gateway or official tax credit.
-- SQL mirrors the deployed 2026-10-18 Supabase definitions.
create schema if not exists demo_payment;
create table if not exists demo_payment.story_payments (id uuid primary key,session_id uuid not null,service_code text not null,
 amount_minor bigint not null,data jsonb not null,status text not null,
 created_at timestamptz not null,mirrored_at timestamptz not null default now(),
 check (amount_minor>0),check (jsonb_typeof(data)='object'),check (status='SIMULATED_SUCCESS'));
create table if not exists demo_payment.story_notifications (
 id bigint generated always as identity primary key,
 payment_id uuid not null references demo_payment.story_payments(id),
 event_type text not null,created_at timestamptz not null default now(),
 unique(payment_id,event_type)
);
alter table demo_payment.story_payments enable row level security;
alter table demo_payment.story_notifications enable row level security;
revoke all on schema demo_payment from public,anon,authenticated;
revoke all on all tables in schema demo_payment from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.demo_story1_mirror(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_old demo_payment.story_payments%rowtype;v_id uuid;v_session uuid;v_status text;v_details jsonb;
begin
 if p_input is null or jsonb_typeof(p_input)<>'object' then raise exception 'INVALID_INPUT';end if;
 v_id:=(p_input->>'id')::uuid;
 v_session:=(p_input->>'sessionId')::uuid;
 v_status:=p_input->>'status';
 v_details:=p_input->'data';
 if v_status<>'SIMULATED_SUCCESS' or jsonb_typeof(v_details)<>'object'
 or length(p_input::text)>16000 then raise exception 'INVALID_MIRROR';end if;
 select * into v_old from demo_payment.story_payments where id=v_id for update;
 if found then
 if v_old.data is distinct from v_details or v_old.session_id<>v_session
 then raise exception 'MIRROR_CONFLICT';end if;
 return jsonb_build_object('id',v_id,'mirrored',true,'replayed',true);
 end if;
 insert into demo_payment.story_payments(id,session_id,service_code,amount_minor,data,status,created_at)
 values(v_id,v_session,p_input->>'service',(p_input->>'amountMinor')::bigint,
 v_details,v_status,(p_input->>'createdAt')::timestamptz);
 insert into demo_payment.story_notifications(payment_id,event_type)
 values(v_id,'NEW_SIMULATED_PAYMENT');
 return jsonb_build_object('id',v_id,'mirrored',true,'replayed',false);
end;$function$


CREATE OR REPLACE FUNCTION public.demo_story1_office_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'service',x.service_code,
  'amountMinor',x.amount_minor,'status',x.status,'createdAt',x.created_at,
  'details',x.data->'details') order by x.created_at desc)
 from (select * from demo_payment.story_payments order by created_at desc limit 100) x),'[]'::jsonb);
end;$function$


CREATE OR REPLACE FUNCTION public.demo_story1_office_notices()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'paymentId',n.payment_id,
  'type',n.event_type,'createdAt',n.created_at) order by n.id desc)
 from (select * from demo_payment.story_notifications order by id desc limit 100) n),'[]'::jsonb);
end;$function$

revoke all on function public.demo_story1_mirror(jsonb), public.demo_story1_office_list(), public.demo_story1_office_notices() from public;
grant execute on function public.demo_story1_mirror(jsonb), public.demo_story1_office_list(), public.demo_story1_office_notices() to anon,authenticated;
