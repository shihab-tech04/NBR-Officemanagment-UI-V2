-- Officer Audit v3: evidence, findings and independent second review.
-- Additive contract; no identities, permissions, source records or data invented.
begin;

create table if not exists public.office_audit_evidence (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.office_audit_candidates(id),
  signal_code text not null check(signal_code ~ '^R-[A-E][1-9]$'),
  evidence_ref text not null check (length(btrim(evidence_ref)) between 8 and 512),
  verification_status text not null default 'Pending'
    check(verification_status in ('Pending','Verified')),
  verification_note text,
  submitted_by uuid not null references auth.users(id),
  verified_by uuid references auth.users(id),
  submitted_at timestamptz not null default now(),
  verified_at timestamptz,
  constraint office_audit_evidence_verified_consistent check (
    (verification_status='Pending' and verified_by is null and verified_at is null)
    or (verification_status='Verified' and verified_by is not null and verified_at is not null
        and length(btrim(verification_note)) between 10 and 500)
  )
);

create table if not exists public.office_audit_findings (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.office_audit_candidates(id),
  evidence_id uuid not null references public.office_audit_evidence(id),
  signal_code text not null check(signal_code ~ '^R-[A-E][1-9]$'),
  finding_summary text not null check(length(btrim(finding_summary)) between 20 and 2000),
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now()
);

create table if not exists public.office_audit_second_reviews (
  id bigint generated always as identity primary key,
  candidate_id uuid not null references public.office_audit_candidates(id),
  finding_id uuid not null references public.office_audit_findings(id),
  reviewer_id uuid not null references auth.users(id),
  action text not null check(action in ('sign_off','request_rework')),
  review_note text not null check(length(btrim(review_note)) between 20 and 2000),
  previous_version integer not null check(previous_version >= 1),
  next_version integer not null check(next_version=previous_version+1),
  created_at timestamptz not null default now()
);

alter table public.office_audit_evidence enable row level security;
alter table public.office_audit_findings enable row level security;
alter table public.office_audit_second_reviews enable row level security;

-- Existing candidates RLS acts as the jurisdiction authority for every read.
create policy office_audit_evidence_read on public.office_audit_evidence
  for select to authenticated using (
    exists(select 1 from public.office_audit_candidates c where c.id=candidate_id)
  );
create policy office_audit_findings_read on public.office_audit_findings
  for select to authenticated using (
    exists(select 1 from public.office_audit_candidates c where c.id=candidate_id)
  );
create policy office_audit_second_reviews_read on public.office_audit_second_reviews
  for select to authenticated using (
    exists(select 1 from public.office_audit_candidates c where c.id=candidate_id)
  );
-- DCT/circle officer only; no SuperAdmin, preview admin, or Range authoring.
create policy office_audit_evidence_submit on public.office_audit_evidence
  for insert to authenticated with check (
    submitted_by=auth.uid() and verification_status='Pending'
    and exists(select 1 from public.office_audit_candidates c
      join public.office_audit_memberships m on m.user_id=auth.uid()
      where c.id=candidate_id and m.active and m.office_role='circle_user'
      and m.zone=c.zone and m.circle=c.circle)
  );
create policy office_audit_evidence_verify on public.office_audit_evidence
  for update to authenticated using (
    exists(select 1 from public.office_audit_candidates c
      join public.office_audit_memberships m on m.user_id=auth.uid()
      where c.id=candidate_id and m.active and m.office_role='circle_user'
      and m.zone=c.zone and m.circle=c.circle)
  ) with check (
    exists(select 1 from public.office_audit_candidates c
      join public.office_audit_memberships m on m.user_id=auth.uid()
      where c.id=candidate_id and m.active and m.office_role='circle_user'
      and m.zone=c.zone and m.circle=c.circle)
  );
create policy office_audit_findings_submit on public.office_audit_findings
  for insert to authenticated with check (
    submitted_by=auth.uid() and exists(
      select 1 from public.office_audit_candidates c
      join public.office_audit_memberships m on m.user_id=auth.uid()
      where c.id=candidate_id and m.active and m.office_role='circle_user'
      and m.zone=c.zone and m.circle=c.circle)
  );
create policy office_audit_second_review_submit on public.office_audit_second_reviews
  for insert to authenticated with check (
    reviewer_id=auth.uid()
    and exists(select 1 from public.office_audit_candidates c
      join public.office_audit_memberships m on m.user_id=auth.uid()
      where c.id=candidate_id and m.active and m.office_role='range_user'
      and m.zone=c.zone and m.circle=c.circle)
  );


