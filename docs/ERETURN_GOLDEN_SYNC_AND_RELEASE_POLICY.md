# GOLDEN RULE — eReturn Reconstruction ↔ Rules SQL ↔ Office Management

**Rule ID:** ER-GOLDEN-SYNC-2026-10-21  
**Status:** Mandatory for all new and modified eReturn reconstruction work, including parallel workstations.  
**Scope:** Citizen reconstruction `shihab-tech04/eReturn-V2` ↔ controlled NBR Rules SQL (`Bangladesh-NBR-eReturn`, project ref `ijcbllgjhhkcnbuygwdn`) ↔ Office Management `shihab-tech04/NBR-Officemanagment-UI-V2` > Administration & Requests > Rules & Calculation.  
**Exclusions:** No automatic reuse of TaxPay, eLedger, Office Audit or unrelated NBR projects. Those projects have separate ownership, databases and acceptance.

## Golden rule 1: 100% synchronized end-to-end, or explicitly NOT COMPLETE

The required invariant for every new or changed eReturn feature, rule, field, form, conditional, calculation, validation, API, database model, report or output is:

**eReturn UI/inputs/outputs ↔ versioned Rules SQL/API ↔ Office Management authoring/read-back and audit.**

All three must resolve the **same canonical field ID, rule ID/version, applicable AY and IY, taxpayer class/residency, event/commencement date, legally approved parameter, dependency edge, validation, calculation output, revision/hash and authorization**. A change in one surface must be evaluated on the other two. Preserve exact decimal precision and immutable version identity. SQL is shared system-of-record; `localStorage`, UI snapshots, AI output and document extracts are **not** cross-app authoritative state.

A UI-only styling change still needs a proven **no-data-contract-change assessment** and regression evidence, not a fictional SQL write. If a change affects persisted data, statutory behavior or shared fields, an actual authorized write/read-back and both consumers' verified behavior are mandatory. A stub, JSON mock, screenshot, API 200, archive PASS, branch merge or successful deployment **never alone proves 100% sync**. If an integration or protected authorization is unavailable, deliver independently safe work but report status **BLOCKED/PARTIAL**, never PASS/COMPLETE.

## Golden rule 2: no false completion claims

Every change record/release report must state separately:
- **Implemented:** exact files/commits, changed UI/state, database migrations and API versions actually deployed.
- **Verified:** actual test IDs, exact code SHA and environment, SQL version+read-back, field/rule parity diff, browser EN/BN desktop/mobile evidence, API response, calculation trace, approval and public release smoke as applicable.
- **Missing/blocked:** all unverified law, years, taxpayer classes, server permissions, endpoint dispatch, sync or E2E workflows.
- **Release:** distinguish `CODE MERGED`, `CI PASS`, `DEPLOYMENT PASS`, `LIVE ASSETS VERIFIED`, `FUNCTIONAL E2E PASS`, `LEGAL/CALCULATION CERTIFIED`, and `100% THREE-WAY SYNC VERIFIED`. Never collapse these into one “success”.

Use `PASS` **only** with captured evidence for the exact target deployment; otherwise `PARTIAL`, `FAIL`, `BLOCKED` or `UNVERIFIED`. Never invent approvals, current-law thresholds, rates, exemptions, credits, year coverage, backend persistence or acceptance results. AY alone never selects controlling law. Retain source/effective-date/exception traceability. Uncertified rules must remain fail-closed.

## Golden rule 3: never regress approved or solved work

Before changes:
1. Inventory current heads, approved screens/components, SQL schema/API contracts, source provenance, routes, tests, release versions and Golden UI baseline. Record the untouched SHA/behavior.
2. Perform scoped impact analysis `Source > Provision > Requirement > Rule > Data > Calculation/Validation > eReturn UI > API > SQL > Office UI > Output > Test`, and list the inverse consumers/dependencies, including tiny rate/threshold changes.
3. Preserve frozen 366-rule `FINAL_2026_09_30` registry and hash `34902bac07a459a4f0c051b90bfe3b4c492f2465d06c661bab18ab7f36252184` byte-identically. Only versioned sourced overlays may extend it. Preserve historical snapshots, IDs and archived expectations.
4. Reuse approved Office Golden components (modal for create/edit, table/mobile cards, drawer, buttons, forms, tokens, EN/BN and accessibility). Preserve reconstruction's approved eReturn forms and UI. Do not redesign solved modules, remove correct actions, introduce substitute shells, alter unrelated repos or weaken tests.
5. Run **old solved-feature regression tests plus new feature/negative/boundary/year/precision/authorization tests**, browser screenshots at 375/768/1280/1920 where applicable, both languages, and actual authorized SQL/API/UI read-back. Fix regressions before release. No “100%” claim based only on new tests.
6. Version changes in reviewable isolated commits/PRs with rollback plan and deployment verification; do not overwrite canonical identities or production taxpayer records for testing.

## Mandatory cross-system acceptance for stateful/regulatory features

`PROPOSED` change → controlling legal document/provision/AY-IY/taxpayer/event review → authorized new SQL rule/config version → Office read-back matching source/revision/hash → verified server API contract → same version in eReturn consumption → deterministic output, field/dependency impact trace, validations, negative/year/precision/duplication tests → Office and eReturn browser parity → audit evidence and rollback rehearsal → independent approval → release.

A hypothetical change as small as **0.0000001%** must be represented losslessly where contract precision permits and all affected calculations, fields, screens and outputs independently traced. No floating-point guess or silent rounding. If the source or contract does not support that precision, label unsupported and fail closed.

Preserve original 137 Agent cases, 32 Agent v2.1 acceptance cases and six persisted E2E workflows as release gates for executable tax-law changes; historical archived PASS labels do not count as post-upgrade reruns. Approval/activation must be separate from wizard completion, source upload or developer test success.

## Required change evidence checklist

For each PR/release affecting eReturn reconstruction, attach an **ER-SYNC ledger row** with:
`change_id | scope | eReturn_HEAD | Office_HEAD | SQL schema/version/transaction | affected rule IDs/versions | affected field IDs | tax year/IY/taxpayer/event applicability | source provision/hash | UI routes/screens | API contract/auth | SQL write+read-back | Office read-back | eReturn output/trace | old regression tests | new tests | EN/BN/mobile | security | rollout/rollback | status | exact blockers`.

**Release decision:** If the row lacks verifiable proof for any applicable dimension, the corresponding feature is NOT COMPLETE. Avoid production statutory calculation and publishing until legal/Agent/integration certification and protected signoff are evidenced. Safe UI/architecture/documentation work can proceed separately, with its scope honestly reported.

## Current boundary (2026-10-21)

Existing Rule SQL years and canonical identity counts are **not** proof of complete historical or corporate/individual tax-law coverage. The Office rule display remains SQL-snapshot-driven and full protected read/write synchronization is not certified. The eReturn frontend's fail-closed adapter and compiled Pages publication are separate UI/safety milestones, **not** a live approved taxpayer calculation or filing endpoint. Continue from this baseline; do not restart completed work or label the Rules Engine as 100% operational.

**This is a repository-wide working rule for eReturn reconstruction and its Office Rules subsystem; it records the user’s mandatory acceptance standard. It does not by itself provision production connectivity, modify SQL, certify law, or change ChatGPT account/project settings.**
