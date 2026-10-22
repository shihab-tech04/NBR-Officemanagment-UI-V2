# WS04 Secure deterministic citizen evaluation contract — review candidate v2

**Status: PROPOSED / ISOLATED TESTED / NOT HOSTED AUTH ACCEPTED / NOT LIVE — 2026-10-22.**

Contract ID: `NBR_ENGINE_CITIZEN_V2_REVIEW`. Existing endpoint: `POST /functions/v1/nbr-tax-engine` — **same existing W5 candidate, no second engine**. Production function is still v12. The candidate requires explicit `NBR_TAX_EXECUTION_ENABLED=true`; default is disabled. This setting is not authority to enable it. `NBR_TAX_ALLOWED_ORIGINS` must contain exact reviewed HTTPS origins, not wildcard. The deployed `nbr-rules-api` Admin bearer/session contract is independent and must never be accepted as a citizen credential.

## Request (types; not a released network schema)

```ts
type CanonicalDecimal = string; // digits, optional decimal point, <=10 fractional positions
interface CitizenEvaluationReviewRequest {
  contractVersion: 'NBR_ENGINE_CITIZEN_V2_REVIEW';
  assessmentYear: string;              // YYYY-YY
  incomeYear: string;                  // YYYY-YY, exact SQL year mapping
  legalEventDate: string;              // YYYY-MM-DD valid civil date
  expectedSourceCutoff: string;        // approved SQL source cutoff
  expectedRuleSetHash: string;         // lowercase/uppercase SHA-256 hex, 64 chars
  expectedParameterRevision: number;   // reviewed exact current SQL parameter revision
  idempotencyKey: string;             // opaque 16-128 [A-Za-z0-9_-]
  taxpayerRecordId: string;           // UUID; subject to server-side owner and session verification
  taxpayer: {
    entityType: 'individual';           // company or HUF cases remain blocked
    residency: 'resident';             // nonresident branch is intentionally blocked
    industryCode: string;              // explicit; business industry scope requires approved classification
    specialCategory: 'none'|'female'|'senior_citizen'|'person_with_disability'|
       'third_gender'|'gazetted_freedom_fighter'|'july_warrior'|'parent_of_disabled';
    isNewTaxpayer?: boolean;
    disabledChildCount?: number | string;
  };
  returnData: {
    incomeHeads: Record<string, CanonicalDecimal>;
    taxRebates?: Record<string, CanonicalDecimal>; // claim only, not entitlement
    taxDeductedAtSource?: CanonicalDecimal; // evidence claim only, not credit
    advanceTaxPaid?: CanonicalDecimal;      // evidence claim only, not credit
    selfAssessmentTaxPaid?: CanonicalDecimal;
    adjustedTotalIncomeForRebate?: CanonicalDecimal;
    eligibleInvestmentAmount?: CanonicalDecimal;
  };
  ruleFacts?: Record<string,{baseAmount?: CanonicalDecimal;quantity?: CanonicalDecimal;
    branch?: 'primary'|'alternate'; providedFacts?:Record<string,unknown>}>;
}
```

Bearer must be a verifiable signed-in taxpayer access token in `Authorization: Bearer <user access JWT>`. Caller-claimed user ID, JWT user metadata, Admin session labels and client claims of entitlement do **not** establish ownership. Require validated `auth.getUser(token)`, WS02 trusted ownership RPC, and WS02 atomic request reservation **before reading privileged tax rules**. The Office Admin API is separate. Use server-only/service-role secrets; do not send them to the taxpayer client.

## Response and typed dispositions

The existing handler adds `contractVersion`, `engineVersion`, `assessmentYear`, `incomeYear`, `legalCutoff`, `sourceRegistryVersion`, `ruleSetHash`, `parameterSetHash`, `roundingPolicy`, `parameterSet.revision` and `.legalSource`, `ruleCount`, `ruleSummary`, `rules` (one trace per selected exact rule revision and source), `individual.trace`, `inputHash`, and `receiptHash`. The `receiptHash` is SHA-256 of canonical, key-code-point-sorted selected versions, input hash, calculation trace and amounts, **excluding timestamps**. Repeated identical accepted input, actor, selected versions and parameter hash produces identical fingerprints in deterministic local tests.

On `status:CALCULATED`, `ok:true`, the current individual fields are decimal strings: `totalIncome`, `taxFreeThreshold`, `grossTax`, `rebate`, `netTax`, `taxPaid`, `balanceDue`. **They are not a filing authorization:** `submissionReady:false` in this review candidate, even if all tax arithmetic checks complete. Valid zero is only valid when the status, approved law, source/parameter revisions and signature are accepted.