-- Deny direct table writes, even where RLS permits the underlying officer
-- jurisdiction. Workflow RPCs set a transaction-scoped marker only after
-- checking linked source records, signal, role and state.
create or replace function office_audit_private.audit_workflow_insert_guard()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public,office_audit_private as $audit$
declare v_expected text;
begin
  v_expected := case tg_table_name
    when 'office_audit_evidence' then 'office_audit.insert_evidence'
    when 'office_audit_findings' then 'office_audit.submit_finding'
    when 'office_audit_second_reviews' then 'office_audit.insert_review'
    else '' end;
  if v_expected='' or current_setting(v_expected,true) is distinct from 'authorized' then
    raise exception 'Use the authorized Audit workflow' using errcode='42501';
  end if;
  if tg_table_name='office_audit_findings' and not exists(
    select 1 from public.office_audit_evidence e where e.id=new.evidence_id
      and e.candidate_id=new.candidate_id and e.signal_code=new.signal_code
      and e.verification_status='Verified'
  ) then
    raise exception 'Finding must reference verified same-case signal evidence' using errcode='42501';
  end if;
  return new;
end $audit$;
create trigger office_audit_insert_evidence_guard before insert on public.office_audit_evidence
for each row execute function office_audit_private.audit_workflow_insert_guard();
create trigger office_audit_insert_finding_guard before insert on public.office_audit_findings
for each row execute function office_audit_private.audit_workflow_insert_guard();
create trigger office_audit_insert_review_guard before insert on public.office_audit_second_reviews
for each row execute function office_audit_private.audit_workflow_insert_guard();
revoke all on function office_audit_private.audit_workflow_insert_guard() from public,anon,authenticated;

revoke all on public.office_audit_evidence,public.office_audit_findings,
  public.office_audit_second_reviews from public,anon;
grant select,insert on public.office_audit_evidence to authenticated;
grant update (verification_status,verification_note,verified_by,verified_at)
  on public.office_audit_evidence to authenticated;
grant select,insert on public.office_audit_findings to authenticated;
grant select,insert on public.office_audit_second_reviews to authenticated;

