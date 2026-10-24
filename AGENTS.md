# Office Management — Scoped Agent Instructions for eReturn Rules

## Product writing Golden Rule — Office Audit and all Office UI

All customer-facing screens must be written and presented as finished product experiences. Never display engineering-stage labels such as “Reference only”, “demo”, “prototype”, “example configuration”, “framework-only” or similar qualifiers in titles, badges, drawers, cards, footers, or explanations. Use short, clear, action-oriented English and Bangla so an officer can understand the situation and next action quickly. This is a presentation rule, **not** permission to invent data, legal authority, thresholds, approvals, completed work, or audit findings. Show actual missing/invalid/evidence-pending states in plain product language and fail closed until verified.

Audit signal detail must use the source-defined condition and relevant documents. A taxpayer drawer must use that taxpayer's own return, year, data quality and coverage context; an overview drawer must use the current filtered population and denominator. Do not show one taxpayer's coverage as a population-wide coverage state. Never confuse a generated financial trend with verified source figures or substitute dashboard funds-flow difference for R-C1 IT-10B lines 10 − 7. Keep the existing Golden UI, nested Back/Close behavior, EN/BN parity and responsive tests.

## Scope

These requirements apply to **Administration & Requests > Rules & Calculation**, its SQL connection, legal rule versions, year records, calculation/validation controls, API integration and every change that impacts the **new eReturn reconstruction** repository `shihab-tech04/eReturn-V2`. Other Office modules (Audit, Content Management, roles, payments, etc.) retain their existing ownership and Golden UI; do not modify them as collateral work.

**Mandatory document:** [ERETURN_GOLDEN_SYNC_AND_RELEASE_POLICY.md](docs/ERETURN_GOLDEN_SYNC_AND_RELEASE_POLICY.md). Read and follow it before coding. The cross-repo proposed contract is [ERETURN_V2_RULES_INTEGRATION_CONTRACT.md](docs/ERETURN_V2_RULES_INTEGRATION_CONTRACT.md).

### Golden Rules (effective 2026-10-21)

1. **Three-way verification is non-negotiable:** eReturn input/logic/output ↔ controlled versioned Rules SQL and approved API ↔ Office Management source-backed editor/read-back. New stateful features are NOT COMPLETE without verified field/rule/version/period parity, actual SQL/API read-back where applicable and both consumer checks. Static `rulesSqlSnapshot.json` is reference evidence, never real-time synchronization.
2. **Do not claim PASS or 100% without evidence.** Report exact commits/environments, schema/API versions, authorized SQL mutations/read-back, legal-source version, calculation trace, UI EN/BN mobile/desktop tests, existing regressions and deployment/live URL checks independently. Unknown = UNVERIFIED; blocked auth/law = BLOCKED, never silent success.
3. **Preserve solved UI and frozen legal baseline.** Reuse shared Office `AppModal` for creation/editing, approved table/mobile cards, forms, drawers, buttons, tokens and accessibility. Preserve solved routes and features; add only scoped changes, maintain rollback, and rerun old regression tests. Preserve frozen 366-rule SHA and historical snapshots, extend with versioned reviewed overlays.
4. **Never mix projects.** eLedger, TaxPay, Office Audit and unrelated NBR projects are not this Rules subsystem's database/API dependencies. Do not fabricate corporate/individual historical coverage or activate the engine from SQL “active” labels.
5. **Agent-first execution gate:** 137 original Agent regressions + 32 v2.1 controls + six persisted workflows and source-backed/legal/numeric/authorization acceptance remain required before executable tax-law activation; archived PASS is not a fresh rerun.

A docs/UI-only change may prove no shared-data-contract impact rather than making a fake database write; it still requires non-regression evidence. User requests to release mean perform a safe release of independently verified scope, not certify unrelated incomplete functionality.

**This file is a coding and review instruction only; it is not evidence that SQL, authentication, legal certification or three-way parity is already implemented.**
