import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  // No wildcard credentialed CORS. Handler sets a vetted exact origin per request.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

const ENGINE_VERSION = "NBR-TAX-ENGINE-1.5.0-WS04-REVIEW-ONLY";
const CONTRACT_VERSION = "NBR_ENGINE_CITIZEN_V2_REVIEW";
// Release gates are separate from the historical seed gates marked PASS in October 2026.
// These evidence records must be created only by an approved legal/security/QA workflow.
const FROZEN_REGISTRY_VERSION = "FINAL_2026_09_30";
const FROZEN_REGISTRY_SHA256 = "34902bac07a459a4f0c051b90bfe3b4c492f2465d06c661bab18ab7f36252184";
const FROZEN_BASELINE_RULE_COUNT = 366;
// SHA-256 of the 366 FINAL_2026_09_30 rule_id values, sorted lexically and
// joined with "\n" (no trailing newline). A new rule identity requires a
// separately certified registry/version upgrade; a count alone is insufficient.
const FROZEN_RULE_IDENTITY_SHA256 = "0c917287e5f9c0d51b5cd77dea03f813d4fe8ccc382ec9fec74bf850cc444871";
const RELEASE_GATES = [
  "LEGAL_SOURCE_V2_1",
  "ENGINE_SECURITY_V2_1",
  "AGENT_137_V2_1",
  "AGENT_32_V2_1",
  "PERSISTED_E2E_6",
] as const;
const SCALE_DIGITS = 10n;
const SCALE = 10n ** SCALE_DIGITS;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function verifiedBearer(req: Request): string | null {
  const authorization = req.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9._~+\/-]+=*)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

function validAssessmentYear(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return false;
  const start = Number(value.slice(0, 4));
  return Number(value.slice(5)) === (start + 1) % 100;
}

// Calendar-valid source dates are a prerequisite for a pinned legal cutoff.
// Regex shape alone admits nonexistent dates such as 2026-02-30.
function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

function objectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonnegativeMoney(value: unknown): boolean {
  if (typeof value !== "number" && typeof value !== "string") return false;
  // Require canonical decimal evidence; stripping separators/whitespace can
  // let malformed values reserve an idempotency slot before decimal() rejects them.
  const raw = String(value);
  // Match the isolated WS02 atomic receipt's canonical decimal syntax:
  // no leading-zero integer forms, including nested transaction/payment facts.
  return /^(?:0|[1-9]\d*)(?:\.\d{1,10})?$/.test(raw) &&
    // Do not accept a binary float as the source of tax decimal evidence.
    (typeof value !== "number" || Number.isSafeInteger(value));
}

function invalidCalculationFacts(body: Record<string, any>): string[] {
  const invalid: string[] = [];
  if (!objectRecord(body.taxpayer)) {
    invalid.push("taxpayer");
  } else {
    const taxpayer = body.taxpayer;
    if (taxpayer.isNewTaxpayer !== null && taxpayer.isNewTaxpayer !== undefined &&
        typeof taxpayer.isNewTaxpayer !== "boolean") invalid.push("isNewTaxpayer");
    const count = taxpayer.disabledChildCount;
    if (count !== null && count !== undefined &&
        !((typeof count === "number" && Number.isSafeInteger(count) && count >= 0 && count <= 2147483647) ||
          (typeof count === "string" && /^\d+$/.test(count) && Number(count) <= 2147483647))) {
      invalid.push("disabledChildCount");
    }
    if (typeof taxpayer.entityType !== "string" ||
        normalizeEntityType(taxpayer.entityType) !== "individual") invalid.push("entityType");
    if (taxpayer.specialCategory !== null && taxpayer.specialCategory !== undefined &&
        typeof taxpayer.specialCategory !== "string") invalid.push("specialCategory");
  }
  if (!objectRecord(body.returnData) || !objectRecord(body.returnData.incomeHeads) ||
      Object.keys(body.returnData.incomeHeads).length === 0) {
    invalid.push("incomeHeads");
  } else {
    for (const [key, value] of Object.entries(body.returnData.incomeHeads)) {
      if (!nonnegativeMoney(value)) invalid.push(`incomeHeads.${key}`);
    }
  }
  if (objectRecord(body.returnData)) {
    const returnData = body.returnData;
    if (returnData.taxRebates !== undefined) {
      if (!objectRecord(returnData.taxRebates)) invalid.push("taxRebates");
      else for (const [key, value] of Object.entries(returnData.taxRebates)) {
        if (!nonnegativeMoney(value)) invalid.push(`taxRebates.${key}`);
      }
    }
    for (const key of [
      "taxDeductedAtSource", "advanceTaxPaid", "selfAssessmentTaxPaid",
      "adjustedTotalIncomeForRebate", "eligibleInvestmentAmount",
    ]) {
      if (returnData[key] !== undefined && returnData[key] !== null &&
          !nonnegativeMoney(returnData[key])) invalid.push(key);
    }
  }
  // Dated event maps can carry caller-controlled monetary evidence even when
  // their explicit selectors and dates match. Reject noncanonical values
  // before ownership lookup and owner-bound idempotency reservation. Only
  // validate named monetary operands already present in isolated fixtures;
  // this is NOT approval of an event schema, payment credit or legal rate.
  for (const [mapName, operand] of [
    ["transactions", "grossBill"],
    ["paymentEvents", "amount"],
  ] as const) {
    const events = body[mapName];
    if (!objectRecord(events)) continue; // Event-map shape is checked later.
    for (const [ruleId, event] of Object.entries(events)) {
      if (objectRecord(event) && event[operand] !== undefined &&
          !nonnegativeMoney(event[operand])) {
        invalid.push(`${mapName}.${ruleId}.${operand}`);
      }
    }
  }
  // Never coerce malformed caller-selected rule identifiers to strings or
  // silently discard a non-array transaction claim. Either behavior could
  // defeat a transaction-period guard before legal rule selection.
  for (const selector of ["claimRuleIds", "transactionRuleIds", "paymentRuleIds"]) {
    const ids = body[selector];
    if (ids === undefined) continue;
    if (!Array.isArray(ids) || ids.length > FROZEN_BASELINE_RULE_COUNT ||
        ids.some((id: unknown) =>
          typeof id !== "string" || !/^[A-Za-z0-9_.-]{1,128}$/.test(id)) ||
        new Set(ids).size !== ids.length) {
      invalid.push(selector);
    }
  }
  if (body.ruleFacts !== undefined) {
    if (!objectRecord(body.ruleFacts)) invalid.push("ruleFacts");
    else for (const [key, facts] of Object.entries(body.ruleFacts)) {
      if (!objectRecord(facts)) {
        invalid.push(`ruleFacts.${key}`);
        continue;
      }
      for (const operand of ["baseAmount", "quantity"]) {
        if (facts[operand] !== undefined && !nonnegativeMoney(facts[operand])) {
          invalid.push(`ruleFacts.${key}.${operand}`);
        }
      }
    }
  }
  return invalid;
}

function missingReleaseGates(
  gates: Array<Record<string, any>>,
  ruleSetHash: string,
): string[] {
  return RELEASE_GATES.filter((code) => {
    const gate = gates.find((row) => row.gate_code === code);
    const evidence = gate?.evidence_detail;
    return (
      gate?.status !== "PASS" ||
      !gate?.evidence_ref ||
      !gate?.evaluated_by ||
      !gate?.evaluated_at ||
      !evidence ||
      evidence.rule_set_hash !== ruleSetHash ||
      evidence.registry_sha256 !== FROZEN_REGISTRY_SHA256 ||
      evidence.decision !== "APPROVED"
    );
  });
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v));
  return "{" + entries.join(",") + "}";
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function decimal(value: unknown): bigint {
  // A missing statutory operand is not monetary zero. Optional fields must
  // explicitly choose a documented zero before calling this parser.
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    throw new RangeError("MISSING_DECIMAL_OPERAND");
  }
  if (typeof value === "number" && (!Number.isFinite(value) || !Number.isSafeInteger(value))) {
    throw new RangeError("BINARY_FLOAT_DECIMAL_FORBIDDEN");
  }
  const raw = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) throw new RangeError("INVALID_DECIMAL_OPERAND");
  const negative = raw.startsWith("-");
  const clean = negative ? raw.slice(1) : raw;
  const [whole, fraction = ""] = clean.split(".");
  if (fraction.length > Number(SCALE_DIGITS)) throw new RangeError("DECIMAL_PRECISION_UNSUPPORTED");
  const scaled = BigInt(whole || "0") * SCALE + BigInt(fraction.padEnd(Number(SCALE_DIGITS), "0"));
  return negative ? -scaled : scaled;
}

function decimalString(value: bigint, trim = true): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(Number(SCALE_DIGITS), "0");
  const normalizedFraction = trim ? fraction.replace(/0+$/, "") : fraction;
  return `${negative ? "-" : ""}${whole}${normalizedFraction ? "." + normalizedFraction : ""}`;
}

function add(a: bigint, b: bigint) { return a + b; }
function sub(a: bigint, b: bigint) { return a - b; }
function mul(a: bigint, b: bigint) { return (a * b) / SCALE; }
function min(...values: bigint[]) { return values.reduce((a, b) => (a < b ? a : b)); }
function max(a: bigint, b: bigint) { return a > b ? a : b; }

function parseNumericRate(value: unknown): bigint | null {
  if (value === null || value === undefined) return null;
  // SQL parameter rates are dimensionless fractions; percent notation must
  // convert exactly to a decimal-10 fraction, without JS Number or truncation.
  if (typeof value === "number" || typeof value === "bigint") {
    try { const r = decimal(value); return r >= 0n && r <= SCALE ? r : null; } catch { return null; }
  }
  const raw = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    try { const r = decimal(raw); return r <= SCALE ? r : null; } catch { return null; }
  }
  const exactPct = raw.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (exactPct) {
    const [whole, fraction = ""] = exactPct[1].split(".");
    // A rate precision finer than 10 fractional places in the fraction
    // cannot be expressed by the original fixed-point W5 evaluator.
    const numerator = BigInt(whole) * (10n ** BigInt(fraction.length)) + BigInt(fraction || "0");
    const divisor = 100n * (10n ** BigInt(fraction.length));
    const product = numerator * SCALE;
    return numerator <= divisor && product % divisor === 0n ? product / divisor : null;
  }

  // Legal prose is not an executable expression. In particular, a single
  // percentage may be conditional on an unproven statutory predicate.
  return null;
}