-- These functions use the invoking officer's JWT/RLS, not service-role bypass.
create or replace function public.office_audit_record_evidence(
  p_candidate_id uuid,p_signal text,p_reference text
) returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_candidate public.office_audit_candidates%rowtype; v_id uuid;
begin
  select * into v_candidate from public.office_audit_candidates where id=p_candidate_id;
  if not found or auth.uid() is null or
     not exists(select 1 from public.office_audit_memberships m
       where m.user_id=auth.uid() and m.active and m.office_role='circle_user'
       and m.zone=v_candidate.zone and m.circle=v_candidate.circle)
    or not (p_signal=any(v_candidate.signals))
    or v_candidate.audit_status not in ('Verifying','Evidence Pending') then
    raise exception 'Case, signal or DCT authority unavailable' using errcode='42501';
  end if;
  perform set_config('office_audit.insert_evidence','authorized',true);
  insert into public.office_audit_evidence(candidate_id,signal_code,evidence_ref,submitted_by)
    values(p_candidate_id,p_signal,btrim(p_reference),auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function office_audit_private.enforce_evidence_verification()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public,office_audit_private as $$
begin
  if current_setting('office_audit.verify_evidence',true) is distinct from 'authorized'
     or old.candidate_id is distinct from new.candidate_id
     or old.submitted_by is distinct from new.submitted_by
     or old.signal_code is distinct from new.signal_code
     or old.evidence_ref is distinct from new.evidence_ref
     or old.verification_status <> 'Pending'
     or new.verification_status <> 'Verified' then
    raise exception 'Evidence changes must use verified officer workflow' using errcode='42501';
  end if;
  return new;
end $$;
create trigger office_audit_verify_evidence_guard before update on public.office_audit_evidence
for each row execute function office_audit_private.enforce_evidence_verification();

create or replace function public.office_audit_verify_evidence(
  p_evidence_id uuid,p_note text
) returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_evidence public.office_audit_evidence%rowtype;
        v_candidate public.office_audit_candidates%rowtype;
begin
  select * into v_evidence from public.office_audit_evidence where id=p_evidence_id for update;
  if not found then raise exception 'Evidence not accessible' using errcode='42501'; end if;
  select * into v_candidate from public.office_audit_candidates where id=v_evidence.candidate_id;
  if v_evidence.verification_status<>'Pending' or
     length(btrim(coalesce(p_note,''))) not between 10 and 500 or
     not exists(select 1 from public.office_audit_memberships m
      where m.user_id=auth.uid() and m.active and m.office_role='circle_user'
      and m.zone=v_candidate.zone and m.circle=v_candidate.circle) then
    raise exception 'DCT verification, status or note invalid' using errcode='42501';
  end if;
  perform set_config('office_audit.verify_evidence','authorized',true);
  update public.office_audit_evidence set verification_status='Verified',
    verification_note=btrim(p_note),verified_by=auth.uid(),verified_at=now()
    where id=p_evidence_id and verification_status='Pending';
  if not found then raise exception 'Evidence conflict' using errcode='40001'; end if;
  return p_evidence_id;
end $$;

create or replace function public.office_audit_submit_finding(
  p_candidate_id uuid,p_evidence_id uuid,p_signal text,p_finding text
) returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_case public.office_audit_candidates%rowtype; v_id uuid;
begin
  select * into v_case from public.office_audit_candidates where id=p_candidate_id for update;
  if not found or v_case.audit_status not in ('Verifying','Evidence Pending') or
    length(btrim(coalesce(p_finding,''))) not between 20 and 2000 or
    not exists(select 1 from public.office_audit_memberships m
      where m.user_id=auth.uid() and m.active and m.office_role='circle_user'
      and m.zone=v_case.zone and m.circle=v_case.circle) or
    not exists(select 1 from public.office_audit_evidence e
      where e.id=p_evidence_id and e.candidate_id=p_candidate_id
      and e.signal_code=p_signal and e.verification_status='Verified') then
    raise exception 'Verified linked signal, evidence and DCT authority required' using errcode='42501';
  end if;
  perform set_config('office_audit.submit_finding','authorized',true);
  insert into public.office_audit_findings(
    candidate_id,evidence_id,signal_code,finding_summary,submitted_by)
    values(p_candidate_id,p_evidence_id,p_signal,btrim(p_finding),auth.uid())
    returning id into v_id;
  perform set_config('office_audit.status_note',left(btrim(p_finding),500),true);
  update public.office_audit_candidates set audit_status='Ready for Review'
    where id=p_candidate_id and version=v_case.version;
  if not found then raise exception 'Case status conflict' using errcode='40001'; end if;
  return v_id;
end $$;

-- Preserve the versioned status trigger; final closure is valid only with
-- a Range Officer's separate, evidence-backed second-review action.
create or replace function office_audit_private.record_candidate_status()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,office_audit_private as $$
declare v_note text; v_kind text; v_normal boolean;
begin
  if tg_op<>'UPDATE' or old.audit_status is not distinct from new.audit_status then
    return new;
  end if;
  v_note:=nullif(btrim(current_setting('office_audit.status_note',true)),'');
  if auth.uid() is null or v_note is null or length(v_note) not between 10 and 500 then
    raise exception 'Verified officer and 10–500 character note required' using errcode='28000';
  end if;
  v_normal:=
    (old.audit_status='Not Started' and new.audit_status='Assigned') or
    (old.audit_status='Assigned' and new.audit_status='Verifying') or
    (old.audit_status='Verifying' and new.audit_status in ('Evidence Pending','Ready for Review')) or
    (old.audit_status='Evidence Pending' and new.audit_status in ('Verifying','Ready for Review')) or
    (old.audit_status='Ready for Review' and new.audit_status='Verifying') or
    (old.audit_status='Ready for Review' and new.audit_status='Second Review') or
    (old.audit_status='Second Review' and new.audit_status='Ready for Review');
  if new.audit_status='Ready for Review' and not exists(
    select 1 from public.office_audit_findings f
    join public.office_audit_evidence e on e.id=f.evidence_id
    where f.candidate_id=new.id and e.verification_status='Verified'
      and f.signal_code=e.signal_code) then
    raise exception 'Verified evidence and Finding required' using errcode='42501';
  end if;
  if new.audit_status='Closed' and old.audit_status in ('Ready for Review','Second Review')
     and current_setting('office_audit.review_action',true)='sign_off' and
     exists(select 1 from public.office_audit_memberships m where
       m.user_id=auth.uid() and m.active and m.office_role='range_user'
       and m.zone=new.zone and m.circle=new.circle) then
    v_normal:=true;
  end if;
  -- Rework from Second Review must be requested by the independent Range
  -- Officer workflow, not through the general DCT status selector.
  if old.audit_status='Second Review' and new.audit_status='Verifying'
     and current_setting('office_audit.review_action',true)='request_rework'
     and exists(select 1 from public.office_audit_memberships m
       where m.user_id=auth.uid() and m.active and m.office_role='range_user'
         and m.zone=new.zone and m.circle=new.circle) then
    v_normal:=true;
  end if;
  if not coalesce(v_normal,false) then
    raise exception 'Audit transition requires appropriate review authority' using errcode='42501';
  end if;
  select source_kind into v_kind from public.office_audit_batches where id=new.batch_id;
  if v_kind is null then raise exception 'Missing source batch' using errcode='23503'; end if;
  insert into public.office_audit_events(candidate_id,actor_id,event_type,
    previous_status,new_status,source_kind,review_note)
    values(new.id,auth.uid(),'status_change',old.audit_status,new.audit_status,v_kind,v_note);
  new.version:=old.version+1;new.updated_at:=now();
  return new;
end $$;
revoke all on function office_audit_private.record_candidate_status() from public,anon,authenticated;

create or replace function public.office_audit_second_review(
  p_candidate_id uuid,p_expected_version integer,p_action text,p_note text
) returns table(candidate_id uuid,version integer,audit_status text)
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_case public.office_audit_candidates%rowtype;
  v_finding public.office_audit_findings%rowtype;
  v_target text;
begin
  select * into v_case from public.office_audit_candidates where id=p_candidate_id for update;
  if not found or p_expected_version is null or v_case.version<>p_expected_version
     or p_action not in ('sign_off','request_rework')
     or v_case.audit_status not in ('Ready for Review','Second Review')
     or length(btrim(coalesce(p_note,''))) not between 20 and 2000
     or lower(regexp_replace(btrim(coalesce(p_note,'')),
          '[[:space:]]+', ' ', 'g')) ~ '^reviewed( and approved)?\\.?
      m.user_id=auth.uid() and m.active and m.office_role='range_user'
      and m.zone=v_case.zone and m.circle=v_case.circle) then
    raise exception 'Authorized Range Officer review and current version required' using errcode='42501';
  end if;
  select * into v_finding from public.office_audit_findings where candidate_id=p_candidate_id
    order by submitted_at desc, id desc limit 1;
  if not found or v_finding.submitted_by=auth.uid() or
     not exists(select 1 from public.office_audit_evidence e
      where e.id=v_finding.evidence_id and e.candidate_id=p_candidate_id
      and e.signal_code=v_finding.signal_code and e.verification_status='Verified') then
    raise exception 'Independent reviewer and verified signal-linked finding required' using errcode='42501';
  end if;
  v_target:=case when p_action='sign_off' then 'Closed' else 'Verifying' end;
  perform set_config('office_audit.status_note',left(btrim(p_note),500),true);
  perform set_config('office_audit.review_action',p_action,true);
  update public.office_audit_candidates c set audit_status=v_target
    where c.id=p_candidate_id and c.version=p_expected_version;
  if not found then raise exception 'Case conflict' using errcode='40001'; end if;
  perform set_config('office_audit.insert_review','authorized',true);
  insert into public.office_audit_second_reviews(candidate_id,finding_id,reviewer_id,
    action,review_note,previous_version,next_version)
    values(p_candidate_id,v_finding.id,auth.uid(),p_action,btrim(p_note),
      p_expected_version,p_expected_version+1);
  return query select p_candidate_id,p_expected_version+1,v_target;
