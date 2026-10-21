# NBR Rules Engine ↔ eReturn-V2 — Controlled Integration Contract (v0.1)

**Status:** PROPOSED CONTRACT / NOT CONNECTED / NOT CERTIFIED. **Owner:** Office Management Rules & Calculation + eReturn-V2 taxpayer UI. **Date:** 2026-10-21.

## Project boundary — mandatory for parallel reconstruction

- **New citizen return repository:** `shihab-tech04/eReturn-V2`. Only this repository implements the new public individual/corporate eReturn UI.
- **Admin UI repository:** `shihab-tech04/NBR-Officemanagment-UI-V2`, under Administration & Requests > Rules & Calculation. Preserve all approved shared UI and responsive design. No new site shell.
- **Authoritative Rules SQL project:** `Bangladesh-NBR-eReturn`, Supabase ref `ijcbllgjhhkcnbuygwdn`, schema `public`, existing `nbr_*` tables, `nbr-rules-api` and `nbr-tax-engine` Edge Functions. **Do not copy these SQL tables into the separate Office Supabase project** or create a second uncoordinated tax Rules Engine.
- **Out of scope:** TaxPay, eLedger, Office Audit, HRIS and any future NBR applications. Do not reuse their SQL, migrations, credentials, APIs or form logic for the eReturn reconstruction. eLedger's independent frontend recreation is not an eReturn Rules Engine dependency.
- ChatGPT Agent v2.1 may propose legal changes and review evidence, but its generated extracts are not law, and cannot certify or publish executable rules.

## Exact existing API routes (read from deployed nbr-rules-api v15)

API base: `https://ijcbllgjhhkcnbuygwdn.supabase.co/functions/v1/nbr-rules-api` **as observed project reference**, not a validated consumer deployment configuration.

- `GET /public/years` — public year catalogue: `{years:[{assessmentYear,incomeYear,state,executable}]}`. This public SQL flag is historical state only; it does not override independent legal certification.
- Authenticated administrator `GET /years` — year entries with `ruleCount`, `coverage`, `legalCutoff`, etc.
- Authenticated `GET /rules?year=YYYY-YY&page=N&perPage=25` — paginated current-version rules, with `{year,total,page,perPage,rules}`. Exact `_backend.versionId`, `revisionNo`, `yearApplicabilityStatus`, `executionStatus`, `groupId`.
- Authenticated `GET /rules/:ruleKey?year=YYYY-YY` — `{year,version,identity,changes,audit}`.
- Authenticated `GET /engine-parameters`, `GET /gates`, `GET /audit` and permission-gated `PATCH` routes already exist.
- Existing admin authentication requires a verified Supabase bearer identity **and** `x-nbr-rule-session` linked to the authorized admin principal/permissions. The Office UI currently does not provide this session end to end.
- Existing `nbr-tax-engine` v12 is **not certified** for full production use. Its rate text parsing/precision path also needs independent correctness testing. Do not expose a client-side substitute calculation.

## Versioned interface required from the new eReturn-V2

Only after independent approval, introduce a stable **versioned citizen calculation contract**, not an invented assumption about the current Edge Function's response. Proposed request fields:

```json
{
  "contractVersion": "NBR_ERETURN_RULES_V1_PROPOSED",
  "assessmentYear": "YYYY-YY",
  "incomeYear": "YYYY-YY",
  "taxpayerClass": "SOURCE_BACKED_CLASS",
  "residenceStatus": "SOURCE_BACKED_STATUS",
  "eventDates": {},
  "facts": {},
  "sourceFieldIds": []
}
```

Required future response semantics: selected **approved** ruleset ID/hash; rule-version IDs; exact decimal-string intermediate and final amounts; verified applied conditions and exclusions; field/output trace; error codes for missing legal source, unsupported period/taxpayer, unapproved rule, missing fact, conflict and precision failure; deterministic receipt for read-back/reproducibility. **Shape and operation not yet published.** There must be no invented endpoint, amount, rate, exemption, approval or success status.

## Exact sync acceptance — not just a network request

1. Admin makes a legally sourced proposed rule change (never directly alter `FINAL_2026_09_30` bytes/hash).
2. Authorized server writes a new versioned proposal to Rules SQL. Admin reads back and compares exact revision/parameter hash.
3. Independent legal and numeric tests approve a scoped release; unfounded or conflicting change remains BLOCKED.
4. The approved Rules API exposes a pinned ruleset revision and an immutable calculation/field-binding mapping.
5. The new eReturn-V2 uses that exact version, recalculates dependent fields from a deterministic single engine, and independently verifies output hash and traces.
6. Verify positive/negative, boundary, historical, decimal precision (including 0.0000001% if supported by contract), repeated requests, duplicate credit, stale version, cross-user/cross-year, and rollback behaviors.
7. Validate the full field/dependency baseline (ER-5: 168 records over 22 modules; ER-6: 64 exact field edges) and extend it with sourced mappings. These are **partial documented evidence**, not full current runtime certification.
8. Re-run 137 original Agent tests + 32 v2.1 controls + six persisted authorized E2E workflows in the upgraded configuration before production calculation activation.

## Current evidence checkpoint 2026-10-21

- Rules SQL: 366 frozen identities, 733 versions, 733 runtime bindings, four AY records; 2027–28 cloned draft, not legally certified.
- Office frontend currently uses `rulesSqlSnapshot.json` (dated snapshot). It is **not 100% synchronized yet**.
- `eReturn-V2` repository was empty at this checkpoint; parallel implementation will populate it. Do not claim verified consumer connectivity until its code actually calls the approved API.
- Office UI browser visual QA not established through this Chat-session's read-only browser connection; no screenshot inspection PASS.
- Keep an unresolved adapter/auth/access blocker visible instead of silently falling back from server data to local data in executable paths.

## Design rules

Preserve Golden UI, reusable `ResponsiveTable`, `DynamicDetailsDrawer`, shared filter/search/select, pagination, EN/BN parity, approved colors/typography/layout, row-click mobile cards, semantic headings and accessibility. No new banners, unrelated modules, additional app shells or fake financial content.

**This document is an enforceable repository-side development boundary and PROPOSED contract only. It is not a ChatGPT Project-description change or SQL approval.**
