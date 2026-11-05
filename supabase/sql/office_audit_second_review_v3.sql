-- Officer Audit evidence, DCT findings and independent Range review.
-- Additive, no users, memberships, taxpayer records or sample approvals.
-- Parent v1 + v2 migrations must already be present.
begin;

create table if not exists public.office_audit_case_evidence (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.office_audit_candidates(id),
  signal_code text not null check (signal_code ~ '^R-[A-E][1-9]$'),
  evidence_ref text not null check (char_length(btrim(evidence_ref)) between 8 and 240),
  verification_note text not null check (char_length(btrim(verification_note)) between 20 and 1000),
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now(),
  unique (candidate_id, signal_code, evidence_ref)
);
create index if not exists audit_evidence_candidate_idx on public.office_audit_case_evidence(candidate_id, submitted_at desc);
alter table public.office_audit_case_evidence enable row level security;
revoke all on public.office_audit_case_evidence from public, anon, authenticated;
grant select, insert on public.office_audit_case_evidence to authenticated;

create table if not exists public.office_audit_findings (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.office_audit_candidates(id),
  evidence_id uuid not null references public.office_audit_case_evidence(id),
  signal_code text not null check (signal_code ~ '^R-[A-E][1-9]$'),
  finding_summary text not null check (char_length(btrim(finding_summary)) between 40 and 2000),
  submitted_by uuid not null references auth.users(id),
  submitted_at timestamptz not null default now()
);
create index if not exists audit_findings_candidate_idx on public.office_audit_findings(candidate_id,submitted_at desc);
alter table public.office_audit_findings enable row level security;
revoke all on public.office_audit_findings from public,anon,authenticated;
grant select,insert on public.office_audit_findings to authenticated;

create table if not exists public.office_audit_case_reviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.office_audit_candidates(id),
  finding_id uuid not null references public.office_audit_findings(id),
  reviewer_id uuid not null references auth.users(id),
  reviewed_version integer not null check(reviewed_version>=1),
  decision text not null check(decision in ('sign_off','request_rework')),
  review_note text not null check (char_length(btrim(review_note)) between 30 and 1500),
  decided_at timestamptz not null default now(),
  unique(candidate_id,reviewed_version)
);
create index if not exists audit_case_reviews_candidate_idx on public.office_audit_case_reviews(candidate_id,decided_at desc);
alter table public.office_audit_case_reviews enable row level security;
revoke all on public.office_audit_case_reviews from public,anon,authenticated;
grant select,insert on public.office_audit_case_reviews to authenticated;

drop policy if exists audit_evidence_visible on public.office_audit_case_evidence;
create policy audit_evidence_visible on public.office_audit_case_evidence for select to authenticated
using (exists (select 1 from public.office_audit_candidates c where c.id=candidate_id));

drop policy if exists audit_evidence_dct_insert on public.office_audit_case_evidence;
create policy audit_evidence_dct_insert on public.office_audit_case_evidence for insert to authenticated
with check(
  submitted_by=(select auth.uid()) and
  exists (
    select 1 from public.office_audit_candidates c
    join public.office_audit_memberships m on m.user_id=(select auth.uid())
    where c.id=candidate_id and m.active and m.office_role='circle_user'
      and m.zone=c.zone and m.circle=c.circle
      and c.audit_status in ('Verifying','Evidence Pending')
      and signal_code=any(c.signals)
  )
);

drop policy if exists audit_finding_visible on public.office_audit_findings;
create policy audit_finding_visible on public.office_audit_findings for select to authenticated
using (exists(select 1 from public.office_audit_candidates c where c.id=candidate_id));

drop policy if exists audit_finding_dct_insert on public.office_audit_findings;
create policy audit_finding_dct_insert on public.office_audit_findings for insert to authenticated
with check (
  submitted_by=(select auth.uid()) and
  exists(
    select 1 from public.office_audit_candidates c
    join public.office_audit_memberships m on m.user_id=(select auth.uid())
    join public.office_audit_case_evidence e on e.id=evidence_id
    where c.id=candidate_id and e.candidate_id=c.id and e.signal_code=signal_code
      and m.active and m.office_role='circle_user'
      and m.zone=c.zone and m.circle=c.circle
      and c.audit_status in ('Verifying','Evidence Pending')
  )
);

drop policy if exists audit_case_reviews_visible on public.office_audit_case_reviews;
create policy audit_case_reviews_visible on public.office_audit_case_reviews for select to authenticated
using (exists(select 1 from public.office_audit_candidates c where c.id=candidate_id));

