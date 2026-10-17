# Office Management v1 read API — backend handoff

Checkpoint: 2026-10-17. API workstream branch:
`api/payment-v1-backend-20261017` in `shihab-tech04/NBR-Officemanagment-UI-V2`.
No Office UI source files were edited.

## Scope and deployment

All 30 read-route contracts already referenced by the Office frontend have a
deployed backend gateway and a corresponding private, strongly shaped read
model in Supabase project `ihbtabrvmyiwikqqbhrf`.

- Edge function: `office-read-api` (active), with GET endpoints under
  `https://ihbtabrvmyiwikqqbhrf.supabase.co/functions/v1/office-read-api/api/v1`.
- Auth: valid Supabase Office JWT, then an **active** Office `MAKER`,
  `REVIEWER`, or `APPROVER` role in `payment_sync.officer_roles`.
- A missing token yields HTTP 401; insufficient Office role yields HTTP 403.
- A declared route with no verified upstream source yields HTTP 424 and
  `{"success":false,"code":"SOURCE_NOT_CONNECTED"}`. This is deliberate;
  empty synthetic arrays and fixture-derived tax figures are not substituted.
- Lists return `success`, `data`, `total`, `page`, `perPage`; KPI objects return
  `success`, `data` once a genuine source is connected and populated.
- Lists permit `page`, `perPage` (1–100), `search`, `circle`, `zone`,
  `assessmentYear`, `status`, `fromDate`, and `toDate`. The two dynamic
  routes additionally bind `caseType` or a 12-digit `tin`, respectively.
- A role-gated `GET /_contracts` reports which individual upstream routes
  are connected and when they were last ingested.

## Frontend read-route coverage

The prefixes in this table are relative to the `/api/v1` suffix of the
deployed Edge URL.

| Module | Routes | Count |
| --- | --- | ---: |
| Dashboard | `/dashboard/kpis`, `/dashboard/submissions/recent`, `/dashboard/psr/kpis`, `/dashboard/psr/circle-summary`, `/dashboard/psr/recent`, `/dashboard/returns/offline-summary`, `/dashboard/litigation/summary`, `/dashboard/tax-categories` | 8 |
| Returns | `/returns/approvals`, `/returns/online`, `/returns/offline`, `/returns/archive` | 4 |
| PSR | `/psr/approvals`, `/psr/edit-requests`, `/psr/double-entry/status`, `/psr/double-entry/verification`, `/psr/dormant` | 5 |
| Appeals, tribunal, demand, litigation | `/litigation/:caseType`, `/appeals`, `/tribunal`, `/demand-payment/demands`, `/demand-payment/ledger/:tin`, `/demand-payment/refunds` | 6 |
| Certificates and administration | `/certificates/requests`, `/certificates/edit-requests`, `/certificates/disposals`, `/admin/users`, `/admin/special-registrations`, `/admin/time-extensions`, `/admin/audit-selections` | 7 |
| **Total** | **30 contracts** | **30** |

The route registry maps each route to its expected TypeScript response object
shape: 258 individual primitive field declarations across all 30 contracts.
This is **a read API contract**, not implementation of every prospective
approval, user-management, tax assessment, litigation, or financial mutation.
Those workflows require separate accepted specifications and authorities.

## Security and source provenance

Read models are in the private `office_backend` schema with RLS and no direct
`anon`/`authenticated` table grants. A route source must be registered through
the **service-role-only**
`office_v1_internal_configure_source(route,source_system,attestation_reference,connected)`
RPC. Records may then be ingested through the **service-role-only**
`office_v1_internal_ingest(route,rows)` RPC. The latter enforces exact field
names/types, 1–200 rows per batch, a source ID, recorded timestamp, and
strictly monotonic positive revisions. These RPCs are not browser operations.

**No authoritative Office Management source has been supplied or connected**;
the 30 registered routes currently have **zero** connected sources and
**zero** imported records. The Office project also has **zero** Auth users
at this checkpoint, so a successful authenticated business-data response
cannot be claimed or tested yet. The legal/eReturn reference PDFs do not
constitute an operational Office records feed.

## Verification completed

- 30 of 30 route contracts registered in the hosted Office database.
- All 30 synthesized payload-shape assertions passed against their stored
  field definitions, without inserting those sample values.
- All three new private tables have RLS; browser roles lack direct table
  grants and cannot execute privileged ingest/source-configuration RPCs.
- Unauthenticated SQL read attempts are rejected with `OFFICE_ROLE_REQUIRED`.
- Unconnected ingest is rejected with `OFFICE_SOURCE_NOT_CONNECTED`.
- Unknown source registration is rejected with `INVALID_SOURCE_REGISTRATION`.
- Live HTTP GET without `Authorization` on `/dashboard/kpis` returned
  **401 `AUTH_REQUIRED`** on 2026-10-17.
- **Not yet verified**: successful JWT + Officer role + authoritative
  source read, full route-by-route network responses, production load profile,
  or permission and end-to-end acceptance tests using real data.

## UI integration after authorization

1. Provision approved Office Auth users and active Office officer roles;
   use a normal user JWT in browsers, never a service-role key.
2. Approve an authoritative Office Management source (system owner, fields,
   refresh behavior, record attestation), register each applicable route,
   and ingest verified records. Connect nothing by default.
3. Configure the Office frontend's API base URL as the Edge base above,
   and replace the 30 fixture-backed service implementations with real
   `GET` calls. Ensure its `auth_token` is the actual Office Supabase JWT.
4. Verify real data, pagination and filters, officer role denials, and
   missing-source handling. The UI should display a clear unavailable state
   for HTTP 424, not a false zero-record business report.

## Other backend release gates

Payment-v1 has 25 secured RPCs **per project**, a signed two-way event and
command bridge, and two scheduled bridge jobs per database. Its positive
cross-project E2E test remains blocked by missing Office users/roles.
Live treasury, provider settlement, official receipt/challan verification,
and tax-ledger credit posting require authorized external credentials and
their own source-of-truth design. None is falsely marked as complete.

### Source files in this branch

- `docs/api/sql/office_v1_read_models.sql`
- `docs/api/sql/office_v1_30_route_registry.sql`
- `supabase/functions/office-read-api/index.ts`
- `docs/api/OFFICE_V1_30_ROUTE_STATUS.md` (this handoff)
