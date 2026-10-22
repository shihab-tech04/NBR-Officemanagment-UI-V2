# WS03 Office Rules & Calculation — authenticated SQL evidence and acceptance boundaries

**Read-only inspection date:** 22 October 2026 (Asia/Dhaka)  
**Supabase project:** `Bangladesh-NBR-eReturn` (`ijcbllgjhhkcnbuygwdn`)  
**Office branch:** `ws03/rules-review-layer-20261022`; draft PR #107.  
**Legal disposition:** SQL OBSERVED; independently current-law VERIFIED and post-upgrade AGENT CERTIFIED are **NOT ESTABLISHED**.

## Unmodified controlled baseline

- Freeze: `FINAL_2026_09_30` and original 366 canonical identities.
- Frozen registry SHA-256: `34902bac07a459a4f0c051b90bfe3b4c492f2465d06c661bab18ab7f36252184`.
- Original 137-case matrix and its expected outputs were not modified or replaced.
- No SQL INSERT / UPDATE / DELETE / DDL or privileged Edge Function POST/PATCH was executed in WS03.

## PH1 current SQL inventory (direct read-only SELECT)

| Assessment year | Income year | State | Coverage label | Current rule versions | Legal certification |
|---|---|---|---|---:|---|
| 2024-25 | 2023-24 | reference_only | incomplete_historical | 0 | OPEN |
| 2025-26 | 2024-25 | reference_only | incomplete_historical | 1 | OPEN |
| 2026-27 | 2025-26 | active | complete_canonical | 366 | SQL label only, not independent Agent certification |
| 2027-28 | 2026-27 | draft | cloned_pending_review | 366 | INHERITED_PENDING_REVIEW, not executable |

Database has 733 total `nbr_rule_versions` records: none has `revision_no > 1` or non-null `supersedes_version_id`. `nbr_rule_change_requests` had 0 records. No retired-version provenance is currently available for an acceptance replay.

**Exact projection read-back:** Compared all 366 AY 2026–27 current `rule_key` rows to `src/app/data/rulesSqlSnapshot.json` for: rule ID, administrative `group_id`, `execution_status`, `year_applicability_status`, `legal_source` JSON arrays, canonical origin task, and canonical source reference. **Zero mismatches observed across these projections.** This is a source-record parity comparison, not verification that all relevant law exists or is correct.

**Coverage/traceability gaps:** `nbr_rule_identities` has 366 rows, all with `grouping_basis = ADMIN_UX_CLASSIFICATION_V1` (not statutory parent/subrule hierarchy). 81 identity rows have no `canonical_source_ref` and no `canonical_origin_task` in the identity table. Among the 366 current AY 2026–27 JSON records, 77 have a `legal_source` field, 182 have `statutory_section`, 82 have `applicable_period`, 16 have `formula_condition`, 74 have `taxpayer_type`, and 285 have `canonical_source_ref`. These field-presence counts overlap and must **not** be interpreted as absence of all other kinds of legal evidence.

## Exact API v15 observations

Edge Function `nbr-rules-api` version **15**, `verify_jwt=false` at gateway. Its code enforces bearer-token Supabase `auth.getUser`, an unrevoked `x-nbr-rule-session`, identity-bound active principal and `tax_rule.view` on protected GET endpoints. Source digest observed: `b51db9cf93650342eb8c3ce356df0e7d80075561f4133e431397fc711922c376`.

- Supported protected GET: `/years`, `/groups?year=`, `/rules?year=&page=&perPage=`, `/rules/:id?year=`, `/summary?year=`, `/gates?year=`, and `/audit`.
- Current detail GET exposes a current `nbr_rule_versions` row, `nbr_rule_identities`, latest 20 change requests and latest 20 audit rows; **does not expose historical retired version bodies**. This needs a separately reviewed WS02 contract.
- Existing `PATCH /rules/:id` routes include special active-year publishing and an unversioned proposal RPC. **WS03 does not invoke these.** A WS02-approved idempotency/version-conflict contract and staging authorization are needed before proposal writes.
- `ALLOWED_ORIGINS` observed: `https://shihabshajib01-cell.github.io`, `https://shihab2-tech.github.io`, `http://localhost:5173`, `http://localhost:3000`. Verify the final actual Office origin before protected browser use; do not assert CORS PASS for an unlisted origin.

### Protected acceptance blocker (counts only, no identity data)

- Verified Auth-linked active Rule administrators: **0**.
- Active unrevoked Rules administration API sessions: **0**.
- Change requests: **0**.

Consequently, the required staging edit → authorized persistence → reload → historical predecessor read-back **cannot be reported PASS**. No elevated permission or service-role client is introduced in browser code.

## WS03 additive interface contract

- Historical snapshot is labelled as such whenever no authenticated Rules API read client is supplied; an injected verified client displays protected SQL-derived years, rules, summary and gate tables using existing Office shared UI.
- The protected list path checks all pages (up to 10,000 records), rejects duplicate identity/version and unstable pagination. Rule detail opens only when exact SQL version UUID, revision, group, applicability, execution status and complete JSON field set match the selected list record.
- Rule details expose the server's recorded legal references, taxpayer scope, periods, conditions, formula/exception fields, revision UUID and latest audit/change records. They never declare a stored executable flag to be current-law authorization.
- Wizard candidate changes are local review-only: source PDF SHA-256, provision locator, old/new text, prospective hierarchy, dates/savings, taxpayer scope and OPEN impacts. Derived JSON is not legal authority. New-year and inherited rules remain DRAFT/NOT_CERTIFIED.
- Full 366 record-detail and live UI read-back certification remains **BLOCKED** until a verified, in-origin bearer/Rule-session is supplied. The read-only direct-SQL projection result above is separate evidence, not a substitute for authenticated browser use.

## Independent gates

**WS02:** supply approved staging Auth principal and Rule API session, source-aware idempotent proposals, optimistic version guards, explicit reviewers, full revision history GET, rollback/read-back and CORS verification.  
**WS01:** reconcile source register, 81 identity-level provenance gaps, statutory parent/subrule/child relationships and unverified historical applicability without altering the frozen registry.  
**WS07:** independently compare approved Office responsive/drawer/modal EN/BN screenshots, 375/768/1280/1920, detail field semantics and tests.  
**Agent/release:** execute 137 unchanged original cases, 32 v2.1 acceptance and six E2E workflows before any executable activation.

**Current disposition:** PH1 SQL projection observation and PH2 review UI locally tested; PH3 source-approved SQL writes and PH4 authenticated production/staging acceptance OPEN/BLOCKED. PR #107 must stay draft, unmerged and undeployed.
