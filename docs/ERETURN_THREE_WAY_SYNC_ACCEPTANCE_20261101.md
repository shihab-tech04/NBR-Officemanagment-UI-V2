# ER-SYNC-2026-11-01 — Office Management ↔ NBR Rules SQL ↔ Citizen eReturn

**Acceptance target: 100% three-way consistency. Current state: PARTIAL / NOT CERTIFIED.**
This supplements, and does not replace, `ERETURN_GOLDEN_SYNC_AND_RELEASE_POLICY.md`.
Applicable exclusively to Office Management **Rules & Calculation**, canonical NBR Rules SQL and Citizen `eReturn-V2`. Nadia-owned work and unrelated TaxPay, Office Audit, eLedger and HRIS databases are outside this rule.

## Permanent source-of-truth rule

- **Authoritative SQL:** existing project `gtorruuhvohafapctxym` (`nbr_tax_years`, `nbr_rule_identities`, `nbr_rule_versions`, `nbr_rule_runtime_bindings`, protected audit and rules API). Preserve original rollback project `ijcbllgjhhkcnbuygwdn` as-is.
- **Office:** `shihab-tech04/NBR-Officemanagment-UI-V2` → Administration & Requests → Rules & Calculation. The separate Office DB `ihbtabrvmyiwikqqbhrf` is NOT a copy of canonical tax-rule SQL.
- **Citizen:** `shihab-tech04/eReturn-V2`. All approved calculations and effects must ultimately resolve the **same published SQL rule version, year, taxpayer facts, decimal strings and audit trace**.
- Neither Office's `rulesSqlSnapshot.json` nor Citizen's locally entered records can authorize executable legal calculations or approve a tax year.
- Both frontends use the same existing public, read-only `nbr-rules-office-gateway/public/years` endpoint only for **year identities**. Citizen's UI AY `2026-2027` maps losslessly to SQL AY `2026-27`; SQL IY remains `2025-26` for this example. Duplicates, malformed periods, mismatched AY/IY, unavailable endpoints and missing selected years fail closed.
- The `executable` flag in public SQL's year catalogue is a **stored database label only** and never an independent legal approval or permission to calculate, publish or file.

## State-changing and statutory rule gate

Each proposed change must complete the exact sequence:
1. Identify official legal source, effective/commencement and savings dates, AY/IY, taxpayer type, residency, event facts, rule and field IDs, dependencies, numeric precision and exceptions.
2. Office officer authenticates to **the Rules SQL project**, and the server confirms both an actual bearer identity and a separate authorized `x-nbr-rule-session` with least-privilege permission. Never reuse a token from a different Supabase project or ship `service_role` to browser code.
3. Create a **new immutable versioned proposal**, preserve frozen `FINAL_2026_09_30` baseline hash `34902bac07a459a4f0c051b90bfe3b4c492f2465d06c661bab18ab7f36252184`. Read the SQL revision and audit log back; check actor and exact source hash.
4. Independent law/numeric/security acceptance, including 137 original Agent cases, 32 v2.1 cases, six persisted E2E workflows, year/cross-user boundaries, duplicate prevention and exact decimal precision, must pass before approving or exposing the executable contract.
5. An authorized, version-pinned API publishes that **same** rule set and output trace. Citizen consumes only the approved contract; retries, stale or conflicting revisions, missing facts and unsupported years fail closed. Office read-back and Citizen deterministic output must match the server hashes.
6. Check EN/BN, 320–1920px, keyboard/accessibility, normal/empty/loading/error/retry paths, original approved components, protected branch/test gates, backup/rollback, and deployed production read-backs.
7. If any applicable proof is missing, mark the feature **UNVERIFIED/BLOCKED**, not COMPLETE or LIVE; do not turn a snapshot into executable tax data.

## Verified 2026-11-01 read-only starting evidence

- Repository baselines: Office `32889528f7d921110e445faf9a20f94d3ead3be9`; Citizen `903cccfdd5efe57efe87251995cc207894a7f664`.
- Rules SQL queried successfully: **4** year records, **366** canonical identities, **733** versions and **733** runtime bindings. **1** Auth user and **3** active admin-principal records exist; this does **not** verify a working authorized Office admin session.
- Rules API and `nbr-rules-office-gateway` are deployed in canonical Rules SQL. The Office public year reader was already present; full Office rule rows still display a recorded snapshot. Citizen statutory computation intentionally fails closed.
- This change set adds strict public AY/IY validation and live year parity messaging, not synchronized admin rule publishing, citizen calculation certification or a verified production E2E filing flow.
- Full 100% sync remains **BLOCKED** until role-bound Office protected read/write, approved versioned calculation API, independent legal/numeric gates and public end-to-end read-back all pass.

## Mandatory evidence row

For every change include: `source/field/rule IDs | legal source+hash | applicability | Office commit+auth+readback | SQL version+audit+hash | Citizen commit+response+trace | decimals | old/new tests | EN/BN+responsive | backup+rollback | deployed SHA | final PASS/FAIL/UNVERIFIED`.

No production claim based merely on current SQL counts, a PR, a screenshot, a 200 response or a static rules catalogue.
