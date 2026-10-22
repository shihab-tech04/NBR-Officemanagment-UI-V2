# WS04 existing deployed v12 versus the recovered W5 candidate

**Status:** SOURCE COMPARISON VERIFIED; implementation LOCAL TESTED; deployed function UNCHANGED.

Original deployed Edge `nbr-tax-engine` v12 on Supabase `ijcbllgjhhkcnbuygwdn`, internal `NBR-TAX-ENGINE-1.5.0` and gateway `verify_jwt=false`; deployed source snapshot SHA-256 `1a228c1102fb41b7d698dcfa2620972fb507af386ca51f1a07251f9daf1005e8`. Original PR108 source SHA-256 `eb7dae764871b60580992d63d599c41298abba88e3a57dc9be9fc4dbd7665aaa`, exact previous head `45b275e3362eb83288a5fc385c6e05514ae96828`. These originals are not overwritten.

## Changes preserved from prior W5 repairs and now strengthened

| Surface | Live v12 | Recovered W5 & current 22-Oct candidate |
|---|---|---|
| Taxpayer caller | No observed per-request Auth at calculation POST | Verified bearer and Supabase Auth `getUser`; exact caller UUID; service-role token not a citizen token |
| Taxpayer ownership | No observed trustable owner proof | WS02-owned owner RPC, fail closed when missing/unauthorized; now before privileged tax-year/rule reads |
| Cross-origin | `*` CORS | Exact approved HTTPS allowlist, no wildcard credentialed responses |
| Draft/year gates | `state=active` and `is_executable=true`, historical seed gates | 366 exact frozen rule IDs, version/runtime hashes, five independent approval gates, source revision and event cutoff |
| Decimal | v12 descriptive percentage parser passed through JavaScript Number; decimal parser could silently truncate | Literal structured rate only; exact bigint percentage; reject over-scale precision; reject JS float monetary fields; explicit truncation policy attestation |
| Rebate | Ambiguous legal text and permitted rate option selection | Structured section-78 version-linked attestation; unstructured prose not an executable formula; no unconditional rebate |
| Credit | Client paid/withholding amount could reduce final balance | Nonzero client credit claims are evidence-only, never credited absent WS02 ledger owner/duplicate/reversal approval |
| Base-tax SQL | Legacy 5-arg RPC unpinned version; missing amount could default zero | Proposed reviewed RPC requires pinned parameter revision/ruleset hash; signed-back version and policy; missing amount fails closed |
| Idempotency | No confirmed atomic replay guard | WS02 reservation & receipt-finalize RPCs required; missing RPC rejects all calculation |
| Audit | Existing evaluation log | Service-role-only log and deterministic receipt hash; no returned tax result when audit/finalization fails |
| Submission | Calculated status may have implied submission ready | Candidate forces `submissionReady:false`; tax arithmetic is not filing permission |
| Default behavior | Production Edge v12 active at endpoint | Candidate requires `NBR_TAX_EXECUTION_ENABLED=true`, OFF by default, NOT DEPLOYED |

Legacy app-side fixed-slab calculator source remains for diff/provenance but now immediately throws `NON_SQL_STATUTORY_CALCULATOR_DISABLED`; only independently verified SQL is allowed as statutory base-tax authority.

## Verified 22-Oct SQL/source limitations

Existing `INDIVIDUAL_TAX_SCHEDULE` AY2026-27 rev2 is `ACTIVE` by SQL with NBR circular source, **not a certified approved staging fixture**. AY2027-28 rev2 is DRAFT. New gate count is 0/5. Approved WS02 ownership, reservation, finalization and version-pinned base-tax RPC do not exist in observed production schema. No real E2E Auth, PG17 two-identity fixture or legal-number comparison was possible. No SQL migration made.

Current local candidate tests: 89/89 PASS under synthetic in-memory RPC and frozen registry identity. Re-run at exact committed head and attach Actions provenance. Full 137 original Agent tests + 32 v2.1 + six persisted workflows remain not certified here.

## Rollback / recovery

No current production files/functions/SQL have been altered. Candidate remains a separate draft PR branch; restoring to original v12 is a source-only action, not a destructive DB migration. Preserve SHA-256 original v12, deployed v15 Admin source, old W5 checkpoints, SQL/version snapshots and verified checksums in backup outside GitHub. For eventual staging deployment, independently test rollback to the saved function version and its companion SQL versioned schema, validate readbacks and keep write/return interfaces disabled. Production deployment is prohibited before WS01 legal authorization, WS02 security/migrations, WS07 independent result comparison and release-controller approval.
