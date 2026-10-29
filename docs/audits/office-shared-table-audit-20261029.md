# Office Management table-system audit — 29 October 2026

## Baseline and scope
- Inspected default `main` at `08578f0a6fb47092da3839936025ce021c758e04`, 810 repository tree entries.
- Reviewed JSX table creation and references across module pages and shared component folders, plus table, payment, audit and global CSS and existing browser/unit tests.
- User-approved visual reference: **Audit → All Taxpayers**. Scope is reusable list/register data tables, not redesign of business-specific comparative financial matrices.
- Preserve Office routes, EN/BN, themes, roles, sorting, search/filter, actions, responsive mobile cards, records, service mappings, API and SQL.

## Canonical architecture (already present)
```
Module-specific records, columns, filters, sorting
  ├─ GeneratedTablePage (configured module registries and reports)
  ├─ AuditModulePage (including All Taxpayers)
  ├─ PaymentRecordList (Transactions, Corrections, Incidents, Offline Events, Taxpayer 360)
  └─ other module-specific page adapters
      └─ ResponsiveTable
          ├─ CardTable (desktop semantic table, sort buttons, badge cells, row actions)
          └─ UnifiedMobileCard (small-screen mapping and actions)
Shared wrapper: table-card / table-card__toolbar / table-card__pagination
Shared navigation: Pagination
Shared CSS: src/styles/tables.css, src/styles/globals.css
```

## Module inventory and current table path
| Module | Direct implementation / adapter | Table system |
| --- | --- | --- |
| Audit — All Taxpayers, Risk Cases, Control & Quality, Reviews, Governance | `pages/audit/AuditModulePage.tsx` | `ResponsiveTable` + `Pagination` |
| Audit — Candidates | `pages/audit/AuditCandidatesPage.tsx` | `ResponsiveTable` list + `Pagination` |
| Audit — Manual | `pages/audit/AuditManualPage.tsx` | `ResponsiveTable` |
| Payments — Transactions, Corrections, Incidents, Offline Events | `pages/payments/PaymentRecordList.tsx` used by `PaymentModulePage.tsx` | `ResponsiveTable` + `Pagination` |
| Dashboard, PSR, Double Entry, Combined | `pages/dashboard/*DashboardPage.tsx` | `ResponsiveTable` |
| Administration — Permissions, Roles, Users, Special Registration | `pages/administration-requests/*Page.tsx` | `ResponsiveTable` + `Pagination` |
| Report — User Activity | `pages/report/UserActivityReportPage.tsx` | `ResponsiveTable` + `Pagination` |
| Reports and other configured registers | `components/pages/GeneratedTablePage.tsx` and `components/reports/ReportPage.tsx` | `ResponsiveTable` + `Pagination` |
| Rules and Calculation / Year Comparison | `pages/rules-calculation/RulesCalculationPage.tsx` and `RuleYearComparisonPanel.tsx` | `ResponsiveTable` + `Pagination` |

### Intentional semantic exception
`pages/audit/AuditCandidatesPage.tsx` also renders an `audit-comparison-table` inside the detail comparison. This is **not** an ordinary record list: it has year-dimension columns, section row groups, conditional metric rows, special balance tags, and full/focus comparison modes. Replacing it with a flat register table would destroy semantic row groups and comparison behavior. Preserve the matrix structure, and keep shared typography/color tokens. The production list/register component remains `ResponsiveTable`.

## Reproduced problems and root causes
1. **Transactions collisions:** `src/styles/payment.css` had page-specific width overrides that forced a content-heavy 9-column table into fixed cells with less space than its spans required. Labels extended into following columns.
2. **Unbounded pagination:** `src/app/components/shared/Pagination.tsx` rendered `Array.from({length: totalPages})`, hence 63 numbered buttons for 628 rows at 10/page. This also affected other large lists.
3. **Global text width:** `.card-table__cell-text--normal/--long` used viewport caps without also constraining width to the containing table cell.
4. Existing shared implementation should be preserved; creating a parallel Payments-only table component would perpetuate inconsistencies.

## Resolution in PR #157
- Reuse existing Audit-compatible table/card shell and shared row controls.
- Prevent text spans from exceeding cell boundaries; preserve full values via title/tooltips and detail actions.
- Apply stable column presentation for Transactions, with horizontal scroll confined to the shared table wrapper below full desktop widths.
- Replace unlimited page-number buttons with bounded first/last and current-window navigation plus non-interactive ellipses.
- Preserve page size selection wherever it was already offered; preserve localized numbering.
- Add unit coverage and browser geometry regression assertions for desktop widths 1280/1440/1713.
- **No** SQL/API/business rule changes.

## Acceptance gates
- Responsive browser: no text collisions at 1280/1440/1713; no document-level horizontal overflow on small screens.
- Four page views: Transactions, Corrections, Incidents, Offline Events preserve actions and filtering.
- Audit → All Taxpayers retains its approved layout, statuses, row actions, and compact pagination.
- Shared page counts and English/Bengali digits remain correct.
- Source backup: exact main commit `08578f0a` backed up and isolated SHA-256/restore verified.
- Production gate: PR checks green, protected merge permitted, GitHub Pages deployment finished, deployed code verified at the public URL.

## Conflict boundary
Office `#156` (taxpayer allocation) is a separate open draft and is **not** incorporated or overwritten. TaxPay code and SQL remain unchanged.