function canonicalRateOptions(value: unknown): Array<{ key: string; rate: string; label: string }> {
  if (value === null || value === undefined || value === "") return [];
  const out: Array<{ key: string; rate: string; label: string }> = [];

  const pushRate = (key: string, candidate: unknown, label: string) => {
    const parsed = parseNumericRate(candidate);
    if (parsed !== null) out.push({ key, rate: decimalString(parsed), label });
  };

  if (typeof value === "number" || typeof value === "bigint") {
    pushRate("primary", value, String(value));
    return out;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    for (const [key, candidate] of Object.entries(value as Record<string, unknown>)) {
      if (typeof candidate === "number" || (typeof candidate === "string" && /^-?\d+(?:\.\d+)?$/.test(candidate.trim()))) {
        pushRate(key, candidate, key.replaceAll("_", " "));
      }
    }
    return out;
  }

  const raw = String(value).trim();
  const direct = parseNumericRate(raw);
  if (direct !== null) {
    out.push({ key: "primary", rate: decimalString(direct), label: raw });
    return out;
  }

  // Never extract apparent "options" from unstructured canonical prose.
  // A caller-selected index must not bypass legally conditional language.
  return out;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    if (value.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
      } catch {
        // use raw string as one fact label
      }
    }
    return value.split(";").map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function requiredFacts(rule: Record<string, unknown>): string[] {
  const direct = [
    ...toStringArray(rule.inputs),
    ...toStringArray(rule.required_facts),
    ...toStringArray(rule.trigger_inputs),
  ];
  const canonicalFactGates = rule.canonical_fact_gates;
  if (canonicalFactGates && typeof canonicalFactGates === "object" && !Array.isArray(canonicalFactGates)) {
    for (const [key, value] of Object.entries(canonicalFactGates as Record<string, unknown>)) {
      if (value !== null && value !== undefined) direct.push(key);
    }
  }
  const closure = rule.closure_reconciliation_v2;
  if (closure && typeof closure === "object" && !Array.isArray(closure)) {
    const manifest = (closure as Record<string, unknown>).fact_gate_manifest;
    if (Array.isArray(manifest)) {
      for (const item of manifest) {
        if (item && typeof item === "object" && "field" in item) direct.push(String((item as Record<string, unknown>).field));
      }
    }
  }
  return [...new Set(direct)].filter(Boolean);
}


function totalPositive(input: Record<string, unknown> | undefined): boolean {
  if (!input) return false;
  return Object.values(input).some((value) => {
    try { return decimal(value ?? 0) > 0n; } catch { return false; }
  });
}

function normalizeEntityType(value: unknown): string {
  const raw = String(value ?? "individual").trim().toLowerCase();
  if (["natural_person","resident_individual","nonresident_bangladeshi_individual"].includes(raw)) return "individual";
  return raw || "individual";
}

function resolveApplicability(
  ruleRow: Record<string, any>,
  binding: Record<string, any> | null,
  body: Record<string, any>,
  suppliedRuleFacts: Record<string, any>,
) {
  const ruleId = String(ruleRow.rule_key);
  const facts = suppliedRuleFacts[ruleId] ?? {};
  const suppliedFactKeys = Object.keys(facts).filter(
    (key) => !["applicable","triggered"].includes(key),
  );
  const hasSuppliedRuleFacts = suppliedFactKeys.length > 0;

  const entityType = normalizeEntityType(body.taxpayer?.entityType);
  const entityTypes = Array.isArray(binding?.entity_types)
    ? binding.entity_types.map((value:unknown)=>normalizeEntityType(value))
    : [];
  if (entityTypes.length > 0 && !entityTypes.includes(entityType)) {
    return { state:"NOT_APPLICABLE", reason:`Runtime binding is for ${entityTypes.join(", ")}; current entity is ${entityType}.` };
  }

  const mode = String(binding?.runtime_mode ?? "MANUAL_FACT_GATE");
  if (mode === "HISTORICAL_ONLY" || mode === "NOT_APPLICABLE" || mode === "ALWAYS" || mode === "ENTITY") {
    return { state:"APPLICABLE", reason:`Runtime mode ${mode} selected.` };
  }

  const returnData = body.returnData ?? {};
  const returnContext = body.returnContext ?? {};
  const claimRuleIds = Array.isArray(body.claimRuleIds) ? body.claimRuleIds.map(String) : [];
  const transactionRuleIds = Array.isArray(body.transactionRuleIds) ? body.transactionRuleIds.map(String) : [];
  const paymentRuleIds = Array.isArray(body.paymentRuleIds) ? body.paymentRuleIds.map(String) : [];

  if (mode === "BENEFIT_CLAIM") {
    if (ruleId === "S78-GENERAL-REBATE-FA2026" && totalPositive(returnData.taxRebates ?? {})) {
      return { state:"APPLICABLE", reason:"A general-rebate claim exists in the return." };
    }
    if (claimRuleIds.includes(ruleId) || body.benefitClaims?.[ruleId] || hasSuppliedRuleFacts) {
      return { state:"APPLICABLE", reason:"A matching benefit/exemption claim exists." };
    }
    return { state:"NOT_TRIGGERED", reason:"No matching benefit/exemption claim was supplied; no benefit is granted." };
  }

  if (mode === "TRANSACTION_EVENT") {
    if (transactionRuleIds.includes(ruleId) || body.transactions?.[ruleId] || hasSuppliedRuleFacts) {
      return { state:"APPLICABLE", reason:"A matching withholding/source-tax transaction was supplied." };
    }
    return { state:"NOT_TRIGGERED", reason:"No matching withholding/source-tax transaction was supplied." };
  }

  if (mode === "PAYMENT_EVENT") {
    if (paymentRuleIds.includes(ruleId) || body.paymentEvents?.[ruleId] || hasSuppliedRuleFacts) {
      return { state:"APPLICABLE", reason:"A matching payment/credit/refund event was supplied." };
    }
    return { state:"NOT_TRIGGERED", reason:"No matching payment/credit/refund event was supplied." };
  }

  if (mode === "RETURN_EVENT") {
    if (ruleId === "IND-BIZ-001") {
      const businessIncome = returnData.incomeHeads?.businessProfession;
      try {
        return decimal(businessIncome ?? 0) > 0n
          ? { state:"APPLICABLE", reason:"Business/profession income is present." }
          : { state:"NOT_TRIGGERED", reason:"No business/profession income is present." };
      } catch {
        return { state:"NEEDS_FACTS", missingFacts:["businessProfession"], reason:"Business/profession income is required to determine applicability." };
      }
    }
    if (["RET-REQUIRED-166-001","ROUTE-NAT-001","ROUTE-SHORT-001"].includes(ruleId) && entityType === "individual") {
      return { state:"APPLICABLE", reason:"Core individual return routing/requiredness rule." };
    }
    if (returnContext.ruleIds?.includes?.(ruleId) || returnContext.events?.[ruleId] || hasSuppliedRuleFacts) {
      return { state:"APPLICABLE", reason:"A matching return/workflow event was supplied." };
    }
    return { state:"NOT_TRIGGERED", reason:"No matching return/workflow event was supplied." };
  }

  if (mode === "MANUAL_FACT_GATE" && hasSuppliedRuleFacts) {
    return {
      state:"APPLICABLE",
      reason:"Structured facts were supplied for this canonical rule.",
    };
  }

  return {
    state:"NOT_TRIGGERED",
    reason:"Rule remains available as a runtime node but requires a matching event, claim, transaction or structured fact payload before it can affect a return.",
  };
}

function ruleRuntimeKind(status: string, rule: Record<string, unknown>): string {
  if (status === "FAIL_CLOSED" || status === "FAIL_CLOSED_PUBLIC_EVIDENCE" || status === "NON_EXECUTABLE_UNLESS_CANONICAL_OVERRIDE") return "FAIL_CLOSED";
  if (status === "HISTORICAL_ONLY") return "HISTORICAL_ONLY";
  if (status === "NOT_APPLICABLE") return "NOT_APPLICABLE";
  if (status === "FACT_GATED") return "FACT_GATE";
  const rate = parseNumericRate(rule.rate_primary ?? rule.rate ?? rule.domestic_default);
  if (rate !== null) return "CALCULATION";
  if (rule.formula_condition || rule.tax_base || rule.cap_formula) return "CALCULATION_OR_DECISION";
  return "DECISION";
}

