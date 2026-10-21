# WS04 deterministic evaluator — candidate contract and handoff

Status: **LOCAL TESTED ONLY / FAIL CLOSED / NOT HOSTED / NOT CERTIFIED** (2026-10-22).

This is the recovered W5 candidate, extended non-destructively. The certified 366-rule registry and original Agent expectations are unchanged. No new Bangladesh legal rate or exemption has been supplied. This package is NOT registered for a production release or executable activation.

## Recovered baselines
- `nbr-tax-engine` production v12 SHA-256 source `1a228c1102fb41b7d698dcfa2620972fb507af386ca51f1a07251f9daf1005e8`.
- Identity-guard candidate SHA-256 source `bf60ab814d63a5ac3e4c2c91ba3753fa4dbde8ac6a67c23ca79bafca64a57f3a`.
- Calculation-repair candidate before WS04 extension SHA-256 source `e42cebd5053af1c4f6770cb320eb2982826799f954e8d13b766d508138f4b861`.
- Original canonical registry SHA-256 `34902bac07a459a4f0c051b90bfe3b4c492f2465d06c661bab18ab7f36252184`.

## Transport and authorization

POST `/functions/v1/nbr-tax-engine` is **NOT production-authorized**. Requires a valid Supabase Auth bearer token independently checked with `auth.getUser(token)` (Admin `x-nbr-rule-session` is not a citizen credential). With `verify_jwt=false` in production, application-layer authentication is mandatory. Restrict credentialed browser CORS to `NBR_TAX_ALLOWED_ORIGINS` exact HTTPS host origins; missing allowlist prevents browser access. Service-role tokens are forbidden as taxpayer credentials.

Before any evaluator SQL read or RPC, require a trusted taxpayer-record authorization: `nbr_authorize_citizen_evaluation(p_auth_user_id uuid, p_taxpayer_record_id uuid, p_assessment_year text) returns boolean`. WS02 exclusively owns its **SQL implementation and migration**. SQL must validate the authenticated actor supplied from the server, immutable taxpayer ownership, applicable tenant boundaries and appropriate return/record access; do not trust a client `userId`, client session label, tax ID, arbitrary TIN or mutable user metadata. A missing RPC, malformed response or database error => 503 `OWNERSHIP_GATE_UNAVAILABLE`; a verified false result => 403 `TAXPAYER_ACCESS_DENIED`; neither may return tax amounts. This RPC DOES NOT YET EXIST in observed production SQL and its ownership data model is unconfirmed. **No real evaluation is approved or possible with this candidate until WS02 acceptance.** Do not invent a taxpayer table or grant.

## Draft request type (not published API)

```typescript
type DecimalString = string; // canonical unsigned decimal, <=10 fractional digits on supplied money
interface DraftCitizenEvaluation {
  assessmentYear: string;          // explicit "YYYY-YY"; must be active and legally certified
  incomeYear: string;              // must equal approved SQL tax-year record
  taxpayerRecordId: string;        // UUID subject to verified server-side ownership
  taxpayer: {
    entityType: 'individual';      // corporate evaluation is NOT implemented or authorized
    specialCategory?: string;      // must map to independently approved classification
    isNewTaxpayer?: boolean;
    disabledChildCount?: number | string;
  };
  returnData: {
    incomeHeads: Record<string, DecimalString>;
    taxRebates?: Record<string, DecimalString>;
    taxDeductedAtSource?: DecimalString;
    advanceTaxPaid?: DecimalString;
    selfAssessmentTaxPaid?: DecimalString;
    adjustedTotalIncomeForRebate?: DecimalString;
    eligibleInvestmentAmount?: DecimalString;
  };
  ruleFacts?: Record<string, { baseAmount?: DecimalString; quantity?: DecimalString; providedFacts?: Record<string, unknown> }>;
}
```

This draft transport does **not** yet satisfy the complete canonical typed contract. Mandatory future fields: industry, residency, special class, income/event dates, taxpayer ownership evidence, law source cutoff, parameter set fingerprint, exact rule-version list, selected legal statuses and savings decisions, applicable rounding policy, withholding paid-vs-deducted and duplicate-payment references, reversal/refund ownership, end-to-end output hash and idempotency key. Missing versions/approvals/conditions must block instead of making default law. Corporate turnover/final tax and independently validated tax credits are not approved in this candidate.

## Existing and new fail-closed semantics
- Historical seed gate PASS, `state=active`, `is_executable` and 366-key count alone do **not** authorize calculation.
- Current release gates: `LEGAL_SOURCE_V2_1`, `ENGINE_SECURITY_V2_1`, `AGENT_137_V2_1`, `AGENT_32_V2_1`, `PERSISTED_E2E_6`; source attestation, source SHA, effective date, approved rule IDs, schedule version and runtime binding hash required. None is an earned LIVE PASS yet.
- Rebate calculation requires separately reviewed structured rule attestation, not free-text percentages. Missing/contradictory/expired law and unsupported categories fail closed.
- A valid 0 tax result is semantically distinct from `FAIL_CLOSED`, `NEEDS_FACTS`, or 4xx/5xx errors.
- Audit log must persist before success; actor user ID, taxpayerRecordId and immutable input/ruleset fingerprints appear in service-only log. Replay deduplication/idempotency remains WS02/WS04 handoff BLOCKED (no verified SQL constraint).

## WS02 interface and required tests
1. Design an immutable taxpayer-record ↔ Auth UID (+ tenant where applicable) ownership relation, row-level access, revoke default EXECUTE, and preserve signup trigger protections in an isolated PG17 environment; source migration and `RPC` grants remain WS02-only.
2. Return boolean ownership only on current, authorized records; unknown UUID, wrong Auth UID/tenant/year, expired/revoked session and suspended taxpayer must reject.
3. Prove anonymous, forged bearer, wrong-tenant/wrong-taxpayer, absent RPC, duplicate request, compromised client-provided principal, event-log access, and service-role isolation under real Supabase Auth; no synthetic token test counts as hosted PASS.
4. Supply approved effective rule versions, parameter-set digest, Source -> Provision -> AY/IY/event/taxpayer facts and independent legal/source cutoff acceptance. Preserve all historical and draft partitions.
5. Repeat tests under approved isolated PG17 + Auth + Edge stack, diff exact-current code, verify readback, backup and rollback. Never issue production taxpayer POST.

## Local test command
From this W5 workspace: `node --test tests/engine_boundary.node.mjs` (no network or hosted production invocation). Real PG integration tests require isolated fixture and `W5_PG_SOCKET`, `W5_PG_DB`; the original four SQL tests are skipped without that fixture. 137 original Agent cases and 32 installed-Agent acceptance tests are not certified by local handler tests.