end $$;

-- Record evidence and Finding actions in the existing append-only Audit Trail.
create or replace function office_audit_private.log_case_material_event()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,office_audit_private as $audit$
declare v_kind text; v_event text; v_note text;
begin
  if auth.uid() is null then raise exception 'Verified officer required' using errcode='28000'; end if;
  if tg_table_name='office_audit_evidence' then
    if tg_op='UPDATE' and old.verification_status is not distinct from new.verification_status
      then return new; end if;
    v_event:=case when tg_op='INSERT' then 'evidence_recorded' else 'evidence_verified' end;
    v_note:=case when tg_op='INSERT' then 'Evidence reference registered for '||new.signal_code
      else left(coalesce(new.verification_note,'Evidence verified'),500) end;
  else
    v_event:='finding_submitted';
    v_note:=left(new.signal_code||': '||new.finding_summary,500);
  end if;
  select b.source_kind into v_kind from public.office_audit_candidates c
    join public.office_audit_batches b on b.id=c.batch_id
    where c.id=new.candidate_id;
  if v_kind is null then raise exception 'Audit source batch is missing' using errcode='23503'; end if;
  insert into public.office_audit_events(
    candidate_id,actor_id,event_type,previous_status,new_status,source_kind,review_note
  ) values(new.candidate_id,auth.uid(),v_event,null,null,v_kind,v_note);
  return new;
end $audit$;
create trigger office_audit_evidence_event after insert or update
  on public.office_audit_evidence for each row
  execute function office_audit_private.log_case_material_event();
