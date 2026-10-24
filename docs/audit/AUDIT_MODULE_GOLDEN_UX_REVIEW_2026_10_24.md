# NBR Office Audit — Whole Module UI/UX and Design-System Audit

**Controlled baseline:** production main 3f6f29646657f14bc31d7e5671be2a6dd2c6b8ff (24 Oct 2026), current GitHub source and independently hash-verified pre-release source/history. The previous GitHub Pages deployment was successful.

## Route and wording inventory

The Audit module has eleven route states: Audit Overview, Initiate Audit, Audit Candidates, All Taxpayers, Risk Cases, Control & Data Quality, Second Review, Rules & Governance, Reconciliation, Audit Trail, Audit Manual.

The Audit translation namespace has 792 English and 792 Bangla leaf keys with exact key parity. Key parity does not prove that every long-form source excerpt has been linguistically certified.

## Verified design-system source checks

- Audit styling is based on Office CSS variables rather than hard-coded hex/rgb colors.
- Shared table, responsive/mobile card, detail drawer, form/filter, theme, spacing and typography primitives are already used and preserved.
- Existing dropdowns are sorted and expose searching when more than five nonempty choices are present; no unrelated replacement was made.
- The existing light/dark semantic token synchronization is preserved from the prior production release.

## Corrected problems

- Mixed English phrases in Bangla Audit Manual interface labels, search prompts, row details, formulas, source locations and empty states.
- Source examples area and select headings now communicate purpose without product-stage headings.
- Officer-facing labels describing locally loaded returns, generated profile history and funds-flow comparisons use clear language without implying legally certified live data or tax findings.
- The data-quality explanation avoids describing unverified source records as a prototype PASS.
- Browser acceptance expanded to all eleven routes in four combinations of light/dark theme, English/Bangla and desktop/mobile, with real rendered color tokens, JS errors, overflow checks and screenshots.

## Explicitly preserved evidence boundaries

The underlying Audit Manual contains recorded examples, historical references and unresolved source policies; these are source material, not independently established statute. We have not changed their example amounts, legal effects, approval states or meaning.

Generated candidate historical comparisons, national-scale population assumptions, audit signal triggers, missing evidence and proposed SLA policies remain UNVERIFIED unless separately proven. These UI changes do not create source-backed SQL/API integration, approve law or convert a screening flag into a finding.

## Release gates and remaining coverage

Status before exact-head CI and production deployment: PENDING. Require all original CI checks, the new 44-surface route/theme/language test matrix, private independent source/history backup with isolated restore and checksum/Drive read-back, protected merge and exact production Pages asset validation.

A green route screenshot means that rendering, theme and basic responsive checks passed for that route; it does not certify every taxpayer state, historical source excerpt, complex user journey, SQL contract, calculation or legal provision. Do not describe these as 100% complete without independently persisted evidence.
