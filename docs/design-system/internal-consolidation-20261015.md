# NBR Office Management V2 — Internal design-system consolidation, isolated tranche

**Baseline main:** `55635244e7b6dfa9929aeb0a4d4c6961cbf4f1f8` (verified 2026-10-15).  
**Branch:** `refactor/design-system-internal-contracts-20261015`.  
**Scope:** shared button renderer (Phase 5) and modal/overlay scroll-lock logic (Phase 7), plus nonvisual QA. **Not a claim of Phase 0–12 completion.**

## Before / after dependency map

| Area | Before | After | Appearance risk |
|---|---|---|---|
| Primary/Secondary/Danger buttons | Three separate copies of the same button DOM, loading-icon handling and class concatenation | Each existing public component delegates to `AppButton`, which emits the same element, child order, icon size and class order | Needs browser comparison; CSS unmodified |
| Modal and responsive overlay | Two identical body overflow / scrollbar compensation / cleanup effects | Both invoke `useOverlayScrollLock(open)` at the same effect position | Needs browser validation for stacked overlays; markup/CSS unmodified |
| QA | No specific compatibility test for these consolidated paths | DOM/interaction tests and dedicated non-deploying PR workflow | Static/unit evidence only until run |

**Required consumer review before release:** `PrimaryButton`, `SecondaryButton`, `DangerButton` references across route modules; `AppModal` and `ResponsiveOverlay` callers across User/Role/Permission/Register-4/Audit/Payment flows. Full direct-consumer enumeration and browser fixture coverage have **not been certified**.

## Changed-file manifest

| File | Reason / internal-only scope | Dependencies | Visual result | Functional result | Evidence / outstanding risk |
|---|---|---|---|---|---|
| `src/app/components/buttons/AppButton.tsx` | Phase 5: central DOM contract | 3 legacy button wrappers | Not browser-verified | Pending CI | New renderer must match legacy markup across all options |
| `src/app/components/buttons/PrimaryButton.tsx` | Phase 5: compatibility adapter | All primary button consumers | Not browser-verified | Pending CI | DOM class and loading test |
| `src/app/components/buttons/SecondaryButton.tsx` | Phase 5: compatibility adapter | All secondary button consumers | Not browser-verified | Pending CI | DOM class and loading test |
| `src/app/components/buttons/DangerButton.tsx` | Phase 5: compatibility adapter | All danger button consumers | Not browser-verified | Pending CI | DOM class and loading test |
| `src/app/hooks/useOverlayScrollLock.ts` | Phase 7: reuse existing scroll locking | Modal and responsive overlay | Not browser-verified | Pending CI | Geometry/scroll browser comparison still needed |
| `src/app/components/modals/AppModal.tsx` | Phase 7: replace duplicated effect, no markup change | All AppModal consumers | Not browser-verified | Pending CI | Need overlay interactions and focus verification |
| `src/app/components/shared/ResponsiveOverlay.tsx` | Phase 7: replace duplicated effect, no markup change | All ResponsiveOverlay consumers | Not browser-verified | Pending CI | Need mobile bottom-sheet and focus verification |
| `src/app/components/buttons/__tests__/buttonCompatibility.test.tsx` | Phase 11: exact class/markup and interaction lock | Button trio | Non-rendered test file | Pending CI | DOM assertions cannot prove CSS parity |
| `src/app/hooks/__tests__/useOverlayScrollLock.test.tsx` | Phase 11: style restore/compensation lock | Shared overlay hook | Non-rendered test file | Pending CI | Stacked overlay behavior not covered |
| `.github/workflows/design-system-internal-qa.yml` | Phase 11: non-deploying regression execution | New tests, existing unit suite and build | None | Pending CI | Does not implement full browser matrix or true lint |
| `docs/design-system/internal-consolidation-20261015.md` | Phase 0/12: truthful engineering manifest | Review and release process | None | Documentation only | Must be refreshed with actual run evidence |
| `docs/design-system/negative-space-20261015.md` | Phase 12: prohibited-change audit | Release protection | None | Documentation only | Dynamic content and screenshots not yet validated |

**DS-01…DS-31 crosswalk:** The request references these IDs but does not supply their definitions; this tranche is classified by named phases until the canonical DS finding registry is inspected. No fabricated mapping has been applied.

## Held out / known constraints

- PR #51 screenshot fidelity and #53 browser usability quality guards remain draft and independent.
- PR #58 changes Register-4 spacing. Do not merge it into this internal-only refactor or infer visual equivalence.
- The Register-4 inline editor horizontal-scroll / Save reachability defect is not fixed in this tranche.
- Dark-theme role stepper contrast defect is outside scope because a color adjustment would be visually perceptible.
- `npm run lint` currently aliases a Vite build; it is **not** a real lint pass. The dedicated workflow runs tests and build but does not misrepresent them as lint.
- Only Phases 5 and 7 have implementation changes. Typography, theme, spacing, MUI fields, table contracts, steppers, responsive architecture and all-route integration are **not complete**.

## Release gates

Pending: successful CI, same-state EN/BN screenshots at requested nine viewport sizes, four-font/six-theme representatives, focus/scroll/validation interaction QA, source-to-visible-element comparisons and independent owner-approved baseline review. If any check fails, keep `main`/GitHub Pages unchanged.