drop policy if exists audit_case_reviews_range_insert on public.office_audit_case_reviews;
create policy audit_case_reviews_range_insert on public.office_audit_case_reviews for insert to authenticated
with check (
  reviewer_id=(select auth.uid()) and
  current_setting('office_audit.range_review',true)='approved_rpc' and
  exists(
    select 1 from public.office_audit_candidates c
    join public.office_audit_memberships m on m.user_id=(select auth.uid())
    join public.office_audit_findings f on f.id=finding_id
    where c.id=candidate_id and f.candidate_id=c.id
      and f.submitted_by<>(select auth.uid())
      and m.active and m.office_role='range_user'
      and m.zone=c.zone and m.circle=c.circle
  )
);

-- Evidence and findings are immutable, including for the submitter. Every
-- accepted insert generates an append-only event inside the same transaction.
create or replace function office_audit_private.record_case_evidence()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,office_audit_private as $$
declare v_source text;
begin
  select b.source_kind into v_source from public.office_audit_candidates c
    join public.office_audit_batches b on b.id=c.batch_id where c.id=new.candidate_id;
  if new.submitted_by is distinct from auth.uid() or v_source is null
     or new.signal_code !~ '^R-[A-E][1-9]$' then
    raise exception 'Invalid Audit evidence author or source' using errcode='42501';
  end if;
  insert into public.office_audit_events(candidate_id,actor_id,event_type,source_kind,review_note)
    values(new.candidate_id,new.submitted_by,'signal_evidence_verified',v_source,
      new.signal_code||': '||left(new.evidence_ref||' — '||new.verification_note,500));
  return new;
end $$;
revoke all on function office_audit_private.record_case_evidence() from public,anon,authenticated;
drop trigger if exists office_audit_evidence_event on public.office_audit_case_evidence;
create trigger office_audit_evidence_event after insert on public.office_audit_case_evidence
for each row execute function office_audit_private.record_case_evidence();

create or replace function office_audit_private.record_case_finding()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,office_audit_private as $$
declare v_source text;
begin
  select b.source_kind into v_source from public.office_audit_candidates c
    join public.office_audit_batches b on b.id=c.batch_id where c.id=new.candidate_id;
  if new.submitted_by is distinct from auth.uid() or v_source is null then
    raise exception 'Invalid Audit finding author or source' using errcode='42501';
  end if;
  insert into public.office_audit_events(candidate_id,actor_id,event_type,source_kind,review_note)
    values(new.candidate_id,new.submitted_by,'finding_submitted',v_source,
      new.signal_code||': '||left(new.finding_summary,480));
  return new;
end $$;
revoke all on function office_audit_private.record_case_finding() from public,anon,authenticated;
drop trigger if exists office_audit_finding_event on public.office_audit_findings;
create trigger office_audit_finding_event after insert on public.office_audit_findings
for each row execute function office_audit_private.record_case_finding();

-- Harden existing status trigger. Only a Range member matching both zone AND
-- Circle can make a sign-off/rework transition; missing range mappings deny access.
create or replace function office_audit_private.record_candidate_status()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,office_audit_private as $$
declare
 v_note text; v_source text; v_permitted boolean; v_range boolean;
begin
 if tg_op<>'UPDATE' or old.audit_status is not distinct from new.audit_status then return new; end if;
 v_note:=nullif(btrim(current_setting('office_audit.status_note',true)),'');
 if auth.uid() is null or v_note is null or char_length(v_note) not between 10 and 500 then
   raise exception 'Verified officer and 10-500 character reason required' using errcode='28000';
 end if;
 v_permitted:=
   (old.audit_status='Not Started' and new.audit_status='Assigned') or
   (old.audit_status='Assigned' and new.audit_status='Verifying') or
   (old.audit_status='Verifying' and new.audit_status in ('Evidence Pending','Ready for Review')) or
   (old.audit_status='Evidence Pending' and new.audit_status in ('Verifying','Ready for Review')) or
   (old.audit_status='Ready for Review' and new.audit_status in ('Verifying','Second Review')) or
   (old.audit_status='Second Review' and new.audit_status='Ready for Review');
 if not coalesce(v_permitted,false) then
   select exists(select 1 from public.office_audit_memberships m
     where m.user_id=auth.uid() and m.active and m.office_role='range_user'
       and m.zone=new.zone and m.circle=new.circle) into v_range;
   v_permitted:=current_setting('office_audit.range_review',true)='approved_rpc'
     and coalesce(v_range,false)
     and ((old.audit_status='Second Review' and new.audit_status='Closed')
       or (old.audit_status in ('Second Review','Ready for Review')
           and new.audit_status='Verifying'));
 end if;
 if not coalesce(v_permitted,false) then
   raise exception 'Review status transition is not authorized' using errcode='42501';
 end if;
 select b.source_kind into v_source from public.office_audit_batches b where b.id=new.batch_id;
 if v_source is null then raise exception 'Missing Audit source batch' using errcode='23503'; end if;
 insert into public.office_audit_events(candidate_id,actor_id,event_type,previous_status,new_status,source_kind,review_note)
 values(new.id,auth.uid(),'status_change',old.audit_status,new.audit_status,v_source,v_note);
 new.version:=old.version+1;
 new.updated_at:=now();
 return new;
