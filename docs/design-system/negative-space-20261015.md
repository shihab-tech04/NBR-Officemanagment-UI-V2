# NBR Office Management V2 — Negative-space manifest (2026-10-15)

This manifest is **not** a visual approval. It records intentional absences for an isolated internal-only branch based on the source diff, with browser verification still pending.

| Forbidden addition/change | Source-diff intent | Evidence status |
|---|---|---|
| New visible buttons or shortcuts | None authorized or added in JSX; renderer emits original single `button` | Unit DOM test pending CI; browser unverified |
| New labels, placeholders, status banners or legal text | None authorized or added to application pages | Source diff review pending independent check |
| New form fields, inputs, dropdown/menu choices, or Register-4 proceeding fields | None authorized or added | Existing Register-4 tests must still pass |
| Changed routes, roles, navigation or authentication | No files in those areas modified | Source-diff restriction in PR CI; browser unverified |
| Altered statutory rules, calculations, data, API, SQL | No files in these areas modified | Source-diff restriction in PR CI |
| Changed font choices, themes, colors, component dimensions, spacing or breakpoints | No CSS, theme configuration or font data modified | Computed-style baseline comparison not yet performed |
| Removed Save/Cancel or changed X/✓ behavior | No Register-4 component was edited | Browser reachability not yet certified |
| UI changes in EN/BN / Compact/Standard/Large / 6 themes | No visual CSS source files edited | Full state matrix not yet run |
| Screen-wide horizontal overflow changes | No layouts or selectors edited | Must compare nine viewports |
| Silent merge of draft QA/spacing PRs #51/#53/#58 | Not part of this branch | Verify PR base/diff before release |

The renderer extraction and overlay hook reuse change internal code execution paths; tests and real browser checks are mandatory. **No deployment certification** is implied by an unchanged stylesheet.