function evaluateRule(
  ruleRow: Record<string, any>,
  binding: Record<string, any> | null,
  body: Record<string, any>,
  suppliedRuleFacts: Record<string, any> = {},
) {
  const rule = (ruleRow.rule_data ?? {}) as Record<string, unknown>;
  const ruleId = String(ruleRow.rule_key);
  const status = String(ruleRow.execution_status ?? rule.canonical_execution_status ?? "FAIL_CLOSED");
  const kind = ruleRuntimeKind(status, rule);
  const facts = suppliedRuleFacts[ruleId] ?? {};
  const applicability = resolveApplicability(ruleRow, binding, body, suppliedRuleFacts);
  const req = requiredFacts(rule);
  const provided = facts.providedFacts && typeof facts.providedFacts === "object" ? facts.providedFacts : {};
  const missing = req.filter((label) => !(label in provided) && !(label in facts));

  const base = facts.baseAmount !== undefined ? decimal(facts.baseAmount) : null;
  const quantity = facts.quantity !== undefined ? decimal(facts.quantity) : null;
  const branch = facts.branch === "alternate" ? "alternate" : "primary";
  const rateRaw = branch === "alternate"
    ? rule.rate_alternate
    : (rule.rate_primary ?? rule.rate ?? rule.domestic_default);
  const rateOptions = canonicalRateOptions(rateRaw);
  // Multiple legal rate choices are not an entitlement. A caller-chosen
  // option/index cannot substitute for a sourced statutory predicate.
  const unresolvedRateBranch = rateOptions.length > 1;
  let rate = parseNumericRate(rateRaw);
  if (rate === null && rateOptions.length > 0) {
    const requestedRateKey = String(facts.rateOptionKey ?? "");
    const requestedRateIndex =
      facts.rateOptionIndex === undefined || facts.rateOptionIndex === null
        ? null
        : Number(facts.rateOptionIndex);
    const selected =
      (requestedRateKey ? rateOptions.find((option) => option.key === requestedRateKey) : undefined) ??
      (requestedRateIndex !== null && Number.isInteger(requestedRateIndex)
        ? rateOptions[requestedRateIndex]
        : undefined);
    if (selected) rate = decimal(selected.rate);
  }

  const traceBase = {
    ruleId,
    revision: ruleRow.revision_no,
    sourceAssessmentYear: ruleRow.source_assessment_year,
    yearApplicabilityStatus: ruleRow.year_applicability_status,
    executionStatus: status,
    runtimeKind: kind,
    runtimeMode: binding?.runtime_mode ?? "MANUAL_FACT_GATE",
    affectsCalculation: Boolean(binding?.affects_calculation),
    affectsSubmission: Boolean(binding?.affects_submission),
    legalSource: rule.legal_source ?? rule.evidence_references ?? rule.authority ?? null,
    sourceRef: rule.canonical_source_ref ?? null,
    requiredFacts: req,
    rateOptions,
  };

  if (unresolvedRateBranch && (binding?.affects_calculation || binding?.affects_submission)) {
    return { ...traceBase, state:"FAIL_CLOSED",
      reason:"Multiple rate options lack an independently reviewed conditional-branch resolver." };
  }
  if (applicability.state === "NOT_APPLICABLE") {
    return { ...traceBase, state:"NOT_APPLICABLE", reason:applicability.reason };
  }
  if (applicability.state === "NOT_TRIGGERED") {
    return { ...traceBase, state:"NOT_TRIGGERED", reason:applicability.reason };
  }
  if (applicability.state === "NEEDS_FACTS") {
    return { ...traceBase, state:"NEEDS_FACTS", missingFacts:applicability.missingFacts ?? ["applicability"], reason:applicability.reason };
  }

  // A special central rebate route must never override the canonical rule's
  // fail-closed, historical-only or not-applicable execution state.
  // The central Section 78 evaluator is reachable only after these gates.
  if (kind === "FAIL_CLOSED") {
    return { ...traceBase, state: "FAIL_CLOSED", reason: rule.blocker ?? rule.conflict_blocker ?? rule.failure_behavior ?? "Execution blocked by certified rule state." };
  }
  if (kind === "HISTORICAL_ONLY") return { ...traceBase, state: "HISTORICAL_ONLY" };
  if (kind === "NOT_APPLICABLE") return { ...traceBase, state: "NOT_APPLICABLE" };

  if (ruleId === "S78-GENERAL-REBATE-FA2026") {
    return {
      ...traceBase,
      state:"APPLIED",
      reason:"Section 78 is evaluated by the central individual rebate pipeline using this canonical rule.",
      output:rule.benefit_type ?? rule.output ?? null,
    };
  }

  if (facts.branch !== undefined && facts.branch !== "primary" && facts.branch !== "alternate") {
    return { ...traceBase, state: "FAIL_CLOSED", reason: "Unknown rate branch; an unrecognized branch cannot fall back to primary." };
  }
  if (branch === "alternate" && (rateRaw === undefined || rateRaw === null || rateRaw === "")) {
    return { ...traceBase, state: "FAIL_CLOSED", reason: "The requested alternate rate is not encoded in the legally reviewed rule." };
  }

  if (
    rate === null && typeof rateRaw === "string" &&
    /\d+(?:\.\d+)?\s*%/.test(rateRaw) &&
    (binding?.affects_calculation || binding?.affects_submission)
  ) {
    return {
      ...traceBase,
      state: "FAIL_CLOSED",
      reason: "Unstructured legal percentage text is not an executable rate contract; the conditional branches require separate verified encoding.",
    };
  }

  if (kind === "FACT_GATE" && req.length === 0) {
    const suppliedKeys = Object.keys(facts).filter(
      (key) => !["applicable", "triggered", "rateOptionKey", "rateOptionIndex"].includes(key),
    );
    const hasOperationalFacts =
      suppliedKeys.length > 0 ||
      base !== null ||
      quantity !== null ||
      (facts.variables && typeof facts.variables === "object");

    if (!hasOperationalFacts) {
      return {
        ...traceBase,
        state: "NEEDS_FACTS",
        missingFacts: ["structuredFactGate"],
        reason: "This certified FACT_GATED rule is active only when its transaction/claim facts are supplied. No legal predicate is inferred by the engine.",
      };
    }

    if (rate === null && rateOptions.length > 1 && (base !== null || quantity !== null)) {
      return {
        ...traceBase,
        state: "NEEDS_FACTS",
        missingFacts: ["rateOptionKey"],
        reason: "The canonical rule contains multiple explicit rate branches. Select the branch supported by the transaction facts; the engine will not infer a branch.",
        rateOptions,
      };
    }
  }

  if ((kind === "FACT_GATE" || req.length > 0) && missing.length > 0) {
    return { ...traceBase, state: "NEEDS_FACTS", missingFacts: missing };
  }

  if (rate !== null && (base !== null || quantity !== null)) {
    const operand = base ?? quantity!;
    const amount = mul(operand, rate);
    return {
      ...traceBase,
      state: "CALCULATED",
      branch,
      rate: decimalString(rate),
      rateOptions,
      operand: decimalString(operand),
      amount: decimalString(amount),
      output: rule.output ?? null,
    };
  }

  const formulaText = String(rule.formula_condition ?? rule.rate_primary ?? "").replace(/−/g, "-").trim();
  if (/^B\s*-\s*A$/i.test(formulaText) && facts.variables) {
    const A = decimal(facts.variables.A ?? 0);
    const B = decimal(facts.variables.B ?? 0);
    return { ...traceBase, state: "CALCULATED", formula: "B-A", amount: decimalString(sub(B, A)), output: rule.output ?? null };
  }

  return {
    ...traceBase,
    state: kind === "FACT_GATE" ? "FACTS_SATISFIED" : "APPLIED",
    output: rule.output ?? rule.logic ?? null,
  };
}

function sumObjectValues(input: Record<string, unknown> | undefined): bigint {
  if (!input) return 0n;
  return Object.values(input).reduce((acc, value) => acc + decimal(value ?? 0), 0n);
}

// This is a reviewed, version-linked *evidence overlay*, never a percentage
// scraped from canonical legal prose. Missing or malformed data means no rebate.
function parseRebateFormula(verification: unknown) {
  const values = objectRecord(verification) && objectRecord(verification.rebate_calculation)
    ? verification.rebate_calculation : null;
  if (!values || !nonnegativeMoney(values.income_rate) ||
      !nonnegativeMoney(values.investment_rate) || !nonnegativeMoney(values.cap_bdt)) return null;
  const incomeRate = decimal(values.income_rate);
  const investmentRate = decimal(values.investment_rate);
  const cap = decimal(values.cap_bdt);
  if (incomeRate > SCALE || investmentRate > SCALE) return null;
  return { incomeRate, investmentRate, cap, evidence: "VERSION_LINKED_LEGAL_REVIEW" };
}

function thresholdFor(schedule: Record<string, any>, taxpayer: Record<string, any>): { threshold: bigint | null; missingFacts: string[]; category: string } {
  const thresholds = schedule.thresholds ?? {};
  const special = String(taxpayer.specialCategory ?? "none");
  let category = "general";
  if (special === "female") category = "female";
  else if (special === "senior_citizen") category = "senior_citizen";
  else if (special === "person_with_disability") category = "person_with_disability";
  else if (special === "third_gender") category = "third_gender";
  else if (special === "gazetted_freedom_fighter") category = "gazetted_freedom_fighter";
  else if (special === "july_warrior") category = "july_warrior";

  let threshold = thresholds[category] !== undefined ? decimal(thresholds[category]) : null;
  const missingFacts: string[] = [];

  if (special === "parent_of_disabled") {
    if (taxpayer.disabledChildCount === undefined || taxpayer.disabledChildCount === null) {
      missingFacts.push("disabledChildCount");
    } else {
      const increment = decimal(thresholds.disabled_child_guardian_increment ?? "0");
      threshold = add(decimal(thresholds.general ?? "0"), mul(decimal(String(taxpayer.disabledChildCount)), increment));
      category = "parent_of_disabled";
    }
  }
  return { threshold, missingFacts, category };
}

