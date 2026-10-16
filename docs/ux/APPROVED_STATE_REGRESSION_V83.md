# UX/UI Agent v8.3 — Protect accepted screens

This change introduces **regression containment**, not a redesign. It does not alter Register-4 forms, menu choices, colors, data, SQL or taxpayer identity.

## Original failure
An accepted Register-4 New Entry modal uses shared \`Register4SectionField\` and CSS. Follow-on section/inline-row changes altered those dependencies. Functional assertions continued passing because existing screenshots were *captured*, not independently compared to approved visual goldens. English/Bengali screenshots with different taxpayers and popover states cannot be treated as a controlled before/after diff.

## Required procedure
1. Record exact approved states, source SHA, role, selected TIN/assessment year, viewport, EN/BN, popover/modal state and reviewer-approved baseline.
2. Determine **reverse dependencies** before changing reusable components or styles. A \`Register4SectionField\` edit affects both the New Entry modal and inline editing row.
3. Regenerate matching current-state screenshots and compare **against protected target-branch approved images**, not new PR-proposed snapshots. Execute actual interaction, keyboard, layout and responsive checks.
4. Any known approved state lacking evidence remains **NOT_VERIFIED** and blocks a final release; do not delete tests or invent golden approval.
5. Keep authorized controls only. Never add a "Remove last" or another option, status, field or action not approved.

## Executable check
- \`node scripts/ui-regression-guard.mjs --self-test\` verifies five negative/source-impact cases.
- \`node scripts/ui-regression-guard.mjs --check --base <target-SHA>\` writes \`test-results/ui-impact-report.json\` and detects impacted protected states, using actual reverse imports and shared styles.
- For impacted protected UI, source-independent golden evidence (on the protected *base branch*, with SHA-256) and a test with actual visual comparison assertions are mandatory. \`page.screenshot()\` alone does not qualify.
- **Initial protected visual baselines are NOT VERIFIED**. This is deliberate: the two recent screenshot examples differ in language, taxpayer and overlay state, so they must not be presented as approved golden pairs.
- This code does **not** do image analysis. Human or independently reviewed matching captures and browser tests remain required. It is a conservative change gate, not proof of a perfect UI.

## Release governance
The new PR check and Pages build gate operate only after this PR is merged. Required status-check branch protection must also be configured by a repository administrator; until then privileged users may bypass the PR check. This patch contains no application UI changes and cannot retroactively certify existing screens.