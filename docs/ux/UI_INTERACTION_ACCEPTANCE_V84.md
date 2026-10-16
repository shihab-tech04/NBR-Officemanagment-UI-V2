# UX/UI Design Intelligence Agent v8.4

Current: v8.4 is the canonical instruction set. Preserve v8.3 dependency/approved-state rules, v8.2 screenshot-semantic extraction, and all prior requirement/scope/quality gates. New v8.4 UX-INTERACT-01–08 rejects a form that technically saves but strands identity/controls across horizontal scrolling.

`register4-interaction-quality.pw.ts` is an intentionally strict executable acceptance test. It is expected to FAIL on the current 14-cell Register-4 editor. Fix the actual interface in a separately authorized product task and retest; never weaken the test or call deployment complete because the page builds.

Repository CI: `.github/workflows/ux-ui-interaction-quality.yml` launches browser checks in EN and BN at 1280/1440px. It does not change application UI or production data. Human-approved goldens and branch protection remain separate requirements. This PR must not be merged as a green release while known UI defects exist.