-- F-114/F-116/F-117: replay must match the entire immutable Office parent
-- envelope, not merely the JSON details and source session. Keep the current
-- source-verified ingress, size gates, authorizations and original rows intact.
BEGIN;
DO $office_replay_envelope$
DECLARE
  v_source text;
  v_old text := 'if v_old.data is distinct from v_details or v_old.session_id<>v_session';
  v_new text := 'if v_old.data is distinct from v_details or v_old.session_id<>v_session
  or v_old.service_code is distinct from p_input->>''service''
  or v_old.amount_minor is distinct from (p_input->>''amountMinor'')::bigint
  or v_old.status is distinct from v_status
  or v_old.created_at is distinct from (p_input->>''createdAt'')::timestamptz';
BEGIN
  v_source := pg_catalog.pg_get_functiondef('public.demo_story1_mirror(jsonb)'::regprocedure);
  IF position(v_new IN v_source)>0 THEN RETURN; END IF;
  IF position(v_old IN v_source)=0 THEN
    RAISE EXCEPTION 'OFFICE_MIRROR_REPLAY_SOURCE_UNEXPECTED';
  END IF;
  EXECUTE pg_catalog.replace(v_source,v_old,v_new);
  IF position(v_new IN
    pg_catalog.pg_get_functiondef('public.demo_story1_mirror(jsonb)'::regprocedure))=0
  THEN RAISE EXCEPTION 'OFFICE_MIRROR_REPLAY_INSTALL_FAILED'; END IF;
END;
$office_replay_envelope$;
COMMIT;
