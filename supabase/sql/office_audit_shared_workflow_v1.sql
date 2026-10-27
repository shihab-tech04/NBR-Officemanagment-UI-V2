-- NBR Office Audit shared workflow v1. Synthetic records ONLY until a verified
-- authenticated Office identity/source ingestion contract is separately approved.
-- Additive migration; no existing Office or payment objects are altered.
create table if not exists public.office_audit_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  office_role text not null check (office_role in ('nbr_admin','administrator','zone_user','circle_user','range_user')),
  zone text,
  circle text,
  active boolean not null default false,
  granted_at timestamptz not null default now(),
  check (office_role not in ('zone_user','circle_user','range_user') or zone is not null),
  check (office_role <> 'circle_user' or circle is not null)
);
create table if not exists public.office_audit_batches (
  id uuid primary key default gen_random_uuid(),
  external_batch_id text not null unique,
  assessment_year text not null check(length(assessment_year) between 7 and 10),
  zone text not null,
  selection_track text not null,
  selection_basis text not null default '',
  funnel_rule text not null default '',
  source_kind text not null default 'synthetic' check (source_kind in ('synthetic','verified')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revision integer not null default 1 check(revision >= 1),
  unique (id, assessment_year, zone)
);
create table if not exists public.office_audit_candidates (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  assessment_year text not null,
  zone text not null,
  circle text not null,
  return_id text not null,
  tin text not null,
  taxpayer_name text not null,
  coverage_tier text not null default '',
  risk_level text not null default '',
  signals text[] not null default '{}',
  data_quality text not null default '',
  audit_status text not null default 'Not Started'
     check (audit_status in ('Not Started','Assigned','Verifying','Evidence Pending','Ready for Review','Second Review','Closed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check(version >= 1),
  constraint audit_candidates_batch_fk foreign key(batch_id,assessment_year,zone)
    references public.office_audit_batches(id,assessment_year,zone),
  constraint audit_candidates_unique_return unique(batch_id,assessment_year,return_id)
);
create table if not exists public.office_audit_screening_runs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.office_audit_batches(id),
  assessment_year text not null,
  zone text not null,
  criteria jsonb not null check(jsonb_typeof(criteria)='object'),
  status text not null default 'queued' check(status in ('queued','running','ready','failed','cancelled')),
  created_by uuid not null references auth.users(id),
  queued_at timestamptz not null default now(),
  finished_at timestamptz,
  result_summary jsonb,
  check ((status='ready' and finished_at is not null) or status<>'ready')
);
create table if not exists public.office_audit_events (
  id bigint generated always as identity primary key,
  candidate_id uuid not null references public.office_audit_candidates(id),
  actor_id uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  event_type text not null,
  previous_status text,
  new_status text,
  source_kind text not null default 'synthetic'
);
create index if not exists office_audit_candidates_year_zone_circle on public.office_audit_candidates(assessment_year,zone,circle);
create index if not exists office_audit_screening_runs_owner on public.office_audit_screening_runs(created_by,queued_at desc);
create index if not exists office_audit_events_candidate_time on public.office_audit_events(candidate_id,changed_at desc);

alter table public.office_audit_memberships enable row level security;
alter table public.office_audit_batches enable row level security;
alter table public.office_audit_candidates enable row level security;
alter table public.office_audit_screening_runs enable row level security;
alter table public.office_audit_events enable row level security;

-- No anonymous access. Members can only read their own active assignment;
-- assignments require privileged provision (never the browser).
revoke all on public.office_audit_memberships, public.office_audit_batches,
 public.office_audit_candidates, public.office_audit_screening_runs, public.office_audit_events from anon, authenticated;
grant select on public.office_audit_memberships to authenticated;
grant select,insert on public.office_audit_batches to authenticated;
grant select,insert on public.office_audit_candidates to authenticated;
grant update(audit_status) on public.office_audit_candidates to authenticated;
grant select,insert on public.office_audit_screening_runs to authenticated;
grant select on public.office_audit_events to authenticated;

create policy office_audit_membership_self on public.office_audit_memberships
  for select to authenticated using (active and user_id=(select auth.uid()));
create policy office_audit_batches_select on public.office_audit_batches
  for select to authenticated using (exists (
    select 1 from public.office_audit_memberships m where m.user_id=(select auth.uid()) and m.active
    and (m.office_role in ('nbr_admin','administrator')
      or (m.office_role in ('zone_user','circle_user','range_user') and m.zone=office_audit_batches.zone))
  ));
create policy office_audit_batches_insert on public.office_audit_batches
  for insert to authenticated with check (
    created_by=(select auth.uid()) and source_kind='synthetic'
    and exists (select 1 from public.office_audit_memberships m
      where m.user_id=(select auth.uid()) and m.active
      and (m.office_role in ('nbr_admin','administrator')
        or (m.office_role in ('zone_user','circle_user','range_user') and m.zone=office_audit_batches.zone)))
  );
create policy office_audit_candidates_select on public.office_audit_candidates
  for select to authenticated using (
    exists (select 1 from public.office_audit_memberships m
      where m.user_id=(select auth.uid()) and m.active
      and (m.office_role in ('nbr_admin','administrator')
        or (m.office_role='zone_user' and m.zone=office_audit_candidates.zone)
        or (m.office_role in ('circle_user','range_user') and m.zone=office_audit_candidates.zone and m.circle=office_audit_candidates.circle)))
  );
create policy office_audit_candidates_insert on public.office_audit_candidates
  for insert to authenticated with check (
    created_by=(select auth.uid())
    and exists (select 1 from public.office_audit_batches b
      where b.id=batch_id and b.assessment_year=office_audit_candidates.assessment_year and b.zone=office_audit_candidates.zone
      and b.created_by=(select auth.uid()) and b.source_kind='synthetic')
    and exists (select 1 from public.office_audit_memberships m
      where m.user_id=(select auth.uid()) and m.active
      and (m.office_role in ('nbr_admin','administrator')
        or (m.office_role='zone_user' and m.zone=office_audit_candidates.zone)
        or (m.office_role in ('circle_user','range_user') and m.zone=office_audit_candidates.zone and m.circle=office_audit_candidates.circle)))
  );
create policy office_audit_candidates_update on public.office_audit_candidates
  for update to authenticated using (
    exists (select 1 from public.office_audit_memberships m
      where m.user_id=(select auth.uid()) and m.active
      and (m.office_role in ('nbr_admin','administrator')
        or (m.office_role='zone_user' and m.zone=office_audit_candidates.zone)
        or (m.office_role in ('circle_user','range_user') and m.zone=office_audit_candidates.zone and m.circle=office_audit_candidates.circle)))
  ) with check (
    exists (select 1 from public.office_audit_memberships m
      where m.user_id=(select auth.uid()) and m.active
      and (m.office_role in ('nbr_admin','administrator')
        or (m.office_role='zone_user' and m.zone=office_audit_candidates.zone)
        or (m.office_role in ('circle_user','range_user') and m.zone=office_audit_candidates.zone and m.circle=office_audit_candidates.circle)))
  );
create policy office_audit_runs_select on public.office_audit_screening_runs
  for select to authenticated using (created_by=(select auth.uid()) and
    exists (select 1 from public.office_audit_memberships m where m.user_id=(select auth.uid()) and m.active));
create policy office_audit_runs_insert on public.office_audit_screening_runs
  for insert to authenticated with check (created_by=(select auth.uid()) and status='queued'
    and result_summary is null and finished_at is null
    and exists (select 1 from public.office_audit_memberships m where m.user_id=(select auth.uid()) and m.active
    and (m.office_role in ('nbr_admin','administrator') or m.zone=office_audit_screening_runs.zone)));
create policy office_audit_events_select on public.office_audit_events
  for select to authenticated using (
    exists (select 1 from public.office_audit_candidates c where c.id=candidate_id)
  );

-- Append-only audit trail. A client cannot insert events or rewrite history.
create schema if not exists office_audit_private;
revoke all on schema office_audit_private from public, anon, authenticated;
create or replace function office_audit_private.record_candidate_status()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,office_audit_private as $$
begin
  if (TG_OP='UPDATE') then
    if old.audit_status is distinct from new.audit_status then
      insert into public.office_audit_events(candidate_id,actor_id,event_type,previous_status,new_status)
      values(new.id,auth.uid(),'status_change',old.audit_status,new.audit_status);
      new.version=old.version+1;
      new.updated_at=now();
    end if;
  end if;
  return new;
end $$;
revoke all on function office_audit_private.record_candidate_status() from public,anon,authenticated;
create trigger office_audit_status_event
before update on public.office_audit_candidates
for each row execute function office_audit_private.record_candidate_status();

-- No officer identities, membership grants, verified sources, real taxpayer
-- imports or synthetic candidate records are created by this migration.

-- Atomic Office API: no partial candidate batches and no guessed officer ID.
-- RLS membership/zone/circle policies are evaluated as the JWT caller.
create or replace function public.office_audit_create_batch(
  p_external_batch_id text,
  p_assessment_year text,
  p_zone text,
  p_selection_track text,
  p_selection_basis text,
  p_funnel_rule text,
  p_candidates jsonb
) returns uuid language plpgsql security invoker
set search_path=pg_catalog,public as $$
declare
  v_batch uuid;
  v_item jsonb;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Authenticated officer required' using errcode='28000'; end if;
  if p_external_batch_id is null or length(trim(p_external_batch_id)) < 3
     or p_assessment_year is null or p_zone is null
     or jsonb_typeof(p_candidates) is distinct from 'array'
     or jsonb_array_length(p_candidates) not between 1 and 2000 then
     raise exception 'Invalid Audit batch input' using errcode='22023';
  end if;
  insert into public.office_audit_batches
    (external_batch_id,assessment_year,zone,selection_track,selection_basis,funnel_rule,source_kind,created_by)
  values
    (p_external_batch_id,p_assessment_year,p_zone,p_selection_track,
     coalesce(p_selection_basis,''),coalesce(p_funnel_rule,''),'synthetic',v_uid)
  returning id into v_batch;

  for v_item in select value from jsonb_array_elements(p_candidates)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or coalesce(v_item->>'return_id','')=''
      or coalesce(v_item->>'circle','')=''
      or coalesce(v_item->>'tin','')=''
      or coalesce(v_item->>'taxpayer_name','')='' then
      raise exception 'Invalid candidate identity' using errcode='22023';
    end if;
    insert into public.office_audit_candidates (
      batch_id,assessment_year,zone,circle,return_id,tin,taxpayer_name,
      coverage_tier,risk_level,signals,data_quality,created_by
    ) values (
      v_batch,p_assessment_year,p_zone,v_item->>'circle',
      v_item->>'return_id',v_item->>'tin',v_item->>'taxpayer_name',
      coalesce(v_item->>'coverage_tier',''),coalesce(v_item->>'risk_level',''),
      coalesce(array(select jsonb_array_elements_text(
        case when jsonb_typeof(v_item->'signals')='array' then v_item->'signals' else '[]'::jsonb end
      )),array[]::text[]),
      coalesce(v_item->>'data_quality',''),v_uid
    );
  end loop;
  return v_batch;
end $$;
revoke all on function public.office_audit_create_batch(text,text,text,text,text,text,jsonb)
  from public,anon;
grant execute on function public.office_audit_create_batch(text,text,text,text,text,text,jsonb)
  to authenticated;
