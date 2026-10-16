# Register-4 full-source second pass — technical reconciliation (2026-10-16)

## Source and scope

The two source defect images were retrieved directly from the existing workspace; no owner upload was requested. They are **original defect evidence**, not target goldens:

| Source | Dimensions | Original-byte SHA-256 |
| --- | --- | --- |
| `register4-left-scroll-20261014.png` | 2048 × 1015 | `bafc997c5eb3ac7b2bc9a32b342dd25e4cc343005b6047c53be5649016846036` |
| `register4-right-scroll-20261014.png` | 2048 × 1018 | `50a54f57fbb1d26cd67b951c8906654cccbfd124f6939be54317eb03105b1e3f` |

The implementer read the complete left and right originals at original resolution, including the horizontally separated entry row. The image copies under `reference_images/` and `library_evidence/` had identical hashes. This is **technical source review**, not an independently authenticated reviewer approval or a claim that every region is a separately signed full-image pass.

On 2026-10-16 the owner separately approved **visual appearance** of all fourteen proposed candidate PNGs for source `c168edb28d4627b970e130309ba074bf192530be`. The evidence lives in `docs/ux/approvals/register4-owner-visual-approval-20261016.md`, PR #71 and artifact 12028805310. PR #72 separately locks their hashes on `main`.

## Twenty-four observation crosswalk

`MAPPED` means implementation and/or browser-test evidence was located, **not** independently accepted. `PARTIAL` marks content not fully visible in any of the owner's fourteen approved captures, or a semantic change requiring explicit reconciliation. The two supplemental right-scroll table/editor screenshots are information-evidence candidates, **not approved goldens**.

| ID | Original image observation | Implementation / test evidence | Technical result |
| --- | --- | --- | --- |
| R4-001 | Register-4 heading | `Register4ListPage.tsx`; `table.en.closed.png`, `table.bn.closed.png` | MAPPED |
| R4-002 | Register & Stock shell, breadcrumb, active Register-4 item | Shared `GeneratedTablePage`; approved table captures | MAPPED |
| R4-003 | New Entry, Add row, Hide Summary | `Register4ListPage.tsx` entry and inline components; Playwright `register4.pw.ts`; approved table and inline captures | MAPPED — functions differ as intended |
| R4-004 | Four cards: 8, 0, 0, 0; sample/local context | `buildRegister4Kpis`, `register4.pw.ts`; approved table captures | MAPPED |
| R4-005 | Search, Filter, Download, Print | Shared `GeneratedTablePage`; approved table captures; relevant shared tests | MAPPED |
| R4-006 | S/N | `REGISTER4_ASSESSMENT_COLUMNS`; `register4.pw.ts` header checks; approved table captures | MAPPED |
| R4-007 | Circle | Same typed table schema and bilingual captures | MAPPED |
| R4-008 | Taxpayer Name & TIN | Same schema; `register4.pw.ts` controlled TIN lookup; approved table captures | MAPPED |
| R4-009 | Folio No. | Same schema; `register4.pw.ts` requires blank/read-only draft folio | MAPPED |
| R4-010 | Disposal Code (Section) | Schema and `Register4SectionField.tsx`; browser history/option tests; approved table and modal section states | MAPPED |
| R4-011 | Tax Year | Assessment-year data with existing translated Tax Year display; table and form screenshots | MAPPED |
| R4-012 | Assessment Date | Schema and `register4.pw.ts` date form/filter tests; approved table captures | MAPPED |
| R4-013 | Assessed Income | Schema contains exact key; amount component and browser form tests | PARTIAL — rightward column outside the 14 owner-approved images |
| R4-014 | Created Demand / Allocation: Arrear and Current Tax Year | Typed grouped header and both keys in `register4AssessmentTable.ts`; grouped-header assertion | PARTIAL — actual right-scroll image comparison needed |
| R4-015 | Penalty | Typed table column and form input | PARTIAL — supplemental right-scroll capture pending independent review |
| R4-016 | Revised Demand / Allocation | Typed table column and form input | PARTIAL — supplemental right-scroll capture pending independent review |
| R4-017 | Remarks (if any) | Typed table column, inline input and form | PARTIAL — supplemental right-scroll capture pending independent review |
| R4-018 | Actions at far-right editor | `Register4InlineRow.tsx` Save/Discard, sticky actions in `register4-entry.css`; 1280/1440 geometry tests | MAPPED — actions are editor-only, not an extra read-only table column |
| R4-019 | Disproportionately tall 14-cell editing row | Compact `Register4InlineRow.tsx`; `register4-interaction-quality.pw.ts`; approved inline captures | MAPPED — defect changed as intended |
| R4-020 | TIN-derived name, Circle and blank Folio | `findRegister4Taxpayer`, `updateTin`, read-only Folio tests | PARTIAL — Circle is an authorized select in current approved UI, unlike old defect image's apparent locked field |
| R4-021 | Section selector, Add a section, proceeding ref/date fields | `Register4SectionField.tsx`, negative-space checks in `register4.pw.ts`; owner-approved modal/inline captures | PARTIAL — former extra proceeding fields absent from accepted appearance; source-intent removal requires explicit validation |
| R4-022 | Tiny remote Save/Discard icons | Existing icon actions remain but sticky/reachable; `register4-interaction-quality.pw.ts`; approved inline captures | MAPPED — intentional correction |
| R4-023 | TIN and Save/Cancel separated by horizontal scroll | Sticky approved Action column; browser verifies left identity and right hit target; approved inline captures | MAPPED — original usability defect corrected |
| R4-024 | Eight read-only rows, scrollable groups, finance/date alignment | Typed `REGISTER4_ASSESSMENT_COLUMNS`, 8-row browser checks, alignment expectations | PARTIAL — right-scrolled values and alignment still need matched-state evidence |

### Guardrails and evidence boundaries

- `NO-REMOVE-LAST`: `qa/register4.pw.ts` explicitly asserts that the forbidden `Remove last` option is absent. This is functional evidence; not a claim of independent approval.
- `NO-ARBITRARY-FORM`: compact desktop inline row and mobile field-group editor are covered by browser QA and the fourteen owner-approved appearance frames. No new fourteen-cell full-record replacement was introduced.
- The extra information-review images `table.{en,bn}.right-scroll.png` and `inline.{en,bn}.right-scroll.png` are captured separately by `qa/register4-visual-review.pw.ts` and intentionally are not treated as owner-approved baseline files.
- **This report cannot self-sign** `full_image_second_pass`, `approved_visual_comparison`, or `acceptance` in `register4-image-ledger.json`. Until the independent original-image/intent review and approved matched-state visual comparisons actually finish, the ledger's final release gate must remain red.

## Next evidence acceptance

Review the four supplemental right-scrolled images and the semantic differences R4-020/R4-021, record exact reviewer verdicts with source/actual references, and only then update each ledger row supported by that evidence. Independently run and inspect the fourteen pixel comparison assertions against the immutable `main` references. Never substitute this implementer's crosswalk for owner signoff.
