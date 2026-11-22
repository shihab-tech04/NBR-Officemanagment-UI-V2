-- Office mirror parity for the 30 approved fictional Taxpayer accounts.
-- The source Taxpayer Edge's signed 120-second authorization proof, source SQL
-- readback and Office service-role-only mirror remain mandatory. This alters
-- only the existing synthetic mirror's restricted actor allowlist and private
-- audit readback; it does not widen any financial, Auth, RLS or officer role.
-- The legacy user1-user10 rows, audit history and status transition semantics
-- are preserved. No government tax credit or real payment is created.

ALTER TABLE demo_payment.authorization_audit
  DROP CONSTRAINT IF EXISTS authorization_audit_payer_id_check;
ALTER TABLE demo_payment.authorization_audit
  DROP CONSTRAINT IF EXISTS authorization_audit_taxpayer_id_check;
ALTER TABLE demo_payment.authorization_audit
  ADD CONSTRAINT authorization_audit_payer_id_check
    CHECK (payer_id ~ '^user([1-9]|[12][0-9]|30)$'),
  ADD CONSTRAINT authorization_audit_taxpayer_id_check
    CHECK (taxpayer_id ~ '^user([1-9]|[12][0-9]|30)$');
ALTER TABLE demo_payment.authorization_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE demo_payment.authorization_audit FROM PUBLIC, anon, authenticated;

-- Preserve the exact deployed mirror procedure; only extend the two actor
-- validation expressions to the approved 30 synthetic identities.
CREATE OR REPLACE FUNCTION public.demo_auth_office_mirror(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id uuid; v_row demo_payment.authorization_audit%rowtype; v_resends int;
begin
 v_resends:=coalesce((p_input->>'codeResends')::int,0);
 if coalesce(p_input->>'id','') !~ '^[0-9a-fA-F-]{36}$'
   or coalesce(p_input->>'payerId','') !~ '^user([1-9]|[12][0-9]|30)
   or coalesce(p_input->>'taxpayerId','') !~ '^user([1-9]|10)$'
   or coalesce(p_input->>'status','') not in ('PENDING','CODE_ISSUED','ACTIVE','DENIED','REVOKED','EXPIRED','CANCELLED')
   or v_resends not between 0 and 3
   then raise exception 'INVALID_AUTHORIZATION_SNAPSHOT';end if;
 v_id:=(p_input->>'id')::uuid;
 insert into demo_payment.authorization_audit
  (id,payer_id,taxpayer_id,status,requested_at,confirmed_at,revoked_at,code_resends,code_sent_at)
 values(v_id,p_input->>'payerId',p_input->>'taxpayerId',p_input->>'status',
   (p_input->>'requestedAt')::timestamptz,
   nullif(p_input->>'confirmedAt','')::timestamptz,
   nullif(p_input->>'revokedAt','')::timestamptz,
   v_resends,nullif(p_input->>'codeSentAt','')::timestamptz)
 on conflict(id) do update set status=excluded.status,confirmed_at=excluded.confirmed_at,
   revoked_at=excluded.revoked_at,code_resends=excluded.code_resends,
   code_sent_at=excluded.code_sent_at,synced_at=now()
 returning * into v_row;
 return jsonb_build_object('id',v_row.id,'status',v_row.status,
   'codeResends',v_row.code_resends,'syncedAt',v_row.synced_at);
end;$function$

   or coalesce(p_input->>'taxpayerId','') !~ '^user([1-9]|[12][0-9]|30)
   or coalesce(p_input->>'status','') not in ('PENDING','CODE_ISSUED','ACTIVE','DENIED','REVOKED','EXPIRED','CANCELLED')
   or v_resends not between 0 and 3
   then raise exception 'INVALID_AUTHORIZATION_SNAPSHOT';end if;
 v_id:=(p_input->>'id')::uuid;
 insert into demo_payment.authorization_audit
  (id,payer_id,taxpayer_id,status,requested_at,confirmed_at,revoked_at,code_resends,code_sent_at)
 values(v_id,p_input->>'payerId',p_input->>'taxpayerId',p_input->>'status',
   (p_input->>'requestedAt')::timestamptz,
   nullif(p_input->>'confirmedAt','')::timestamptz,
   nullif(p_input->>'revokedAt','')::timestamptz,
   v_resends,nullif(p_input->>'codeSentAt','')::timestamptz)
 on conflict(id) do update set status=excluded.status,confirmed_at=excluded.confirmed_at,
   revoked_at=excluded.revoked_at,code_resends=excluded.code_resends,
   code_sent_at=excluded.code_sent_at,synced_at=now()
 returning * into v_row;
 return jsonb_build_object('id',v_row.id,'status',v_row.status,
   'codeResends',v_row.code_resends,'syncedAt',v_row.synced_at);
end;$function$

   or coalesce(p_input->>'status','') not in ('PENDING','CODE_ISSUED','ACTIVE','DENIED','REVOKED','EXPIRED','CANCELLED')
   or v_resends not between 0 and 3
   then raise exception 'INVALID_AUTHORIZATION_SNAPSHOT';end if;
 v_id:=(p_input->>'id')::uuid;
 insert into demo_payment.authorization_audit
  (id,payer_id,taxpayer_id,status,requested_at,confirmed_at,revoked_at,code_resends,code_sent_at)
 values(v_id,p_input->>'payerId',p_input->>'taxpayerId',p_input->>'status',
   (p_input->>'requestedAt')::timestamptz,
   nullif(p_input->>'confirmedAt','')::timestamptz,
   nullif(p_input->>'revokedAt','')::timestamptz,
   v_resends,nullif(p_input->>'codeSentAt','')::timestamptz)
 on conflict(id) do update set status=excluded.status,confirmed_at=excluded.confirmed_at,
   revoked_at=excluded.revoked_at,code_resends=excluded.code_resends,
   code_sent_at=excluded.code_sent_at,synced_at=now()
 returning * into v_row;
 return jsonb_build_object('id',v_row.id,'status',v_row.status,
   'codeResends',v_row.code_resends,'syncedAt',v_row.synced_at);
end;$function$;
REVOKE ALL ON FUNCTION public.demo_auth_office_mirror(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demo_auth_office_mirror(jsonb) TO service_role;

-- Retain the full original projection, column order, SQL/RLS semantics and
-- SECURITY INVOKER while including audit rows for the same approved actors.
CREATE OR REPLACE VIEW demo_payment.authorized_allocation_audit
WITH (security_invoker=true) AS
 SELECT p.id AS payment_id,
    p.created_at,
    p.status AS payment_status,
    (p.data -> 'details'::text) ->> 'payerId'::text AS payer_id,
    line.value ->> 'beneficiary'::text AS beneficiary_id,
    line.value ->> 'authorizationId'::text AS authorization_id,
    line.value ->> 'category'::text AS payment_category,
    line.value ->> 'assessmentYear'::text AS assessment_year,
    (line.value ->> 'amountMinor'::text)::bigint AS amount_minor
   FROM demo_payment.story_payments p
     CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof((p.data -> 'details'::text) -> 'lines'::text) = 'array'::text THEN (p.data -> 'details'::text) -> 'lines'::text
            ELSE '[]'::jsonb
        END) line(value)
  WHERE ((p.data -> 'details'::text) ->> 'payerId'::text) ~ '^user([1-9]|[12][0-9]|30)::text;::text;
REVOKE ALL ON demo_payment.authorized_allocation_audit
  FROM PUBLIC, anon, authenticated;
