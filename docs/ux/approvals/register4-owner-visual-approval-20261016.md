# Register-4 — owner-approved visual appearance at c168edb (2026-10-16)

## Explicit owner statement

On 2026-10-16, in the active project conversation, the user stated:

> I have personally reviewed all 14 Register-4 screenshots for commit c168edb28d4627b970e130309ba074bf192530be and approve their visual appearance. Proceed with recording this approval, completing the remaining evidence requirements, and merging/deploying only when all required checks pass.

This record transcribes the user's stated approval; the automation account has **not** impersonated an independent GitHub reviewer. The statement is limited to visual appearance of the specific fourteen screenshots, not a blanket approval of backend behavior, later changed UI, 24 older source-image observations, or the complete release.

- **Reviewed source SHA:** `c168edb28d4627b970e130309ba074bf192530be`.
- **CI capture run:** https://github.com/shihab-tech04/NBR-Officemanagment-UI-V2/actions/runs/38858687324
- **Source artifact (ZIP):** https://github.com/shihab-tech04/NBR-Officemanagment-UI-V2/actions/runs/38858687324/artifacts/12028805310
- **PR conversation acceptance record:** https://github.com/shihab-tech04/NBR-Officemanagment-UI-V2/pull/71
- **Viewport:** desktop 1440×900; mobile 390×844.

## SHA-256 per reviewed screenshot

| State | Screenshot SHA-256 |
| --- | --- |
| `table.en.closed.png` | `06eb71a7dc4f3266b20ce808812e01c8bba3ea8233e71750bea91c3623358089` |
| `table.bn.closed.png` | `a8f8d3c88c7737f7da238999473ec7812459c01ac2c357f2ba23cef5540ce38b` |
| `modal.en.lookup.png` | `917c0809855be1f37bb1071db2c81dc0edd8cd04aa14f5a232ff83588ee280ff` |
| `modal.bn.lookup.png` | `5d3e3210d95ce797fef9b74bb9b5eb6cebc5aef3f75d4a9e01e50f100a259d3f` |
| `modal.en.filled.png` | `9df626e8e0e839c963891e7effe853b81ed1c6b031917c1a533b6e9812833c2a` |
| `modal.bn.filled.png` | `1bb9fa034c35768aaf426da63b3fe19d16dee2f54a427600789a0bdcba933165` |
| `modal.en.section-open.png` | `d20ec44d7efc5bdf70be516cee8ce152da3795c6260ccd01dbdac7e80cf11fc2` |
| `modal.bn.section-open.png` | `ecaa8641f48546818dc089c04bfaa204d2390313cf837c027af5ff1bd0735cb0` |
| `modal.mobile.en.png` | `652f4e8cfc82ab4b8178735fa0f4d6539a52e9b860d8d376ca332f2496bf9944` |
| `modal.mobile.bn.png` | `7995f33d50de750775633a1de681808057f35ca8dc42400bab4d5b617e003b39` |
| `inline.en.open.png` | `6b773bb3874731933a14bc936ebdc6f79374d42d6915ff38001f72d304f4ff3c` |
| `inline.bn.open.png` | `7efc36b1718ea5187627b90954ee08fe68ab690ec6425c5df4a660177cabb8d9` |
| `inline.mobile.en.png` | `ba4ed30f3f130ed24ce4fe9219aa5506cb535695848b9e50ce3ed8a5226e8685` |
| `inline.mobile.bn.png` | `4ee12524e3c80c786a21324afbd21a9d28f98b58f812927844bc7d98f5c744f6` |

These hashes were computed from the extracted artifact bytes; the artifact is not automatically a repository target-branch golden. Importing any of these frames into an immutable main-branch reference and establishing real matched-state visual diffs is a **separate** baseline task. Every candidate UI modification after the reviewed source SHA requires impact analysis and fresh accepted comparisons for changed states.

## Unresolved, not silently approved

1. Register-4 original left/right screenshots: two full-image second passes, source-intent reconciliation and all R4-001–R4-024 observation evidence in `docs/ux/screenshot-fidelity/register4-image-ledger.json`.
2. Independently reviewed baseline-vs-actual visual comparisons and fourteen locked, immutable approved-golden references under `main`; assertions must actually compare pixels/images.
3. Green release checks, merge, GitHub Pages deployment and live-site verification. Until then, deployment remains blocked.
