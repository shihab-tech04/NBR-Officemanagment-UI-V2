# Coding-agent UX/UI contract — version 8.6

This repository is an enterprise/government frontend for final developer handoff, not a demonstration. Preserve the established design system, solved screens, approved business rules, source data relationships, bilingual EN/BN experience, and existing reusable components. Do not invent features, fields, UI labels, demo banners or legal disclaimers. Do not claim backend, security, legal or final-project certification without verified evidence.

## Before editing
1. Read the specific user request, approved screenshots/Figma and existing code; distinguish current **defect evidence** from an approved target. Extract relevant visible information and do not omit fields or invent cropped content.
2. Set an explicit allowed/frozen/forbidden change inventory; trace every new/removed visible element to an approved requirement.
3. Trace shared JSX, CSS, tokens and translation dependencies to all affected screens and states. A `Register4SectionField` or `register4-entry.css` edit affects both New Entry and Add row, in EN/BN and open/closed states.
4. Keep the original table reading layout, unless a specific approved change requires otherwise.

## Definition of usable — not just renderable
A completed user task must let users understand their record context, enter/review fields, see validation and reach Save/Cancel without avoidable horizontal scrolling or hiding identity. Read-only large tables may scroll. Do **not** put a full-record form into fourteen table cells just to preserve the column order. Reject occluded, clipped, disproportionate or unreachably positioned controls, including in popovers, mobile and Bengali text expansion. Use existing design tokens and accepted interaction patterns.

## Release checks
- Run `node scripts/ui-regression-guard.mjs --self-test` and the dependency/approved-state check when applicable.
- Run `npx playwright test --config playwright.config.ts qa/register4-interaction-quality.pw.ts` when Register-4 or its dependencies change; release pipeline also runs this check.
- A test that merely clicks Save or captures a screenshot cannot establish UX acceptance. Compare actual DOM, geometry and approved matched-state screenshots independently; never auto-update golden images.
- In particular, if TIN/section information and Save/Cancel cannot be used in one working viewport at 1280/1440px (EN/BN), **FAIL the release** and repair the interaction. Never weaken or skip tests to force a pass.
- The new v8.4 browser gate currently FAILS against the scroll-trapped Register-4 editor, which is an unresolved product defect. No assertion should be removed to achieve green CI.

Report IMPLEMENTED, TESTED, DEPLOYED, FRONTEND ACCEPTED and FINAL ACCEPTED separately, with exact source/deployment SHA and evidence. Missing approved baselines or failing quality checks mean NOT ACCEPTED. Production branches, database, real taxpayer records and solved UI must not be changed by a governance-only task.

## v8.5 — Execute requests here; do not default to ChatGPT Work
When a user says "fix", "implement", "change", "test", "deploy", or "audit and repair", perform the authorized engineering action directly in the active conversation using available GitHub, Figma, files, runtime and testing tools. Small component changes, spacing, inputs, modals, buttons and localization are not reasons to route the user to ChatGPT Work. Never substitute an implementation prompt, roadmap or another long handoff for work you can execute now. Do not finish by routinely offering an optimized Work prompt. Recommend Work only when explicitly requested, or when an essential capability unavailable here would materially improve the task; explain that limitation, and let the user choose. Create prompts only when asked. If blocked, complete independently feasible parts and report what remains, without false release claims. This policy does not grant permission to modify any additional UI or waive approved-state and CI gates.

## UX Agent v8.6 operational verification — mandatory response integrity

Default to directly executing approved UI changes in the active chat using available tools. Never append an unsolicited offer for a second ChatGPT Work/Desktop/Codex prompt. Write a prompt only when explicitly requested. If blocked, report the exact missing capability/permission and work completed; never invent success.

For source/UI changes, freeze approved existing screens, extract screenshot content, trace reverse dependencies, identify approved visible-change inventory and explicitly forbidden additions. Reuse project-specific tokens and components. Regress every affected locale, role, viewport, focus, modal/overlay and keyboard state; run real task-level usability checks. Screenshot capture alone or passing CI does NOT certify approved visual equivalence.

The reusable `scripts/ux-integrity-gate.mjs` performs 20 positive/negative **controller** checks. Use `node scripts/ux-integrity-gate.mjs --self-test` for tool validation and externally reviewed, SHA-bound evidence bundles for `--predeploy` / `--postdeploy`. Its intentionally rejected `docs/ux/operational-manifest.template.json` must never be marked approved or filled with fabricated PASS values. The tool cannot authenticate human reviewers; real acceptance requires verified artifacts and owner-authorized approvals.

Do not merge/deploy as FINAL until original requirements, approved baselines, dependent-state diffs, accessible interactions, data/role boundaries, actual CI and live source readback are independently passed. Report IMPLEMENTED, TESTED, MERGED, DEPLOYED, FRONTEND_ACCEPTED, INTEGRATION_ACCEPTED and FINAL_ACCEPTED separately. An unprotected `main` or draft workflow is NOT enforced release governance. This file cannot modify other ChatGPT Project/session instructions.