On `status:FAIL_CLOSED` or `NEEDS_FACTS`, `ok:false` and tax `individual.values` are omitted, even when HTTP response is 200 for backwards-compatible structured dispositions. No valid-looking zero can be returned as a fallback. Typed blocking 4xx/5xx codes include `ENGINE_DISABLED`, `VERSIONED_CONTRACT_REQUIRED`, `UNAPPROVED_YEAR`, `YEAR_MISMATCH`, `TAXPAYER_RECORD_REQUIRED`, `TAXPAYER_ACCESS_DENIED`, `OWNERSHIP_GATE_UNAVAILABLE`, `REPLAY_GATE_UNAVAILABLE`, `REPLAY_NOT_ACCEPTED`, `UNAPPROVED_PARAMETER_REVISION`, `STALE_RULESET_REVISION`, `LEGAL_EVENT_CUTOFF_UNVERIFIED`, `UNPINNED_SQL_CALCULATION`, `CREDIT_EVIDENCE_NOT_VERIFIED`, `INDUSTRY_CLASSIFICATION_REQUIRED`, `UNSUPPORTED_RESIDENCY_SCOPE`, `AUDIT_WRITE_FAILED`, `RECEIPT_FINALIZATION_UNAVAILABLE` and `EVALUATOR_EXCEPTION`.

## Rounding / precision

The existing W5 engine uses `BigInt` with a scale of exactly 10 fractional digits. The candidate rejects missing required operands and precision exceeding that scale, and rejects binary-float monetary request values (non-integral JS Number). Literal percentage text such as `0.0000001%` is converted exactly to the fraction `0.000000001`, without JS Number. Unstructured conditional legal prose is **not** a rate or option. `0.000000001%`, which would require 11 fractional places in the fraction, remains FAIL_CLOSED instead of truncating to zero.

The implemented multiplier truncates toward zero after each multiplication at scale 10, and therefore explicitly advertises **arithmetic behavior**, not Bangladesh statutory rounding law: `FIXED_DECIMAL_10_TRUNCATE_TOWARD_ZERO`. An approved source-backed parameter revision **and** the SQL RPC must explicitly attest the same policy. If the controlling law requires another rounding rule or a more precise intermediate representation, refuse calculation until a new legally reviewed implementation and independent tests are approved. No invented tax rate, threshold, minimum tax, rebate cap, surcharge or refund logic is added.

## Legal and acceptance gates

Year state alone does not authorize calculation. Require exact frozen registry identity hash; current 366 versions; complete matching runtime bindings; schedule revision, hash and legal source; five evidence-backed release gates `LEGAL_SOURCE_V2_1`, `ENGINE_SECURITY_V2_1`, `AGENT_137_V2_1`, `AGENT_32_V2_1`, `PERSISTED_E2E_6`; per-relevant-rule SHA/provision/commencement/status; no expired period, amendment conflict or unresolved savings; and caller event date at or before verified legal cutoff. `2027-28` remains DRAFT; clones are never executable. In the present canonical SQL all five new release gates are absent for all four listed assessment years.

Without independently certified source/period, residency/special-category/business/final/minimum/surcharge/treaty class, credit entitlement/duplicate/reversal/ownership, or correct WS02 SQL RPC, return a typed block. A claim of withheld amounts does not give credit; the current candidate blocks any nonzero client-declared paid-tax credit until WS02 provides an approved ledger ownership/reversal contract. Corporate calculations are not implemented.

## Persistence and deterministic receipt

After verifying caller and owner, WS02 atomic reservation must reject duplicate/conflicting idempotency key without executing tax RPC or logging. The handler logs the result to existing `nbr_engine_evaluation_log` using a service-role-only write. WS02 atomic finalization must persist and verify the receipt hash and uniquely keyed actor/taxpayer/year/request. Without either RPC, any database error, or failed audit insert/finalization, **no accepted calculation response** may be returned. Implementation of those RPCs and any historical SQL views/constraints belongs to WS02; this document does not grant execution rights.

**Proof limitation:** current local 87 tests are synthetic mocks using unchanged original arithmetic assertions; not a real authenticated staging calculation. No WS01/WS02 approved isolated rule revision + real Auth session + version-pinned SQL RPC was provided or discovered. Official circular-derived SQL revision 2 in active AY 2026–27 has no five new W5 approval gates and is not an approved staging fixture. Do not substitute it.