end $$;
revoke all on function office_audit_private.record_candidate_status() from public,anon,authenticated;

-- Single transaction: verified signed-in Range Officer, independent DCT
-- finding, attached evidence, version check, status change, immutable review.
create or replace function public.office_audit_second_review(
 p_candidate_id uuid,p_expected_version integer,p_decision text,p_note text
) returns table(candidate_id uuid,version integer,audit_status text,review_id uuid)
language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare
 v_candidate public.office_audit_candidates%rowtype;
 v_finding public.office_audit_findings%rowtype;
 v_role text; v_note text; v_next text; v_id uuid; v_version integer;
 v_status text; v_review uuid;
begin
 if auth.uid() is null then raise exception 'Verified Range Officer required' using errcode='28000'; end if;
 v_note:=regexp_replace(btrim(coalesce(p_note,'')),'[[:space:]]+',' ','g');
 if p_candidate_id is null or coalesce(p_expected_version,0)<1
   or p_decision not in ('sign_off','request_rework')
   or char_length(v_note) not between 30 and 500 then
   raise exception 'Invalid review decision, version or specific reason' using errcode='22023';
 end if;
 select * into v_candidate from public.office_audit_candidates c
   where c.id=p_candidate_id for update;
 if not found or v_candidate.version<>p_expected_version then
   raise exception 'Review record changed or is outside jurisdiction; refresh' using errcode='40001';
 end if;
 select m.office_role into v_role from public.office_audit_memberships m
   where m.user_id=auth.uid() and m.active and m.office_role='range_user'
     and m.zone=v_candidate.zone and m.circle=v_candidate.circle;
 if v_role is null or v_candidate.created_by=auth.uid() then
   raise exception 'Independent Range Officer of this Circle required' using errcode='42501';
 end if;
 if p_decision='sign_off' and v_candidate.audit_status<>'Second Review' then
   raise exception 'Only cases awaiting independent second review can be closed' using errcode='22023';
 end if;
 if p_decision='request_rework' and v_candidate.audit_status not in ('Ready for Review','Second Review') then
   raise exception 'This case is not in the review queue' using errcode='22023';
 end if;
 select * into v_finding from public.office_audit_findings f
   where f.candidate_id=p_candidate_id order by f.submitted_at desc,f.id desc limit 1;
 if not found or v_finding.submitted_by=auth.uid() then
   raise exception 'A separate DCT finding is required' using errcode='42501';
 end if;
 if p_decision='sign_off' then
   if not exists(select 1 from public.office_audit_case_evidence e where e.id=v_finding.evidence_id
      and e.candidate_id=p_candidate_id and e.signal_code=v_finding.signal_code)
     or exists(
       select 1 from unnest(v_candidate.signals) s(signal_code)
       where not exists (select 1 from public.office_audit_case_evidence e
         where e.candidate_id=p_candidate_id and e.signal_code=s.signal_code)
     ) then
     raise exception 'Verified linked evidence required for every substantive signal' using errcode='42501';
   end if;
 end if;
 -- Specific signal reference required to avoid a generic approval note.
 if position(v_finding.signal_code in v_note)=0 then
   raise exception 'Review note must identify the submitted finding signal' using errcode='22023';
 end if;
 v_next:=case when p_decision='sign_off' then 'Closed' else 'Verifying' end;
 perform set_config('office_audit.status_note',v_note,true);
 perform set_config('office_audit.range_review','approved_rpc',true);
 update public.office_audit_candidates c set audit_status=v_next
   where c.id=p_candidate_id and c.version=p_expected_version
   returning c.id,c.version,c.audit_status into v_id,v_version,v_status;
 if v_id is null or v_version<>p_expected_version+1 or v_status<>v_next then
   raise exception 'No authorized review transition confirmed' using errcode='40001';
 end if;
 insert into public.office_audit_case_reviews(
   candidate_id,finding_id,reviewer_id,reviewed_version,decision,review_note
 ) values(p_candidate_id,v_finding.id,auth.uid(),p_expected_version,p_decision,v_note)
 returning id into v_review;
 return query select v_id,v_version,v_status,v_review;
end $$;
revoke execute on function public.office_audit_second_review(uuid,integer,text,text) from public,anon;
grant execute on function public.office_audit_second_review(uuid,integer,text,text) to authenticated;

commit;
