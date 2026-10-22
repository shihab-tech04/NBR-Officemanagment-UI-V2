# Register-4 screenshot-to-UI information fidelity

This folder records the user's **two horizontal-scroll screenshots** as one Register-4 interaction defect. It preserves **24 semantically relevant observations**. Source images are retained in the UX/UI Agent Library under `/UX-UI Design Intelligence Agent/examples/`; the JSON references those exact Library paths. These are *defect evidence*, not approved image goldens.

`node scripts/screenshot-fidelity-gate.mjs --self-test` tests the validator against synthetic positive/negative manifests.

`node scripts/screenshot-fidelity-gate.mjs --audit docs/ux/screenshot-fidelity/register4-image-ledger.json` reports missing mappings/reviews without implying release readiness.

`node scripts/screenshot-fidelity-gate.mjs --release docs/ux/screenshot-fidelity/register4-image-ledger.json` **fails until** all relevant screenshot information has been independently re-read, mapped to implemented output, cross-checked against the rendered UI, and approved with source/deployed SHA and matched-state evidence.

The checker does **not** automatically read screenshots, compare pixels or authenticate reviewer signoff. It enforces an evidence contract; the missing human/visual-capable assessment cannot be made green by inventing evidence. Every affected screen also needs Playwright DOM/interaction coverage and independent approved-target screenshot comparisons. Don't delete observations to pass this check; resolve all relevant image content.

Current release status: **NOT ACCEPTED**, consistent with user's screenshots of the 14-cell inline editor. This draft PR adds QA only. It does not repair or deploy UI and should not be merged as proof that Register-4 is finished.
