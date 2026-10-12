# NBR Rules & Calculation Engine — Legal / SQL / UI Recovery Crosswalk
**Checkpoint:** 2026-10-10 · **Scope:** read-only reconciliation and UX requirements; no production/SQL/Agent mutation  
**Disposition:** FOUNDATION RECOVERED / UI INTEGRATION PARTIAL / TAX-RULE EXECUTION NOT CERTIFIED

## Recovery sources (do not substitute one for another)
- Controlled NBR Agent registry `NBR_Agent_Canonical_Rule_Registry_FINAL_2026_09_30.json`: **366 stable IDs**, **355 source + 11 overlay**, SHA-256 `34902bac07a459a4f0c051b90bfe3b4c492f2465d06c661bab18ab7f36252184`. Originals must remain byte-identical.
- NBR Agent v2.1 Project configuration was installed/read back. **32/32 offline v2.1 contract tests passed** in a later fresh isolated rerun. **137 archived regressions are not a completed post-upgrade active-Agent rerun**. Six conversational assertions do not prove executable integration.
- Controlled primary legal originals include Income Tax Act and amendments, 2026 instruments, Withholding Tax Rules SRO 210 and 273 with rule-14 replacement/savings, Finance Acts, Return Rules and 2026–27 Circular; full post-cutoff Gazette/amendment coverage and class/year applicability remain PARTIAL/UNVERIFIED.
- Direct live **read-only** inspection of connected Supabase project **Bangladesh-NBR-eReturn** (`ijcbllgjhhkcnbuygwdn`, connected HRIS organization). Do not confuse with HRMIS's separate database.
- Recovered Office Management repository: `shihab2-tech/NBR-eReturn-OfficeManagementUI` (530 source/assets uploaded, Vite Pages deployed). Its source tree has Audit, PSR, Reporting and administration pages but **no advanced Rules & Calculation page**; it is not the suspended separate `Bangladesh-NBR-eReturn-Admin-Portal` source.
- Previous Admin Rules & Calculation review referenced the separate original repo, `docs/RULES_CALCULATION_ARCHITECTURE.md`, and `src/app/services/rulesDevelopmentStore.ts`; development drafts used browser localStorage rather than independently verified SQL persistence. Recovered PR #12, #13 and #14 checkpoint claims require read-back from their true Admin repository/source, not transplantation by guess.

## Verified SQL inventory (2026-10-10)
- Project status **ACTIVE_HEALTHY**; **14** `public.nbr_*` tables; **24** migration records; **3** deployed Edge Functions (`nbr-rules-api`, `nbr-tax-engine`, `nbr-rules-seed`).
- `nbr_rule_identities` **366 rows**; `nbr_rule_versions` **733 rows**.
- `nbr_tax_years`:
  - AY **2024-25** / IY **2023-24**: reference_only, incomplete_historical, non-executable.
  - AY **2025-26** / IY **2024-25**: reference_only, incomplete_historical, non-executable; **1** rule version.
  - AY **2026-27** / IY **2025-26**: state=active, 366 versions, is_executable=true, source baseline FINAL_2026_09_30, legal_cutoff=2026-09-30. **The SQL label is not an independent legal/engine certification.**
  - AY **2027-28** / IY **2026-27**: state=draft, 366 versions, all `INHERITED_PENDING_REVIEW`, non-executable, lifecycle_stage=LEGAL_CHANGE_INTAKE. Its legal_cutoff is NULL.
- Seven AY 2026-27 `nbr_tax_year_gate_results` are labelled PASS with descriptive evidence references; this conflicts with the **later cross-project NBR Agent v2.1 NOT CERTIFIED** hard gate. Do **not** silently equate historical SQL PASS with active Agent certification. Resolve with versioned evidence overlays, not by rewriting frozen records.
- AY 2027-28 gates remain REQUIRED/BLOCKED/NOT_RUN; keep fail-closed.
- Runtime bindings and engine parameter tables exist, including individual tax schedule versions and an evaluation log. Their mere presence does not certify numerical outcomes for every taxpayer class, event/date, exemption, rebate, minimum/final tax, withholding credit, or historical year.
- Security review: Supabase advisor warns `public.nbr_bind_admin_on_auth_signup()` SECURITY DEFINER is executable by anonymous and authenticated roles (confirmed privilege query); four RLS-enabled `nbr_*` tables have no policies (may be intentional server-only). `nbr-rules-api` Edge Function still has CORS origin `https://shihabshajib01-cell.github.io` rather than the restored `shihab2-tech` Pages origin. All functions advertise `verify_jwt=false`; `nbr-rules-api` contains internal user/session checks, which need dedicated end-to-end authorization testing. No claims of an exploitable flaw or live readiness without that test. **Do not attach the simulated Office Management login to these APIs.**

## Scope / 12-story UX-to-law-to-SQL crosswalk
Status legend: **FOUNDATION**=some verified database capability; **UI GAP**=not confirmed in restored Office Management; **NOT CERTIFIED**=requires law/security/runtime verification.

