# Office Management → Payments UI visual-regression repair (2026-10-12)

## Controlling implementation

Source `shihab-tech04/NBR-Officemanagment-UI-V2` (PR #3 introduced the original seven-page Payment module). The correct baseline is the existing Office Management component library and shell, not the separately created TaxPay visual styling. The project is a simulated UI; no backend financial posting should be enabled. The original Payment-specific source fixture remains unchanged.

## Screenshot findings → traceable corrections

1. **Repeating orange warnings and technical metadata**: `PaymentModulePage.tsx` rendered `referenceBanner`, `modalNotice`, `analyticsDisclaimer` and detailed policy/provenance copy. These are not operational UI elements. Removed from the UI and recorded the controlled-source caveat here in documentation.
2. **Page width limited to content intrinsic width**: `.app-page-content--workspace` is a row flex container. Payment lacked `flex:1;width:100%;min-width:0`. Match established `.table-page` workspace containment and `20px 24px` padding. No global shell modifications.
3. **Truncated financial totals**: `repeat(auto-fit,minmax(170px,1fr))` produced five narrow cards, while `StatCard` ellipsized values. Payment grid now uses 3/2/1 columns with accessible exact values and untruncated wrapping, reusing `StatCard`.
4. **Full-width Add New and stacked modal actions**: shared `.app-btn--md` sets `width:100%`; original Payment omitted a size. Use existing `<PrimaryButton size="sm">` and `<SecondaryButton size="sm">` within the established `table-page__actions` and `AppModal` footer.
5. **Floating table without list metadata**: mount `ResponsiveTable` inside the existing `.table-card` and `.table-card__toolbar`, show row count, preserve desktop-table and mobile-card layouts and shared details drawer.
6. **Cramped/imbalanced content and cards**: use `--space-*`, `--fs-*`, `--color-*` tokens and existing `card` styles for full-width two-column overview cards and responsive grids. No new color palette.
7. **Raw backend enum codes**: convert offline event types `LIABILITY_REDUCED`, `OFFLINE_PAYMENT`, `LIABILITY_CREATED` to readable display labels; preserve internal identity in the fixture.
8. **Add New ended with technical disabled-posting text**: after local review, add an in-memory **Draft** row to the displayed list. This is a browser-session UI mock, not saved to SQL, NBR, Treasury, ACS or eLedger. Incident intake need not have TIN.
9. **Empty and developer-facing content**: use the existing card empty states and concise labels; do not claim working integrations or telemetry.
10. **Existing modules**: preserve `Case & Financial Management → Demand & Payment`, Audit, Administration, shell, EN/BN keys and earlier features. CSS changes confined to `src/styles/payment.css`.

## Release guard

Require Payment UI regression tests, existing main test suite, Vite production build, and GitHub Pages compiled asset smoke. A source check and build cannot prove pixel accuracy at all breakpoints; manual visual acceptance is still required for final visual signoff.