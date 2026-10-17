-- Read-only Office API deployment preflight. Run through the approved service
-- operator SQL console; do not expose that console or service key to browsers.

-- 30 contracts; no fictional source or record should have been loaded by
-- merely deploying the API layer.
select
  (select count(*) from office_backend.route_contracts) as registered_read_routes,
  (select sum(jsonb_object_keys_count) from (
    select count(*) as jsonb_object_keys_count
    from office_backend.route_contracts c,
         lateral jsonb_object_keys(c.field_types) fields
    group by c.route_key
  ) fields_per_route) as declared_fields,
  (select count(*) from office_backend.registered_sources where connected)
    as connected_office_sources,
  (select count(*) from office_backend.records) as imported_business_records,
  (select count(*) from auth.users) as office_auth_users,
  (select count(*) from payment_sync.officer_roles where active)
    as active_officer_roles;

-- All new private tables must be covered by RLS, without browser grants.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
  has_table_privilege('anon',c.oid,'select,insert,update,delete')
    as anon_any_data_grant,
  has_table_privilege('authenticated',c.oid,'select,insert,update,delete')
    as authenticated_any_data_grant
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='office_backend' and c.relkind='r'
order by c.relname;

-- Authenticated users may query, but not ingest. Anon can do neither.
select
  has_function_privilege('anon',
    'public.office_v1_query(text,integer,integer,jsonb)','execute')
    as anon_can_read,
  has_function_privilege('authenticated',
    'public.office_v1_query(text,integer,integer,jsonb)','execute')
    as authenticated_can_call_role_gated_read,
  has_function_privilege('authenticated',
    'public.office_v1_internal_ingest(text,jsonb)','execute')
    as authenticated_can_ingest,
  has_function_privilege('service_role',
    'public.office_v1_internal_ingest(text,jsonb)','execute')
    as service_role_can_ingest;

-- Display the complete route matrix and source state for handoff.
select c.route_key,c.route_path,c.response_kind,
  (select count(*) from jsonb_object_keys(c.field_types)) as field_count,
  coalesce(s.connected,false) as source_connected,s.last_ingested_at
from office_backend.route_contracts c
left join office_backend.registered_sources s on s.route_key=c.route_key
order by c.route_path;