function computeIndividual(schedule: Record<string, any>, rebateVerification: Record<string, any> | null, body: Record<string, any>) {
  // Legacy reference retained for comparison only; never call app-side slabs.
  // The SQL version-pinned function exclusively owns statutory base tax.
  throw new Error("NON_SQL_STATUTORY_CALCULATOR_DISABLED");
  const taxpayer = body.taxpayer ?? {};
  const returnData = body.returnData ?? {};
  const incomeHeads = returnData.incomeHeads ?? {};
  const totalIncome = sumObjectValues(incomeHeads);
  const thresholdResult = thresholdFor(schedule, taxpayer);
  const missingFacts = [...thresholdResult.missingFacts];

  if (thresholdResult.threshold === null) {
    return { status: "FAIL_CLOSED", missingFacts: ["taxFreeThreshold"], trace: [] };
  }

  let remainder = max(0n, sub(totalIncome, thresholdResult.threshold));
  let grossTax = 0n;
  const slabTrace: Array<Record<string, string | null>> = [];
  for (const slab of schedule.slabs ?? []) {
    const rate = decimal(slab.rate);
    const limit = slab.amount === null ? null : decimal(slab.amount);
    if (remainder <= 0n) break;
    const taxableAtRate = limit === null ? remainder : min(remainder, limit);
    const taxAtRate = mul(taxableAtRate, rate);
    grossTax = add(grossTax, taxAtRate);
    remainder = sub(remainder, taxableAtRate);
    slabTrace.push({
      taxableAmount: decimalString(taxableAtRate),
      rate: decimalString(rate),
      tax: decimalString(taxAtRate),
      slabLimit: limit === null ? null : decimalString(limit),
    });
  }

  if (totalIncome > thresholdResult.threshold) {
    if (taxpayer.isNewTaxpayer === undefined) missingFacts.push("isNewTaxpayer");
    const minTax = taxpayer.isNewTaxpayer === true
      ? decimal(schedule.minimum_tax?.new_taxpayer ?? "0")
      : decimal(schedule.minimum_tax?.standard ?? "0");
    if (grossTax < minTax && taxpayer.isNewTaxpayer !== undefined) grossTax = minTax;
  }

  let rebate = 0n;
  let rebateStatus = "NOT_CLAIMED";
  const rawInvestmentClaim = sumObjectValues(returnData.taxRebates ?? {});
  const rebateTrace: Record<string, unknown> = {};

  if (rawInvestmentClaim > 0n) {
    if (!rebateVerification) {
      rebateStatus = "FAIL_CLOSED";
      missingFacts.push("section78Rule");
    } else if (returnData.adjustedTotalIncomeForRebate === undefined || returnData.eligibleInvestmentAmount === undefined) {
      rebateStatus = "NEEDS_FACTS";
      if (returnData.adjustedTotalIncomeForRebate === undefined) missingFacts.push("adjustedTotalIncomeForRebate");
      if (returnData.eligibleInvestmentAmount === undefined) missingFacts.push("eligibleInvestmentAmount");
    } else {
      const parsed = parseRebateFormula(rebateVerification);
      if (!parsed) {
        rebateStatus = "FAIL_CLOSED";
        missingFacts.push("section78StructuredFormula");
      } else {
        const adjustedIncome = decimal(returnData.adjustedTotalIncomeForRebate);
        const eligibleInvestment = decimal(returnData.eligibleInvestmentAmount);
        const incomeLimb = mul(adjustedIncome, parsed.incomeRate);
        const investmentLimb = mul(eligibleInvestment, parsed.investmentRate);
        rebate = min(incomeLimb, investmentLimb, parsed.cap);
        rebateStatus = "CALCULATED";
        Object.assign(rebateTrace, {
          formula: parsed.evidence,
          adjustedIncome: decimalString(adjustedIncome),
          eligibleInvestment: decimalString(eligibleInvestment),
          incomeLimb: decimalString(incomeLimb),
          investmentLimb: decimalString(investmentLimb),
          cap: decimalString(parsed.cap),
          rebate: decimalString(rebate),
        });
      }
    }
  }

  const netTax = max(0n, sub(grossTax, rebate));
  const taxPaid = add(add(decimal(returnData.taxDeductedAtSource ?? 0), decimal(returnData.advanceTaxPaid ?? 0)), decimal(returnData.selfAssessmentTaxPaid ?? 0));
  const balanceDue = max(0n, sub(netTax, taxPaid));

  return {
    status: rebateStatus === "FAIL_CLOSED" ? "FAIL_CLOSED" : missingFacts.length ? "NEEDS_FACTS" : "CALCULATED",
    missingFacts: [...new Set(missingFacts)],
    values: {
      totalIncome: decimalString(totalIncome),
      taxFreeThreshold: decimalString(thresholdResult.threshold),
      grossTax: decimalString(grossTax),
      rebate: decimalString(rebate),
      netTax: decimalString(netTax),
      taxPaid: decimalString(taxPaid),
      balanceDue: decimalString(balanceDue),
    },
    trace: {
      thresholdCategory: thresholdResult.category,
      slabs: slabTrace,
      rebateStatus,
      rebate: rebateTrace,
    },
  };
}

function computeIndividualFromSqlBase(
  baseTax: Record<string, any>,
  rebateVerification: Record<string, any> | null,
  body: Record<string, any>,
) {
  const returnData = body.returnData ?? {};
  const totalIncome = sumObjectValues(returnData.incomeHeads ?? {});
  const missingFacts: string[] = Array.isArray(baseTax?.missingFacts)
    ? baseTax.missingFacts.map((value: unknown) => String(value))
    : [];

  // A reviewed SQL base can legitimately request more facts without exposing
  // provisional monetary values. Do not misclassify this as an engine failure.
  if (baseTax?.status === "NEEDS_FACTS") {
    return {
      status: "NEEDS_FACTS",
      missingFacts: missingFacts.length ? missingFacts : ["INDIVIDUAL_TAX_SCHEDULE"],
      trace: { sqlBaseStatus: "NEEDS_FACTS" },
    };
  }

  if (!baseTax || baseTax.status !== "CALCULATED" ||
      typeof baseTax.grossTax !== "string" || typeof baseTax.taxFreeThreshold !== "string" ||
      !nonnegativeMoney(baseTax.grossTax) || !nonnegativeMoney(baseTax.taxFreeThreshold)) {
    return {
      status: "FAIL_CLOSED",
      missingFacts: missingFacts.length ? missingFacts : ["INDIVIDUAL_TAX_SCHEDULE"],
      // SQL non-CALCULATED or malformed monetary fields are not verified
      // evidence. Never persist provisional values in a receipt/audit trace.
      trace: { sqlBaseStatus: "FAIL_CLOSED" },
    };
  }

  const grossTax = decimal(baseTax.grossTax);

  let rebate = 0n;
  let rebateStatus = "NOT_CLAIMED";
  const rawInvestmentClaim = sumObjectValues(returnData.taxRebates ?? {});
  const rebateTrace: Record<string, unknown> = {};

  if (rawInvestmentClaim > 0n) {
    if (!rebateVerification) {
      rebateStatus = "FAIL_CLOSED";
      missingFacts.push("section78Rule");
    } else if (returnData.adjustedTotalIncomeForRebate === undefined || returnData.eligibleInvestmentAmount === undefined) {
      rebateStatus = "NEEDS_FACTS";
      if (returnData.adjustedTotalIncomeForRebate === undefined) missingFacts.push("adjustedTotalIncomeForRebate");
      if (returnData.eligibleInvestmentAmount === undefined) missingFacts.push("eligibleInvestmentAmount");
    } else {
      const parsed = parseRebateFormula(rebateVerification);
      if (!parsed) {
        rebateStatus = "FAIL_CLOSED";
        missingFacts.push("section78StructuredFormula");
      } else {
        const adjustedIncome = decimal(returnData.adjustedTotalIncomeForRebate);
        const eligibleInvestment = decimal(returnData.eligibleInvestmentAmount);
        const incomeLimb = mul(adjustedIncome, parsed.incomeRate);
        const investmentLimb = mul(eligibleInvestment, parsed.investmentRate);
        rebate = min(incomeLimb, investmentLimb, parsed.cap);
        rebateStatus = "CALCULATED";
        Object.assign(rebateTrace, {
          formula: parsed.evidence,
          adjustedIncome: decimalString(adjustedIncome),
          eligibleInvestment: decimalString(eligibleInvestment),
          incomeLimb: decimalString(incomeLimb),
          investmentLimb: decimalString(investmentLimb),
          cap: decimalString(parsed.cap),
          rebate: decimalString(rebate),
        });
      }
    }
  }

  const netTax = max(0n, sub(grossTax, rebate));
  // A withholding declaration is NOT an authorized ledger credit. Prevent
  // payment claims from generating a lower payable amount until WS02 publishes
  // an immutable, ownership-verified payment-credit/reversal contract.
  const claimedTaxCredit = add(
    add(decimal(returnData.taxDeductedAtSource ?? "0"), decimal(returnData.advanceTaxPaid ?? "0")),
    decimal(returnData.selfAssessmentTaxPaid ?? "0"),
  );
  if (claimedTaxCredit > 0n) {
    return {
      status: "FAIL_CLOSED", code: "CREDIT_EVIDENCE_NOT_VERIFIED",
      missingFacts: ["ownerVerifiedPaymentCredits", "duplicateAndReversalCheck"],
      trace: { sqlBaseStatus: "CALCULATED", rebateStatus, creditDisposition: "EVIDENCE_ONLY_NOT_APPLIED" },
    };
  }
  const taxPaid = 0n;
  const balanceDue = max(0n, sub(netTax, taxPaid));

  const resultStatus = rebateStatus === "FAIL_CLOSED"
    ? "FAIL_CLOSED" : missingFacts.length ? "NEEDS_FACTS" : "CALCULATED";
  return {
    status: resultStatus,
    missingFacts: [...new Set(missingFacts)],
    // Only a fully CALCULATED result may carry monetary values or a detailed
    // SQL/rebate trace. Unresolved facts are never payable evidence.
    ...(resultStatus === "CALCULATED" ? { values: {
      totalIncome: decimalString(totalIncome),
      taxFreeThreshold: decimalString(decimal(baseTax.taxFreeThreshold)),
      grossTax: decimalString(grossTax),
      rebate: decimalString(rebate),
      netTax: decimalString(netTax),
      taxPaid: decimalString(taxPaid),
      balanceDue: decimalString(balanceDue),
    } } : {}),
    trace: resultStatus === "CALCULATED"
      ? { baseTax, rebateStatus, rebate: rebateTrace }
      : { sqlBaseStatus: "CALCULATED", rebateStatus },
  };
}


/**
 * An individually CALCULATED SQL base is not a certified payable result when
 * any other calculation/submission rule still blocks the overall return.
 * Receipt, audit and HTTP must share this same redacted projection.
 * This is a safety boundary, not statutory or source-law certification.
 */
function redactNonCalculatedIndividual(
  individual: Record<string, any>,
  fullReturnStatus: string,
) {
  if (fullReturnStatus === "CALCULATED") return individual;
  return {
    status: individual.status,
    ...(typeof individual.code === "string" ? { code: individual.code } : {}),
    missingFacts: Array.isArray(individual.missingFacts) ? individual.missingFacts : [],
    trace: { disclosure: "WITHHELD_NON_CALCULATED_RETURN" },
  };
}