| User story | Required Admin UI behavior | SQL / legal evidence | Recovery disposition |
|---|---|---|---|
| US-RC-001 Tax-Year Management | Tax-year list/detail; AY and income period; period and legal cutoff; taxpayer class; coverage and approval state shown separately | `nbr_tax_years` four records | FOUNDATION, UI GAP |
| US-RC-002 Historical Rule Versions | Time-aware read-only historical versions, original instruments, event dates and limitations | Historical years incomplete; 1 version in AY 2025-26, 0 in AY 2024-25 | PARTIAL / UI GAP |
| US-RC-003 Six-Step Tax-Year Stepper | (1) year/base/cutoff (2) select/check/edit/create rules (3) official PDF+JSON (4) old/new legal diff (5) impact review (6) review & DRAFT | AY 2027-28 cloned non-executable; stepper previously reported deployed only in separate Admin Portal | FOUNDATION; original stepper code NOT RECOVERED |
| US-RC-004 Rule Hierarchy/Intake | Tax Year > Parent > Subrule > Child and original document preservation; grouping labelled administrative unless statutory | `nbr_rule_groups`, identities, versions; no proven statutory hierarchy schema from current table inventory | UI/SCHEMA GAP |
| US-RC-005 Year-Specific Rule Editing | Select/copy/edit as versioned proposal, preserve source identity, per-year applicability, do not inherit execution approval | `nbr_rule_versions`, `nbr_rule_change_requests` | FOUNDATION, UI GAP |
| US-RC-006 Official PDF/JSON Evidence | Upload *original bytes*, SHA, official URL, Gazette/issue/commencement dates; JSON/OCR marked extracted/untrusted | Legal originals exist in Project; no document-ingestion SQL tables identified in existing 14-table inventory | DATA/INTEGRATION GAP |
| US-RC-007 Legal Comparison | Original > amendment > current wording, substitution/repeal/savings, source locator and conflict; approval review-only | SRO210↔SRO273 controlled comparison is one example, not universal detector | UI/ENGINE GAP |
| US-RC-008 Cross-System Impact | Separate candidate vs verified impact across eReturn/eLedger/fields/forms/API/SQL/tests with OPEN unknowns | ER-6 partial field graph; live calculation dependency not certified | UI/TRACE GAP |
| US-RC-009 Custom Rules/Logic | Proposed parent/child/conditions/facts/exclusions/formula; no execution until verified/approved/tested | SQL revisions, parameter sets, tax-engine function exist | FOUNDATION, NOT CERTIFIED |
| US-RC-010 Cross-Year Diff | Side-by-side period/source/rule/version/status/changes with retained history | 2026-27 and 2027-28 366-version baseline | FOUNDATION, UI GAP |
| US-RC-011 Legal Review/Approval | Distinguish source evidence, legal interpretation, review, permissions, publication and activation; audit trail | Gate results, audit log, admin roles exist, but current-year PASS conflicts with later Agent certification | RECONCILIATION REQUIRED |
| US-RC-012 Historical Restoration/Audit | Version history and rollback *as new revision*, never mutate certified original or quietly re-enable old law | `nbr_rule_audit_log`, revision history; full recovery behavior not verified | PARTIAL, UI GAP |

## Non-negotiable rendering and rule behavior
1. Preserve existing Golden UI (navigation, shared table/form/drawer/modal, typography, EN/BN, accessibility); add screens only through the existing design system. Do not replace existing working pages or introduce a generic new preview.
2. UI uses legal-source-located and year/class-scoped rule metadata; no hardcoded statute, rate, effective date, default taxpayer eligibility, or unsupported status.
3. Keep five distinct axes: **legal source verification**, **period/class applicability**, **rule logic/version**, **execution authorization**, **product implementation/test state**. Database `active` by itself cannot override external Agent certification.
4. No automatic activation on completing Step 6 or cloning prior-year rules. New year is DRAFT/INHERITED_PENDING_REVIEW/NOT_CERTIFIED until separate evidenced signoff.
5. Every line of consequential UI/calculation traceable: Source > Provision > Requirement > Rule > Data > Calculation/Validation > UX > API/DB > Output > Audit > Tests.
6. Time axis must include AY, IY, transaction/service event, commencement, publication and savings/retrospective window; AY alone cannot select controlling law.
7. Do not mistake TDS/eLedger historical evidence for allowable credit: year/ownership/payment/duplication must be tested.
8. Keep simulated login separate from authenticated SQL/production capabilities. Protect production data. Security implementation is team-controlled.

## Execution order / acceptance
- **R0 — Source reconciliation:** recover true separate Admin Portal Rules & Calculation source or explicitly choose a different product host. Compare saved PR #12/#13/#14 and frozen UI; do not assume it is in Office Management.
- **R1 — SQL read-back:** prove 366 identities, year/version lineage, parameter revisions, gates, RLS/RBAC/audit and function signatures. Record contradictions with Agent certification; no mutation of certified baseline.
- **R2 — UX traceability:** page-by-page inventory and gap matrix vs 12 requirements. Produce small reviewed UI fixes using existing components; test EN/BN/responsive/keyboard.
- **R3 — Documents and persistence:** verify Admin > versioned SQL > Admin read-back > tested consumers, original file hashing, proposal/review separation, stable identity and evidence.
- **R4 — Calculation/legal gate:** revalidate official current/historical law and taxpayer facts; rerun required 137 post-upgrade regressions in the actual upgraded configuration plus 32 v2.1 suite, six E2E workflows and numerical edge cases; don't count archived PASS as new PASS.
- **R5 — Release:** authenticated role tests, security fixes and read-back, non-destructive migrations, deployment smoke; only certified portions may activate.

**Observed now:** No tax law source, certified registry, SQL row, Edge Function, UI route or live deployment was altered by this recovery audit. This document is a versioned evidence crosswalk, not tax-engine certification.
