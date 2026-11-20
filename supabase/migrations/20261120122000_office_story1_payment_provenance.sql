BEGIN;

-- Keep the historical Taxpayer JSON payload byte-for-byte unchanged. Provenance
-- is a private Office sidecar attached to the existing payment parent.
CREATE TABLE demo_payment.story_payment_provenance (
  payment_id uuid PRIMARY KEY
    REFERENCES demo_payment.story_payments(id) ON DELETE RESTRICT,
  source_project text NOT NULL
    CHECK (source_project IN ('original','v2')),
  source_parent_id uuid,
  source_revision text NOT NULL
    CHECK (source_revision ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE demo_payment.story_payment_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE demo_payment.story_payment_provenance FORCE ROW LEVEL SECURITY;
REVOKE ALL ON demo_payment.story_payment_provenance
  FROM PUBLIC,anon,authenticated,service_role;

COMMENT ON TABLE demo_payment.story_payment_provenance IS
  'Private immutable source project, Pay Again parent and lowercase SHA-256 of the canonical Taxpayer {id,data,status,createdAt} readback for an existing synthetic Story 1 Office payment parent. Historical payment JSON is unchanged.';

CREATE OR REPLACE FUNCTION public.demo_story1_mirror(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_old demo_payment.story_payments%rowtype;
  v_provenance demo_payment.story_payment_provenance%rowtype;
  v_id uuid;
  v_session uuid;
  v_status text;
  v_details jsonb;
  v_source_project text;
  v_source_parent_id uuid;
  v_source_parent_text text;
  v_source_revision text;
  v_has_provenance boolean;
  v_result jsonb;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input)<>'object' THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;
  v_id:=(p_input->>'id')::uuid;
  v_session:=(p_input->>'sessionId')::uuid;
  v_status:=p_input->>'status';
  v_details:=p_input->'data';
  v_source_project:=p_input->>'sourceProject';
  v_source_parent_text:=p_input->>'sourceParentId';
  v_source_revision:=p_input->>'sourceRevision';
  v_has_provenance:=p_input ? 'sourceProject' OR p_input ? 'sourceParentId' OR p_input ? 'sourceRevision';

  IF v_has_provenance AND (
    NOT (p_input ? 'sourceProject') OR NOT (p_input ? 'sourceParentId') OR
    NOT (p_input ? 'sourceRevision') OR
    v_source_project IS NULL OR v_source_project NOT IN ('original','v2') OR
    v_source_revision IS NULL OR v_source_revision !~ '^[0-9a-f]{64}$' OR
    (v_source_parent_text IS NOT NULL AND
      v_source_parent_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
  ) THEN
    RAISE EXCEPTION 'INVALID_PROVENANCE';
  END IF;
  IF v_source_parent_text IS NOT NULL THEN
    v_source_parent_id:=v_source_parent_text::uuid;
  END IF;

  IF v_status IS DISTINCT FROM 'SIMULATED_SUCCESS' OR
     jsonb_typeof(v_details) IS DISTINCT FROM 'object' OR
     length(p_input::text) > (CASE
       WHEN p_input->>'service' IN ('OTHER_TAX_PAYMENT','TAX_WITH_RETURN') AND
            p_input->'data'->'details'->>'combinedPayment'='true' THEN 800000 ELSE 16000 END) THEN
    RAISE EXCEPTION 'INVALID_MIRROR';
  END IF;

  SELECT * INTO v_old FROM demo_payment.story_payments WHERE id=v_id FOR UPDATE;
  IF FOUND THEN
    IF v_old.data IS DISTINCT FROM v_details OR v_old.session_id<>v_session THEN
      RAISE EXCEPTION 'MIRROR_CONFLICT';
    END IF;
    IF v_has_provenance THEN
      INSERT INTO demo_payment.story_payment_provenance(
        payment_id,source_project,source_parent_id,source_revision
      ) VALUES(v_id,v_source_project,v_source_parent_id,v_source_revision)
      ON CONFLICT(payment_id) DO NOTHING;
      SELECT * INTO v_provenance FROM demo_payment.story_payment_provenance
        WHERE payment_id=v_id;
      IF NOT FOUND OR v_provenance.source_project IS DISTINCT FROM v_source_project OR
         v_provenance.source_parent_id IS DISTINCT FROM v_source_parent_id OR
         v_provenance.source_revision IS DISTINCT FROM v_source_revision THEN
        RAISE EXCEPTION 'MIRROR_CONFLICT';
      END IF;
    END IF;
    v_result:=jsonb_build_object('id',v_id,'mirrored',true,'replayed',true);
  ELSE
    INSERT INTO demo_payment.story_payments(
      id,session_id,service_code,amount_minor,data,status,created_at
    ) VALUES(
      v_id,v_session,p_input->>'service',(p_input->>'amountMinor')::bigint,
      v_details,v_status,(p_input->>'createdAt')::timestamptz
    );
    IF v_has_provenance THEN
      INSERT INTO demo_payment.story_payment_provenance(
        payment_id,source_project,source_parent_id,source_revision
      ) VALUES(v_id,v_source_project,v_source_parent_id,v_source_revision);
    END IF;
    INSERT INTO demo_payment.story_notifications(payment_id,event_type)
      VALUES(v_id,'NEW_SIMULATED_PAYMENT');
    v_result:=jsonb_build_object('id',v_id,'mirrored',true,'replayed',false);
  END IF;

  IF v_has_provenance THEN
    v_result:=v_result||jsonb_build_object(
      'sourceProject',v_source_project,
      'sourceParentId',v_source_parent_id,
      'sourceRevision',v_source_revision
    );
  END IF;
  RETURN v_result;
END;
$function$;

-- The existing Edge remains the only caller allowed to persist a mirror.
REVOKE ALL ON FUNCTION public.demo_story1_mirror(jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.demo_story1_mirror(jsonb) TO service_role;

-- Preserve the existing officer guard and add provenance to the same parent
-- readback. Unmapped historical rows return null markers and are not backfilled.
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
    page_rows.item||jsonb_build_object(
      'certificateReference','SK-PC-'||(page_rows.item->>'id'),
      'sourceProject',provenance.source_project,
      'sourceParentId',provenance.source_parent_id,
      'sourceRevision',provenance.source_revision
    ) ORDER BY page_rows.ordinal
  ),'[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(coalesce(v_page->'items','[]'::jsonb))
    WITH ORDINALITY AS page_rows(item,ordinal)
  LEFT JOIN demo_payment.story_payment_provenance provenance
    ON provenance.payment_id=(page_rows.item->>'id')::uuid;
  RETURN jsonb_set(v_page,'{items}',v_items,true);
END;
$function$;

REVOKE ALL ON FUNCTION public.demo_story1_office_payment_page(integer,integer)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.payment_v1_office_guarded_story_page(integer,integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payment_v1_office_guarded_story_page(integer,integer)
  TO authenticated;

COMMIT;
