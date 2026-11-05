-- Additive, fail-closed officer Audit status history. No taxpayer records,
-- officer identities, logins, policies or verified source claims are created.
-- Run only against the existing Office Audit schema with release backup.
begin;

alter table public.office_audit_events
  add column if not exists review_note text;

-- Existing append-only trigger is retained and hardened, not bypassed.
create or replace function office_audit_private.record_candidate_status()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,office_audit_private as $$
declare
  v_note text;
  v_source_kind text;
  v_permitted boolean;
begin
  if tg_op <> 'UPDATE' or old.audit_status is not distinct from new.audit_status then
    return new;
  end if;
  v_note := nullif(btrim(current_setting('office_audit.status_note', true)), '');
  if auth.uid() is null or v_note is null or char_length(v_note) not between 10 and 500 then
    raise exception 'Verified officer and Audit reason (10–500 characters) required' using errcode='28000';
  end if;
  v_permitted :=
    (old.audit_status='Not Started' and new.audit_status='Assigned') or
    (old.audit_status='Assigned' and new.audit_status='Verifying') or
    (old.audit_status='Verifying' and new.audit_status in ('Evidence Pending','Ready for Review')) or
    (old.audit_status='Evidence Pending' and new.audit_status in ('Verifying','Ready for Review')) or
    (old.audit_status='Ready for Review' and new.audit_status in ('Verifying','Second Review')) or
    (old.audit_status='Second Review' and new.audit_status='Ready for Review');
  -- Final closure requires an independently approved second-officer signing
  -- contract. It is intentionally NOT authorized by the status selector alone.
  if not coalesce(v_permitted, false) then
    raise exception 'Audit transition requires authorized review workflow' using errcode='42501';
  end if;
  select b.source_kind into v_source_kind
    from public.office_audit_batches b where b.id=new.batch_id;
  if v_source_kind is null then
    raise exception 'Audit source batch is missing' using errcode='23503';
  end if;
  insert into public.office_audit_events(
    candidate_id,actor_id,event_type,previous_status,new_status,source_kind,review_note
  ) values (
    new.id,auth.uid(),'status_change',old.audit_status,new.audit_status,v_source_kind,v_note
  );
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
revoke all on function office_audit_private.record_candidate_status() from public,anon,authenticated;

-- Caller remains the authenticated PostgREST JWT role: RLS enforces officer
-- membership, zone and circle. The SQL transaction owns note + status + event.
create or replace function public.office_audit_change_status(
  p_candidate_id uuid, p_expected_version integer,
  p_next_status text, p_note text
) returns table(candidate_id uuid, version integer, audit_status text)
language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare
  v_id uuid;
  v_version integer;
  v_status text;
  v_note text;
begin
  if auth.uid() is null then
    raise exception 'Authenticated Audit officer required' using errcode='28000';
  end if;
  v_note := regexp_replace(btrim(coalesce(p_note,'')), '[[:space:]]+', ' ', 'g');
  if p_candidate_id is null or p_expected_version is null or p_expected_version < 1
     or p_next_status is null or p_next_status='Closed'
     or char_length(v_note) not between 10 and 500 then
    raise exception 'Invalid Audit status, version or reason' using errcode='22023';
  end if;
  perform set_config('office_audit.status_note',v_note,true);
  update public.office_audit_candidates c
    set audit_status=p_next_status
    where c.id=p_candidate_id and c.version=p_expected_version
      and c.audit_status is distinct from p_next_status
    returning c.id,c.version,c.audit_status into v_id,v_version,v_status;
  if v_id is null or v_version <> p_expected_version+1 or v_status <> p_next_status then
    raise exception 'Audit status conflict or no authorized candidate; reload source'
      using errcode='40001';
  end if;
  return query select v_id,v_version,v_status;
end $$;
revoke all on function public.office_audit_change_status(uuid,integer,text,text)
  from public,anon;
grant execute on function public.office_audit_change_status(uuid,integer,text,text)
  to authenticated;

commit;