Deno.serve(async (req) => {
  // Fail closed on cross-origin callers; allow only exact, configured HTTPS origins.
  const origin = req.headers.get("origin");
  const allowedOrigins = (Deno.env.get("NBR_TAX_ALLOWED_ORIGINS") ?? "")
    .split(",").map((item) => item.trim()).filter((item) => /^https:\/\/[^/]+$/.test(item));
  if (origin && !allowedOrigins.includes(origin)) return new Response(null, { status: 403 });
  const responseHeaders = { ...corsHeaders, ...(origin ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}) };
  // Request-scoped JSON ensures the same exact-origin policy on error paths.
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { ...responseHeaders, "Content-Type": "application/json" },
  });
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const functionIndex = pathParts.lastIndexOf("nbr-tax-engine");
    const route = functionIndex >= 0 ? pathParts.slice(functionIndex + 1) : pathParts.slice(-1);

    if (req.method === "GET" && route[0] === "health") {
      return json({ ok: true, engineVersion: ENGINE_VERSION });
    }

    if (req.method === "GET" && route[0] === "years") {
      return json({ status:"FAIL_CLOSED", code:"YEARS_PRIVATE",
        error:"Use the audited Rules API public-year catalogue rather than a privileged calculator query" }, 403);
      // Historical implementation preserved below but unreachable.

      const { data:years, error:yearsError } = await supabase
        .from("nbr_tax_years")
        .select("assessment_year,income_year,state,is_executable,is_immutable,source_registry_version,legal_cutoff")
        .order("assessment_year", { ascending:false });
      if (yearsError) throw yearsError;
      return json({
        engineVersion: ENGINE_VERSION,
        years: (years ?? []).map((year:any)=>({
          assessmentYear: year.assessment_year,
          incomeYear: year.income_year,
          state: year.state,
          executable: year.is_executable,
          immutable: year.is_immutable,
          sourceRegistryVersion: year.source_registry_version,
          legalCutoff: year.legal_cutoff,
        })),
      });
    }

    if (req.method === "GET" && route[0] === "status") {
      return json({ status:"FAIL_CLOSED", code:"STATUS_NOT_PUBLIC",
        error:"Private engine source/gate diagnostics require an approved Admin session" }, 403);
      // Retained historic implementation below for non-destructive recovery;
      // current public path cannot reach service-role diagnostics.

      const { data:year, error:yearError } = await supabase
        .from("nbr_tax_years")
        .select("id,assessment_year,income_year,state,coverage,is_executable,is_immutable,source_registry_version,legal_cutoff")
        .eq("state","active")
        .eq("is_executable",true)
        .maybeSingle();
      if (yearError) throw yearError;
      if (!year) return json({ ok:false, error:"No active executable tax year" }, 503);

      const { data:statusRows, error:countError } = await supabase
        .from("nbr_rule_versions")
        .select("rule_key,revision_no,execution_status,group_id")
        .eq("tax_year_id",year.id)
        .eq("is_current",true)
        .order("rule_key");
      if (countError) throw countError;

      const executionStateCounts:Record<string,number> = {};
      for (const row of statusRows ?? []) {
        const key = String(row.execution_status ?? "UNSPECIFIED");
        executionStateCounts[key] = (executionStateCounts[key] ?? 0) + 1;
      }
      const recognizedStatuses = new Set([
        "CURRENT_EXECUTABLE","EXECUTABLE_AS_RECORDED","EXECUTABLE_CURRENT","EXECUTABLE_WITH_GUARD",
        "FACT_GATED","FAIL_CLOSED","FAIL_CLOSED_PUBLIC_EVIDENCE","HISTORICAL_ONLY",
        "NON_EXECUTABLE_UNLESS_CANONICAL_OVERRIDE","NOT_APPLICABLE"
      ]);
      const unhandledRuleCount = (statusRows ?? []).filter((row:any)=>!recognizedStatuses.has(String(row.execution_status ?? ""))).length;

      const { data:bindingRows, error:bindingError } = await supabase
        .from("nbr_rule_runtime_bindings")
        .select("rule_key,runtime_mode,affects_calculation,affects_submission")
        .eq("tax_year_id",year.id)
        .order("rule_key");
      if (bindingError) throw bindingError;
      const bindingCoverageCount = (bindingRows ?? []).length;
      const missingBindingCount = (statusRows ?? []).filter(
        (row:any)=>!(bindingRows ?? []).some((binding:any)=>binding.rule_key===row.rule_key)
      ).length;

      const { data:parameters, error:paramError } = await supabase
        .from("nbr_engine_parameter_sets")
        .select("parameter_key,revision_no,status,legal_source")
        .eq("assessment_year",year.assessment_year)
        .eq("is_current",true)
        .order("parameter_key");
      if (paramError) throw paramError;

      const syncFingerprint = await sha256(canonical({
        rules:(statusRows ?? []).map((row:any)=>({
          ruleKey:row.rule_key,
          revision:row.revision_no,
          executionStatus:row.execution_status,
          groupId:row.group_id,
        })),
        bindings:(bindingRows ?? []).map((binding:any)=>({
          ruleKey:binding.rule_key,
          runtimeMode:binding.runtime_mode,
          affectsCalculation:binding.affects_calculation,
          affectsSubmission:binding.affects_submission,
        })),
        parameters:(parameters ?? []).map((parameter:any)=>({
          key:parameter.parameter_key,
          revision:parameter.revision_no,
          status:parameter.status,
        })),
      }));

      return json({
        ok:true,
        engineVersion:ENGINE_VERSION,
        activeYear:year.assessment_year,
        incomeYear:year.income_year,
        coverage:year.coverage,
        immutable:year.is_immutable,
        ruleCount:(statusRows ?? []).length,
        handledRuleCount:(statusRows ?? []).length - unhandledRuleCount,
        unhandledRuleCount,
        allRuleNodesMapped:unhandledRuleCount === 0 && missingBindingCount === 0,
        runtimeBindingCount:bindingCoverageCount,
        missingRuntimeBindingCount:missingBindingCount,
        executionStateCounts,
        sourceRegistryVersion:year.source_registry_version,
        legalCutoff:year.legal_cutoff,
        arithmetic:"SQL NUMERIC + fixed decimal(10) edge arithmetic",
        ruleAuthority:"Current SQL rule versions; no citizen-side tax constants",
        syncFingerprint,
        parameters:parameters ?? [],
      });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    // Explicit disabled-by-default guard before taxpayer interaction. The
    // isolated tests set this flag with in-memory mocks; deployed W5 remains off.
    if (Deno.env.get("NBR_TAX_EXECUTION_ENABLED") !== "true") {
      return json({ status:"FAIL_CLOSED", code:"ENGINE_DISABLED", error:"Executable engine is not approved" }, 503);
    }

    const token = verifiedBearer(req);
    if (!token || token === serviceRole) {
      return json({ error: "Authenticated taxpayer session required" }, 401);
    }
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || typeof authData?.user?.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(authData.user.id)) {
      return json({ error: "Authenticated taxpayer session required" }, 401);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || !validAssessmentYear(body.assessmentYear)) {
      return json({ error: "An explicit, valid assessmentYear is required" }, 400);
    }
    if (body.contractVersion !== CONTRACT_VERSION ||
        !validIsoDate(body.legalEventDate) ||
        !validIsoDate(body.expectedSourceCutoff) ||
        typeof body.expectedRuleSetHash !== "string" || !/^[a-f0-9]{64}$/i.test(body.expectedRuleSetHash) ||
        typeof body.expectedParameterRevision !== "number" || (!Number.isSafeInteger(body.expectedParameterRevision) || body.expectedParameterRevision < 1) ||
        typeof body.idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(body.idempotencyKey) ||
        !objectRecord(body.taxpayer) || typeof body.taxpayer.residency !== "string" ||
        !["resident","nonresident"].includes(body.taxpayer.residency) ||
        typeof body.taxpayer.industryCode !== "string" ||
        !/^[A-Za-z0-9_.-]{1,64}$/.test(body.taxpayer.industryCode) ||
        typeof body.taxpayer.specialCategory !== "string" ||
        !["none","female","senior_citizen","person_with_disability","third_gender","gazetted_freedom_fighter","july_warrior","parent_of_disabled"].includes(body.taxpayer.specialCategory)) {
      return json({ status:"FAIL_CLOSED", code:"VERSIONED_CONTRACT_REQUIRED", error:"Explicit verified year, event, taxpayer class and pinned source revisions are required" }, 422);
    }
    if (body.taxpayer.residency !== "resident") {
      return json({ status:"FAIL_CLOSED", code:"UNSUPPORTED_RESIDENCY_SCOPE",
        error:"Nonresident calculation requires separate verified applicability and treaty source" }, 409);
    }
    const invalidFacts = invalidCalculationFacts(body);
    if (invalidFacts.length > 0) {
      return json({ error: "Taxpayer or income inputs are missing or invalid", status: "FAIL_CLOSED", invalidFacts }, 422);
    }
    if (body.taxpayer.industryCode === "not_applicable" &&
        decimal(body.returnData?.incomeHeads?.businessProfession ?? "0") > 0n) {
      return json({ status:"FAIL_CLOSED", code:"INDUSTRY_CLASSIFICATION_REQUIRED",
        error:"Business/final-tax industry requires a reviewed statutory classification" }, 409);
    }
    // A user JWT alone is not evidence of ownership of this taxpayer return.
    // WS02 must implement and certify this owner-checked SQL RPC; until then,
    // the missing function produces a 503 and evaluation cannot use service-role data.
    const taxpayerRecordId = body.taxpayerRecordId;
    if (typeof taxpayerRecordId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(taxpayerRecordId)) {
      return json({ error:"An owned taxpayer record identifier is required", status:"FAIL_CLOSED", code:"TAXPAYER_RECORD_REQUIRED" }, 422);
    }
    const assessmentYear = body.assessmentYear;
    if (typeof body.incomeYear !== "string" || !validAssessmentYear(body.incomeYear)) {
      return json({ error:"An explicit incomeYear is required", status:"FAIL_CLOSED", code:"INCOME_YEAR_REQUIRED" }, 422);
    }

    // This RPC must check immutable owner/tenant mapping, not caller-submitted
    // identity or client metadata. User UUID comes only from auth.getUser(token).
    const { data: ownership, error: ownershipError } = await supabase.rpc(
      "nbr_authorize_citizen_evaluation", {
        p_auth_user_id: authData.user.id,
        p_taxpayer_record_id: taxpayerRecordId,
        p_assessment_year: assessmentYear,
      });
    if (ownershipError || typeof ownership !== "boolean") {
      return json({ error:"Taxpayer ownership authorization is unavailable", status:"FAIL_CLOSED", code:"OWNERSHIP_GATE_UNAVAILABLE" }, 503);
    }
    if (ownership !== true) {
      return json({ error:"Taxpayer record access denied", status:"FAIL_CLOSED", code:"TAXPAYER_ACCESS_DENIED" }, 403);
    }

    // Read only the owner-authorized year metadata before reserving an
    // idempotency slot. A known AY/IY mismatch must not consume a reservation.
    // This is NOT a privileged rule/parameter read or a substitute for the
    // authoritative WS02 owner/tenant contract.
    const { data: year, error: yearError } = await supabase
      .from("nbr_tax_years")
      .select("id,assessment_year,income_year,state,coverage,is_executable,is_immutable,source_registry_version,legal_cutoff")
      .eq("assessment_year", assessmentYear)
      .maybeSingle();
    if (yearError) throw yearError;
    if (!year) return json({ error: "Assessment year not found" }, 404);
    // The owner-scoped year row must carry a real immutable SQL identity.
    // Without it a replay slot could be consumed before a rule read fails.
    if (typeof year.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(year.id)) {
      return json({ status:"FAIL_CLOSED", code:"YEAR_METADATA_UNVERIFIED",
        error:"Authoritative assessment-year record identity is missing or invalid" }, 503);
    }
    // Fail closed if a year-filtered response contains a different AY.
    // Ownership authorization does not permit a cross-year metadata fallback.
    if (year.assessment_year !== assessmentYear) {
      return json({ error:"Assessment-year metadata is inconsistent with the authorized request",
        status:"FAIL_CLOSED", code:"YEAR_MISMATCH" }, 409);
    }
    if (year.is_executable !== true || year.state !== "active") {
      return json({ error: "Assessment year is not active for citizen calculation", status:"FAIL_CLOSED", code:"UNAPPROVED_YEAR" }, 409);
    }
    // An executable year is not an immutable legal-rule snapshot. Reject a
    // mutable or missing SQL freeze flag before consuming any replay slot or
    // accessing privileged rules. This is not legal provenance certification.
    if (year.is_immutable !== true) {
      return json({ status:"FAIL_CLOSED", code:"YEAR_NOT_IMMUTABLE",
        error:"Assessment-year ruleset is not frozen for reproducible evaluation" }, 409);
    }
    // A frozen-rule identity/count gate cannot authorize a year referencing a
    // different or missing canonical source registry. This string pin is only
    // an early denial: it does NOT prove registry bytes or legal provenance.
    if (year.source_registry_version !== FROZEN_REGISTRY_VERSION) {
      return json({ status:"FAIL_CLOSED", code:"REGISTRY_VERSION_UNVERIFIED",
        error:"Assessment-year source registry version is not the frozen reviewed baseline" }, 409);
    }
    if (year.income_year !== body.incomeYear) {
      return json({ error:"Income year is inconsistent with approved assessment-year record", status:"FAIL_CLOSED", code:"YEAR_MISMATCH" }, 409);
    }
    // The SQL year source cutoff is authoritative. Reject stale caller pins
    // and post-cutoff events before consuming an idempotency reservation or
    // reading privileged rule/parameter data; the SQL commit must revalidate.
    if (!validIsoDate(year.legal_cutoff) ||
        year.legal_cutoff !== body.expectedSourceCutoff ||
        body.legalEventDate > year.legal_cutoff) {
      return json({ status:"FAIL_CLOSED", code:"LEGAL_EVENT_CUTOFF_UNVERIFIED",
        error:"Legal event falls outside source-reviewed cutoff or cutoff is missing" }, 409);
    }

    // REVIEW-ONLY safety boundary. A transaction event cannot be assumed to
    // belong to a prior income year merely because the later legal source
    // cutoff covers the event. This standard July-June label check is a
    // conservative denial, NOT a determination of statutory applicability,
    // savings, special income periods, or return entitlement. A verified
    // event/cohort selection contract must replace this candidate before release.
    // ruleFacts is shared by several runtime modes. Before certified rule
    // binding selection exists, a nonempty set may include a TRANSACTION_EVENT;
    // deny its out-of-period use rather than allow a ruleFacts-only bypass.
    // This is deliberately conservative and requires a typed reviewed event
    // selector before release, including any source-backed special periods.
    const transactionClaimed = (
      (Array.isArray(body.transactionRuleIds) && body.transactionRuleIds.length > 0) ||
      (Array.isArray(body.paymentRuleIds) && body.paymentRuleIds.length > 0) ||
      (objectRecord(body.transactions) && Object.keys(body.transactions).length > 0) ||
      (objectRecord(body.paymentEvents) && Object.keys(body.paymentEvents).length > 0) ||
      (objectRecord(body.ruleFacts) && Object.keys(body.ruleFacts).length > 0)
    );
    const recordedYearStart = Number(year.income_year.slice(0, 4));
    const periodStart = `${recordedYearStart}-07-01`;
    const periodEnd = `${recordedYearStart + 1}-06-30`;
    const outsideRecordedIncomePeriod =
      body.legalEventDate < periodStart || body.legalEventDate > periodEnd;
    if (transactionClaimed && outsideRecordedIncomePeriod) {
      return json({
        status:"FAIL_CLOSED",
        code:"TRANSACTION_PERIOD_REVIEW_REQUIRED",
        error:"The transaction event is outside the recorded standard income period; reviewed event/year and savings applicability is required",
      }, 409);
    }
    // An event-rule selector alone is not dated evidence. Every selected
    // withholding/payment rule must have a matching typed event entry;
    // existing per-event date checks below still apply. Reject before
    // consuming an owner-bound idempotency slot or reading privileged rules.
    for (const [ids, events] of [
      [body.transactionRuleIds, body.transactions],
      [body.paymentRuleIds, body.paymentEvents],
    ]) {
      if (ids === undefined) continue;
      if (!Array.isArray(ids) ||
          ids.some((id) => typeof id !== "string" ||
            !/^[A-Za-z0-9_.-]{1,128}$/.test(id)) ||
          // When an explicit selector is supplied, no unselected event key
          // may be passed onward to the calculation pipeline.
          (objectRecord(events) && Object.keys(events).some((key) => !ids.includes(key))) ||
          (ids.length > 0 && (!objectRecord(events) ||
            ids.some((id) => !Object.prototype.hasOwnProperty.call(events, id))))) {
        return json({ status:"FAIL_CLOSED", code:"EVENT_RULE_FACTS_UNVERIFIED",
          error:"Selected transaction/payment rules require matching dated event facts" }, 422);
      }
    }
    // No single caller-supplied legalEventDate can prove multiple transaction
    // dates. Fail closed on absent, malformed, or contradictory per-event dates.
    // This is an unapproved safety restriction; the future source-verified
    // cohort selector must account for statutory savings and special periods.
    if (body.transactions !== undefined) {
      if (!objectRecord(body.transactions)) {
        return json({ status:"FAIL_CLOSED", code:"TRANSACTION_FACTS_UNVERIFIED",
          error:"A typed map of dated transaction events is required" }, 422);
      }
      for (const value of Object.values(body.transactions)) {
        if (!objectRecord(value)) {
          return json({ status:"FAIL_CLOSED", code:"TRANSACTION_FACTS_UNVERIFIED",
            error:"Each transaction must contain a verified date" }, 422);
        }
        const eventDates = ["eventDate", "legalEventDate", "transactionEventDate"]
          .filter((key) => value[key] !== undefined).map((key) => value[key]);
        if (eventDates.length === 0 || eventDates.some((date) =>
            typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            Number.isNaN(Date.parse(date + "T00:00:00Z")) ||
            new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date)) {
          return json({ status:"FAIL_CLOSED", code:"TRANSACTION_EVENT_DATE_REQUIRED",
            error:"Transaction date is missing or invalid" }, 422);
        }
        if (eventDates.some((date) => date !== body.legalEventDate)) {
          return json({ status:"FAIL_CLOSED", code:"TRANSACTION_EVENT_DATE_CONFLICT",
            error:"Per-transaction dates disagree with the requested legal event date" }, 409);
        }
      }
    }
    // Payment events also select time-sensitive rules. A caller must not
    // bypass the transaction date guard through paymentEvents/paymentRuleIds.
    // This validates shape/consistency only; no payment credit is approved.
    if (body.paymentEvents !== undefined) {
      if (!objectRecord(body.paymentEvents)) {
        return json({ status:"FAIL_CLOSED", code:"PAYMENT_FACTS_UNVERIFIED",
          error:"A typed map of dated payment events is required" }, 422);
      }
      for (const value of Object.values(body.paymentEvents)) {
        if (!objectRecord(value)) {
          return json({ status:"FAIL_CLOSED", code:"PAYMENT_FACTS_UNVERIFIED",
            error:"Each payment event must contain dated facts" }, 422);
        }
        const eventDates = ["eventDate", "legalEventDate", "transactionEventDate"]
          .filter((key) => value[key] !== undefined).map((key) => value[key]);
        if (eventDates.length === 0 || eventDates.some((date) => !validIsoDate(date))) {
          return json({ status:"FAIL_CLOSED", code:"PAYMENT_EVENT_DATE_REQUIRED",
            error:"Payment event date is missing or invalid" }, 422);
        }
        if (eventDates.some((date) => date !== body.legalEventDate)) {
          return json({ status:"FAIL_CLOSED", code:"PAYMENT_EVENT_DATE_CONFLICT",
            error:"Payment event date conflicts with evaluated legal event date" }, 409);
        }
      }
    }
    // A dated event map can trigger downstream rule applicability even when
    // the corresponding explicit selector was omitted. Require a reviewed,
    // exact selector before the idempotency reservation. Validate event dates
    // first so malformed evidence keeps its specific fail-closed diagnostic.
    for (const [events, ids] of [
      [body.transactions, body.transactionRuleIds],
      [body.paymentEvents, body.paymentRuleIds],
    ]) {
      if (objectRecord(events) && Object.keys(events).length > 0 &&
          (!Array.isArray(ids) || ids.length === 0)) {
        return json({ status:"FAIL_CLOSED", code:"EVENT_RULE_FACTS_UNVERIFIED",
          error:"Dated transaction/payment events require explicit matching rule selectors" }, 422);
      }
    }
    // Existing ruleFacts carries multiple event types. If it does declare
    // transaction dates, a contradictory date cannot override the request
    // date used for legal-source and effective-period selection.
    if (objectRecord(body.ruleFacts)) {
      for (const value of Object.values(body.ruleFacts)) {
        if (!objectRecord(value)) continue;
        for (const key of ["eventDate", "legalEventDate", "transactionEventDate"]) {
          if (value[key] !== undefined && value[key] !== body.legalEventDate) {
            return json({ status:"FAIL_CLOSED", code:"RULE_EVENT_DATE_CONFLICT",
              error:"Structured rule fact date conflicts with the evaluated event date" }, 409);
          }
        }
      }
    }
    // Any structured rule fact can trigger runtime applicability, including
    // nonmonetary predicates. Require an explicit matching rule selector
    // before reservation; no client fact may silently choose a legal rule.
    // This is a conservative synthetic safety check, not statutory approval.
    if (objectRecord(body.ruleFacts)) {
      const selectedRuleIds = new Set([
        ...(body.claimRuleIds ?? []),
        ...(body.transactionRuleIds ?? []),
        ...(body.paymentRuleIds ?? []),
      ]);
      for (const [ruleId, facts] of Object.entries(body.ruleFacts)) {
        if (objectRecord(facts) && Object.keys(facts).length > 0 &&
            !selectedRuleIds.has(ruleId)) {
          return json({ status:"FAIL_CLOSED", code:"EVENT_RULE_FACTS_UNVERIFIED",
            error:"Structured rule facts require an explicit matching rule selector" }, 422);
        }
      }
    }
    // A caller-supplied benefit claim must not implicitly select a statutory
    // benefit through truthiness alone. Require an explicit matching rule ID
    // and nonempty structured facts before any replay reservation. This only
    // checks shape and selection; legal entitlement remains uncertified.
    if (body.benefitClaims !== undefined &&
        (!objectRecord(body.benefitClaims) ||
         Object.entries(body.benefitClaims).some(([ruleId, facts]) =>
           !Array.isArray(body.claimRuleIds) ||
           !body.claimRuleIds.includes(ruleId) ||
           !objectRecord(facts) || Object.keys(facts).length === 0))) {
      return json({ status:"FAIL_CLOSED", code:"BENEFIT_CLAIM_FACTS_UNVERIFIED",
        error:"Benefit claims require matching explicit rule selectors and structured facts" }, 422);
    }
    // Caller-controlled returnContext can trigger RETURN_EVENT applicability.
    // Do not let an untyped events map, string.includes, or selector-only
    // claim choose a legal rule before owner-bound replay reservation.
    // This validates shape and exact selection only; it is not proof of a
    // legally applicable filing event or a certified return-year mapping.
    if (body.returnContext !== undefined) {
      const context = body.returnContext;
      const ids = objectRecord(context) ? context.ruleIds : null;
      const events = objectRecord(context) ? context.events : null;
      if (!objectRecord(context) || !Array.isArray(ids) ||
          ids.length > FROZEN_BASELINE_RULE_COUNT ||
          ids.some((id) => typeof id !== "string" ||
            !/^[A-Za-z0-9_.-]{1,128}$/.test(id)) ||
          new Set(ids).size !== ids.length ||
          !objectRecord(events) ||
          Object.keys(events).length !== ids.length ||
          ids.some((id) => !Object.prototype.hasOwnProperty.call(events, id) ||
            !objectRecord(events[id]) || Object.keys(events[id]).length === 0) ||
          Object.keys(events).some((id) => !ids.includes(id))) {
        return json({ status:"FAIL_CLOSED", code:"RETURN_CONTEXT_FACTS_UNVERIFIED",
          error:"Return/workflow events require matching explicit rule selectors and structured facts" }, 422);
      }
      // An explicit dated RETURN_EVENT cannot silently contradict the legal
      // event used to select source versions. Absence of a date is NOT treated
      // as evidence of a filing event; statutory applicability remains HOLD.
      for (const event of Object.values(events as Record<string, Record<string, unknown>>)) {
        const explicitDateKeys = ["eventDate", "legalEventDate", "transactionEventDate"]
          .filter((key) => Object.prototype.hasOwnProperty.call(event, key));
        // A selector and eventType without a civil date cannot establish a
        // legal filing event. Do not allow an undated RETURN_EVENT to become
        // APPLICABLE through a truthy context.events entry.
        if (explicitDateKeys.length === 0) {
          return json({ status:"FAIL_CLOSED", code:"RETURN_CONTEXT_EVENT_DATE_REQUIRED",
            error:"Return/workflow event requires an explicit civil date" }, 422);
        }
        // A dated object alone is not a typed return/workflow event. Require
        // a bounded discriminator, without assuming any statutory event taxonomy.
        // Legal event eligibility remains independently uncertified.
        if (typeof event.eventType !== "string" ||
            !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(event.eventType)) {
          return json({ status:"FAIL_CLOSED", code:"RETURN_CONTEXT_EVENT_TYPE_UNVERIFIED",
            error:"Return/workflow event requires a typed event discriminator" }, 422);
        }
        for (const key of explicitDateKeys) {
          if (!validIsoDate(event[key])) {
            return json({ status:"FAIL_CLOSED", code:"RETURN_CONTEXT_EVENT_DATE_REQUIRED",
              error:"Explicit return/workflow event date must be a valid civil date" }, 422);
          }
          if (event[key] !== body.legalEventDate) {
            return json({ status:"FAIL_CLOSED", code:"RETURN_CONTEXT_EVENT_DATE_CONFLICT",
              error:"Return/workflow event date conflicts with evaluated legal event date" }, 409);
          }
        }
      }
    }
    // Deny known invalid transaction event dates and periods before reserving
    // an idempotency key. WS02 must still recheck owner/year inside atomic SQL.
    // Atomic reserve or replay denial must be implemented by WS02 in an
    // isolated migration; without it no privileged calculation may proceed.
    const authorizedRequestHash = await sha256(canonical({
      userId: authData.user.id, taxpayerRecordId, request: body,
    }));
    const { data: reservation, error: reservationError } = await supabase.rpc(
      "nbr_reserve_citizen_evaluation", {
        p_auth_user_id: authData.user.id,
        p_taxpayer_record_id: taxpayerRecordId,
        p_assessment_year: assessmentYear,
        p_idempotency_key: body.idempotencyKey,
        p_request_hash: authorizedRequestHash,
        p_contract_version: CONTRACT_VERSION,
      });
    if (reservationError || !objectRecord(reservation) || typeof reservation.state !== "string") {
      return json({ status:"FAIL_CLOSED", code:"REPLAY_GATE_UNAVAILABLE",
        error:"Approved atomic replay/idempotency gate unavailable" }, 503);
    }
    if (reservation.state !== "RESERVED") {
      return json({ status:"FAIL_CLOSED", code:"REPLAY_NOT_ACCEPTED",
        error:"Duplicate or conflicting evaluation request denied" }, 409);
    }

    const { data: rows, error: ruleError } = await supabase
      .from("nbr_rule_versions")
      .select("id,rule_key,revision_no,source_assessment_year,year_applicability_status,execution_status,group_id,rule_data")
      .eq("tax_year_id", year.id)
      .eq("is_current", true)
      .order("rule_key");
    if (ruleError) throw ruleError;
    if (!Array.isArray(rows) || rows.length !== FROZEN_BASELINE_RULE_COUNT ||
        new Set(rows.map((row: any) => row.rule_key)).size !== rows.length) {
      return json({ error: "Canonical rule coverage is incomplete or duplicated", status: "FAIL_CLOSED" }, 503);
    }
    const identityHash = await sha256(rows.map((row: any) => String(row.rule_key)).sort().join("\n"));
    if (identityHash !== FROZEN_RULE_IDENTITY_SHA256) {
      return json({ error: "Current rule identities do not match the frozen certified registry", status: "FAIL_CLOSED" }, 503);
    }

    const { data: scheduleRow, error: scheduleError } = await supabase
      .from("nbr_engine_parameter_sets")
      .select("id,revision_no,parameter_data,legal_source,status")
      .eq("assessment_year", assessmentYear)
      .eq("parameter_key", "INDIVIDUAL_TAX_SCHEDULE")
      .eq("is_current", true)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (scheduleError) throw scheduleError;
    const { data:bindingRows, error:bindingError } = await supabase
      .from("nbr_rule_runtime_bindings")
      .select("rule_key,runtime_mode,entity_types,trigger_key,affects_calculation,affects_submission,source_basis")
      .eq("tax_year_id",year.id);
    if (bindingError) throw bindingError;
    const bindingMap = new Map((bindingRows ?? []).map((binding:any)=>[binding.rule_key,binding]));
    if (!Array.isArray(bindingRows) || bindingRows.length !== rows.length ||
        bindingMap.size !== rows.length) {
      return json({ error:"Tax engine runtime binding identities are missing, duplicated, or unreviewed.", status:"FAIL_CLOSED" }, 503);
    }
    const missingBindings = (rows ?? []).filter((row:any)=>!bindingMap.has(row.rule_key)).map((row:any)=>row.rule_key);
    if (missingBindings.length > 0) {
      return json({ error:"Tax engine runtime binding coverage is incomplete.", missingRuleIds:missingBindings }, 503);
    }

    // The calculation schedule is as consequential as the 366 rule versions.
    // Changes in tax slabs/thresholds/minimum-tax parameters revoke an older
    // approval even when the rule IDs and runtime bindings remain unchanged.
    const ruleSetHash = await sha256(canonical({
      rules: (rows ?? []).map((row: any) => ({
        rule_key: row.rule_key,
        revision_no: row.revision_no,
        execution_status: row.execution_status,
        year_applicability_status: row.year_applicability_status,
        group_id: row.group_id,
        rule_data: row.rule_data,
        runtime_binding: bindingMap.get(row.rule_key) ?? null,
      })),
      individual_tax_schedule: scheduleRow ? {
        revision_no: scheduleRow.revision_no,
        parameter_data: scheduleRow.parameter_data,
        legal_source: scheduleRow.legal_source,
        status: scheduleRow.status,
      } : null,
    }));

    if (ruleSetHash !== body.expectedRuleSetHash) {
      return json({ status:"FAIL_CLOSED", code:"STALE_RULESET_REVISION",
        error:"Supplied approved rule-set hash does not match current immutable SQL versions" }, 409);
    }

    const { data: releaseGates, error: releaseGateError } = await supabase
      .from("nbr_tax_year_gate_results")
      .select("gate_code,status,evidence_ref,evidence_detail,evaluated_at,evaluated_by")
      .eq("tax_year_id", year.id)
      .in("gate_code", [...RELEASE_GATES]);
    if (releaseGateError) {
      return json({ error:"Engine release certification lookup failed", status:"FAIL_CLOSED" }, 503);
    }
    const pendingGates = missingReleaseGates(releaseGates ?? [], ruleSetHash);
    if (pendingGates.length > 0) {
      return json({ error:"Current legal/security/QA acceptance is pending", status:"FAIL_CLOSED", pendingGates }, 409);
    }

    if (!scheduleRow || scheduleRow.revision_no !== body.expectedParameterRevision ||
        !scheduleRow.legal_source || scheduleRow.status !== "ACTIVE" ||
        scheduleRow.parameter_data?.rounding_policy !== "FIXED_DECIMAL_10_TRUNCATE_TOWARD_ZERO") {
      return json({ status:"FAIL_CLOSED", code:"UNAPPROVED_PARAMETER_REVISION",
        error:"Selected parameter version is missing, stale or has no legal provenance" }, 409);
    }

    // Per-rule legal attestations belong to the separate release-evidence
    // overlay. Never rewrite the immutable canonical rule_data to add them.
    const legalReleaseGate = (releaseGates ?? []).find((gate: any) => gate.gate_code === "LEGAL_SOURCE_V2_1");
    const attestations = legalReleaseGate?.evidence_detail?.rule_verifications ?? {};
    const unverifiedRuleIds = (rows ?? []).filter((row: any) => {
      const binding = bindingMap.get(row.rule_key);
      if (!binding?.affects_calculation && !binding?.affects_submission) return false;
      const verification = attestations[row.rule_key];
      return verification?.status !== "VERIFIED" ||
        verification?.amendment_conflict === true ||
        verification?.savings_unresolved === true ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(verification?.effective_from ?? "")) ||
        verification.effective_from > body.legalEventDate ||
        (verification.effective_until && verification.effective_until < body.legalEventDate) ||
        verification?.revision_no !== row.revision_no ||
        typeof verification?.source_sha256 !== "string" ||
        !/^[a-f0-9]{64}$/i.test(verification.source_sha256) ||
        !verification?.provision_locator ||
        !verification?.effective_from ||
        !verification?.reviewed_by;
    }).map((row: any) => row.rule_key);
    if (unverifiedRuleIds.length > 0) {
      return json({
        error:"Current rule-level legal verification is incomplete",
        status:"FAIL_CLOSED",
        unverifiedCount:unverifiedRuleIds.length,
      }, 409);
    }

    const ruleFacts = body.ruleFacts ?? {};
    const results = (rows ?? []).map((row) =>
      evaluateRule(
        row as Record<string, any>,
        bindingMap.get((row as Record<string, any>).rule_key) as Record<string, any> | null,
        body,
        ruleFacts,
      )
    );

    const rebateRow = (rows ?? []).find((row: any) => row.rule_key === "S78-GENERAL-REBATE-FA2026");
    const rebateVerification = rebateRow && attestations[rebateRow.rule_key];
    const totalIncomeForBaseTax = decimalString(sumObjectValues(body.returnData?.incomeHeads ?? {}));
    const { data:baseTaxResult, error:baseTaxError } = await supabase.rpc(
      "nbr_engine_calculate_individual_base_tax",
      {
        p_assessment_year: assessmentYear,
        p_parameter_revision: scheduleRow.revision_no,
        p_expected_rule_set_hash: ruleSetHash,
        p_total_income: totalIncomeForBaseTax,
        p_special_category: String(body.taxpayer?.specialCategory ?? "none"),
        p_is_new_taxpayer:
          body.taxpayer?.isNewTaxpayer === undefined || body.taxpayer?.isNewTaxpayer === null
            ? null
            : body.taxpayer.isNewTaxpayer,
        p_disabled_child_count:
          body.taxpayer?.disabledChildCount === undefined || body.taxpayer?.disabledChildCount === null
            ? null
            : Number(body.taxpayer?.disabledChildCount),
      },
    );
    if (baseTaxError) {
      return json({ status:"FAIL_CLOSED", code:"BASE_TAX_SQL_CONTRACT_UNAVAILABLE",
        error:"Reviewed version-pinned calculation RPC is unavailable" }, 503);
    }
    if (baseTaxResult?.status === "CALCULATED" &&
        (baseTaxResult?.parameter_revision !== scheduleRow.revision_no ||
         baseTaxResult?.rule_set_hash !== ruleSetHash ||
         baseTaxResult?.rounding_policy !== scheduleRow.parameter_data.rounding_policy)) {
      return json({ status:"FAIL_CLOSED", code:"UNPINNED_SQL_CALCULATION",
        error:"SQL tax calculation returned an unverified ruleset, revision or rounding policy" }, 409);
    }

    const individual = scheduleRow
      ? computeIndividualFromSqlBase(
          (baseTaxResult ?? {}) as Record<string, any>,
          (rebateVerification ?? null) as Record<string, any> | null,
          body,
        )
      : { status: "FAIL_CLOSED", missingFacts: ["INDIVIDUAL_TAX_SCHEDULE"], trace: [] };

    const applied = results.filter((r: any) => ["APPLIED","CALCULATED","FACTS_SATISFIED"].includes(r.state)).length;
    const needsFacts = results.filter((r: any) => r.state === "NEEDS_FACTS").length;
    const blocked = results.filter((r: any) => r.state === "FAIL_CLOSED").length;
    const historical = results.filter((r: any) => r.state === "HISTORICAL_ONLY").length;
    const notApplicable = results.filter((r: any) => r.state === "NOT_APPLICABLE").length;
    const notTriggered = results.filter((r: any) => r.state === "NOT_TRIGGERED").length;
    const recognizedRuntimeStates = new Set([
      "APPLIED","CALCULATED","FACTS_SATISFIED","NEEDS_FACTS","FAIL_CLOSED",
      "HISTORICAL_ONLY","NOT_APPLICABLE","NOT_TRIGGERED"
    ]);
    const unhandled = results.filter((r:any)=>!recognizedRuntimeStates.has(String(r.state))).length;
    const inputHash = authorizedRequestHash;

    const relevantBlocked = results.filter((r:any)=>
      r.state === "FAIL_CLOSED" && (r.affectsCalculation || r.affectsSubmission)
    ).length;
    const relevantNeedsFacts = results.filter((r:any)=>
      r.state === "NEEDS_FACTS" && (r.affectsCalculation || r.affectsSubmission)
    ).length;

    const fullReturnStatus =
      individual.status === "FAIL_CLOSED" || relevantBlocked > 0 || unhandled > 0
        ? "FAIL_CLOSED"
        : individual.status === "NEEDS_FACTS" || relevantNeedsFacts > 0
          ? "NEEDS_FACTS"
          : "CALCULATED";
    const safeIndividual = redactNonCalculatedIndividual(individual, fullReturnStatus);
    // Tax arithmetic acceptance is never equivalent to filing permission.
    const submissionReady = false;
    const computationComplete =
      fullReturnStatus === "CALCULATED" &&
      results.length === (rows ?? []).length &&
      unhandled === 0;

    const receipt = {
      contractVersion: CONTRACT_VERSION,
      engineVersion: ENGINE_VERSION,
      assessmentYear, incomeYear: year.income_year,
      legalEventDate: body.legalEventDate,
      ruleSetHash, parameterRevision: scheduleRow.revision_no,
      inputHash, evaluationStatus: fullReturnStatus,
      computationComplete, submissionReady,
      ruleVersions: rows.map((row:any) => ({ id:row.rule_key, revision:row.revision_no })),
      trace: { individual:safeIndividual.trace, rules:results },
      amounts: fullReturnStatus === "CALCULATED" ? individual.values : null,
    };
    const receiptHash = await sha256(canonical(receipt));
    // All-or-nothing verified owner receipt + audit trace. No direct log INSERT.
    // Candidate stays disabled until WS02 has source-backed owner mapping,
    // approved private RPC permissions, legal gating and integration E2E.
    const auditTrace = {
      individual: safeIndividual.trace,
      rules: results,
      amounts: fullReturnStatus === "CALCULATED" ? individual.values : null,
      engine_version: ENGINE_VERSION,
      input_hash: inputHash,
      rule_set_hash: ruleSetHash,
      result_status: fullReturnStatus,
      applied_rule_count: applied,
      needs_fact_count: needsFacts,
      blocked_rule_count: blocked,
      parameter_revision: scheduleRow?.revision_no ?? null,
      actor_user_id: authData.user.id,
      taxpayer_record_id: taxpayerRecordId,
      assessment_year: assessmentYear,
      income_year: year.income_year,
      authorized_request_hash: authorizedRequestHash,
      idempotency_key: body.idempotencyKey,
      receipt_hash: receiptHash,
      contract_version: CONTRACT_VERSION,
    };
    const auditTraceHash = await sha256(canonical(auditTrace));
    const { data: atomicCommit, error: atomicCommitError } = await supabase.rpc(
      "nbr_commit_evaluation_atomically", {
        p_auth_user_id: authData.user.id,
        p_taxpayer_record_id: taxpayerRecordId,
        p_assessment_year: assessmentYear,
        p_idempotency_key: body.idempotencyKey,
        p_request_hash: authorizedRequestHash,
        p_receipt_hash: receiptHash,
        p_trace_hash: auditTraceHash,
        p_result_state: fullReturnStatus,
        p_audit_trace: auditTrace,
      });
    if (atomicCommitError || atomicCommit !== true) {
      return json({ status:"FAIL_CLOSED", code:"AUDIT_ATOMIC_COMMIT_UNAVAILABLE",
        error:"Atomic, owner-bound receipt persistence was not confirmed" }, 503);
    }

    return json({
      ok: fullReturnStatus === "CALCULATED",
      code: fullReturnStatus === "CALCULATED" ? "CALCULATED" :
        individual.code ?? (fullReturnStatus === "NEEDS_FACTS" ? "FACTS_REQUIRED" : "LEGAL_OR_RULE_BLOCKED"),
      contractVersion: CONTRACT_VERSION,
      receiptHash,
      inputHash,
      engineVersion: ENGINE_VERSION,
      status: fullReturnStatus,
      submissionReady,
      assessmentYear,
      incomeYear: year.income_year,
      sourceRegistryVersion: year.source_registry_version,
      legalCutoff: year.legal_cutoff,
      ruleSetHash,
      parameterSetHash: await sha256(canonical({ assessmentYear,
        revision: scheduleRow.revision_no, data: scheduleRow.parameter_data,
        legalSource: scheduleRow.legal_source })),
      roundingPolicy: scheduleRow.parameter_data.rounding_policy,
      taxpayerRecordId,
      ruleCount: (rows ?? []).length,
      ruleSummary: {
        applied,
        needsFacts,
        blocked,
        relevantBlocked,
        historical,
        notApplicable,
        notTriggered,
        relevantNeedsFacts,
        unhandled,
        total: (rows ?? []).length,
        allRuleNodesEvaluated: results.length === (rows ?? []).length && unhandled === 0,
        submissionReady,
      },
      individual: safeIndividual,
      rules: results,
      parameterSet: scheduleRow ? {
        revision: scheduleRow.revision_no,
        legalSource: scheduleRow.legal_source,
      } : null,
    });
  } catch (error) {
    console.error(error);
    return json({ status:"FAIL_CLOSED", code:"EVALUATOR_EXCEPTION", error:"Evaluation refused; no tax amount is authorized" }, 503);
  }
});