create trigger office_audit_finding_event after insert
  on public.office_audit_findings for each row
  execute function office_audit_private.log_case_material_event();
revoke all on function office_audit_private.log_case_material_event()
  from public,anon,authenticated;

revoke all on function public.office_audit_record_evidence(uuid,text,text),
public.office_audit_verify_evidence(uuid,text),
public.office_audit_submit_finding(uuid,uuid,text,text),
public.office_audit_second_review(uuid,integer,text,text) from public,anon;
grant execute on function public.office_audit_record_evidence(uuid,text,text),
public.office_audit_verify_evidence(uuid,text),
public.office_audit_submit_finding(uuid,uuid,text,text),
public.office_audit_second_review(uuid,integer,text,text) to authenticated;
commit;
     or not exists(select 1 from public.office_audit_memberships m where
      m.user_id=auth.uid() and m.active and m.office_role='range_user'
      and m.zone=v_case.zone and m.circle=v_case.circle) then
    raise exception 'Authorized Range Officer review and current version required' using errcode='42501';
  end if;
  select * into v_finding from public.office_audit_findings where candidate_id=p_candidate_id
    order by submitted_at desc, id desc limit 1;
  if not found or v_finding.submitted_by=auth.uid() or
     not exists(select 1 from public.office_audit_evidence e
      where e.id=v_finding.evidence_id and e.candidate_id=p_candidate_id
      and e.signal_code=v_finding.signal_code and e.verification_status='Verified') then
    raise exception 'Independent reviewer and verified signal-linked finding required' using errcode='42501';
  end if;
  v_target:=case when p_action='sign_off' then 'Closed' else 'Verifying' end;
  perform set_config('office_audit.status_note',left(btrim(p_note),500),true);
  perform set_config('office_audit.review_action',p_action,true);
  update public.office_audit_candidates c set audit_status=v_target
    where c.id=p_candidate_id and c.version=p_expected_version;
  if not found then raise exception 'Case conflict' using errcode='40001'; end if;
  perform set_config('office_audit.insert_review','authorized',true);
  insert into public.office_audit_second_reviews(candidate_id,finding_id,reviewer_id,
    action,review_note,previous_version,next_version)
    values(p_candidate_id,v_finding.id,auth.uid(),p_action,btrim(p_note),
      p_expected_version,p_expected_version+1);
  return query select p_candidate_id,p_expected_version+1,v_target;
end $$;

-- Record evidence and Finding actions in the existing append-only Audit Trail.
create or replace function office_audit_private.log_case_material_event()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,office_audit_private as $audit$
declare v_kind text; v_event text; v_note text;
begin
  if auth.uid() is null then raise exception 'Verified officer required' using errcode='28000'; end if;
  if tg_table_name='office_audit_evidence' then
    if tg_op='UPDATE' and old.verification_status is not distinct from new.verification_status
      then return new; end if;
    v_event:=case when tg_op='INSERT' then 'evidence_recorded' else 'evidence_verified' end;
    v_note:=case when tg_op='INSERT' then 'Evidence reference registered for '||new.signal_code
      else left(coalesce(new.verification_note,'Evidence verified'),500) end;
  else
    v_event:='finding_submitted';
    v_note:=left(new.signal_code||': '||new.finding_summary,500);
  end if;
  select b.source_kind into v_kind from public.office_audit_candidates c
    join public.office_audit_batches b on b.id=c.batch_id
    where c.id=new.candidate_id;
  if v_kind is null then raise exception 'Audit source batch is missing' using errcode='23503'; end if;
  insert into public.office_audit_events(
    candidate_id,actor_id,event_type,previous_status,new_status,source_kind,review_note
  ) values(new.candidate_id,auth.uid(),v_event,null,null,v_kind,v_note);
  return new;
end $audit$;
create trigger office_audit_evidence_event after insert or update
  on public.office_audit_evidence for each row
  execute function office_audit_private.log_case_material_event();
create trigger office_audit_finding_event after insert
  on public.office_audit_findings for each row
  execute function office_audit_private.log_case_material_event();
revoke all on function office_audit_private.log_case_material_event()
  from public,anon,authenticated;

revoke all on function public.office_audit_record_evidence(uuid,text,text),
public.office_audit_verify_evidence(uuid,text),
public.office_audit_submit_finding(uuid,uuid,text,text),
public.office_audit_second_review(uuid,integer,text,text) from public,anon;
grant execute on function public.office_audit_record_evidence(uuid,text,text),
public.office_audit_verify_evidence(uuid,text),
public.office_audit_submit_finding(uuid,uuid,text,text),
public.office_audit_second_review(uuid,integer,text,text) to authenticated;
commit;