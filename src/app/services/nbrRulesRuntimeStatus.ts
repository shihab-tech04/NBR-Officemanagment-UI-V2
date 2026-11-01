/**
 * Read-only authoritative runtime fingerprint shared by NBR Office and Citizen.
 * This endpoint is a SQL revision/binding health observation, NOT a signed
 * legal approval and never grants permission to calculate, file or publish.
 * Keep this module identical in both products.
 */
export const NBR_RUNTIME_STATUS_URL =
  "https://gtorruuhvohafapctxym.supabase.co/functions/v1/nbr-tax-engine/status";

export interface NbrRulesRuntimeObservation {
  readonly engineVersion: string;
  readonly activeYear: string;
  readonly incomeYear: string;
  readonly ruleCount: number;
  readonly runtimeBindingCount: number;
  readonly missingRuntimeBindingCount: number;
  readonly unhandledRuleCount: number;
  readonly allRuleNodesMapped: boolean;
  readonly sourceRegistryVersion: string;
  readonly syncFingerprint: string;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validYear(year: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(year);
  return Boolean(match && Number(match[2]) === (Number(match[1]) + 1) % 100);
}

export async function readNbrRulesRuntimeStatus(
  fetcher: typeof fetch = fetch
): Promise<NbrRulesRuntimeObservation> {
  const response = await fetcher(NBR_RUNTIME_STATUS_URL, {
    method: "GET", cache: "no-store", headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("NBR_RUNTIME_UNAVAILABLE");
  const body: unknown = await response.json();
  if (!object(body) || body.ok !== true ||
    typeof body.engineVersion !== "string" || !body.engineVersion ||
    typeof body.activeYear !== "string" || !validYear(body.activeYear) ||
    typeof body.incomeYear !== "string" || !validYear(body.incomeYear) ||
    Number(body.incomeYear.slice(0, 4)) + 1 !== Number(body.activeYear.slice(0, 4)) ||
    !Number.isSafeInteger(body.ruleCount) || Number(body.ruleCount) < 1 ||
    !Number.isSafeInteger(body.runtimeBindingCount) ||
    !Number.isSafeInteger(body.unhandledRuleCount) ||
    !Number.isSafeInteger(body.missingRuntimeBindingCount) ||
    Number(body.runtimeBindingCount) < 0 ||
    Number(body.unhandledRuleCount) < 0 ||
    Number(body.missingRuntimeBindingCount) < 0 ||
    typeof body.allRuleNodesMapped !== "boolean" ||
    typeof body.sourceRegistryVersion !== "string" || !body.sourceRegistryVersion ||
    typeof body.syncFingerprint !== "string" ||
    !/^[0-9a-f]{64}$/.test(body.syncFingerprint)) {
    throw new Error("NBR_RUNTIME_CONTRACT_MISMATCH");
  }
  return {
    engineVersion: body.engineVersion,
    activeYear: body.activeYear,
    incomeYear: body.incomeYear,
    ruleCount: body.ruleCount as number,
    runtimeBindingCount: body.runtimeBindingCount as number,
    missingRuntimeBindingCount: body.missingRuntimeBindingCount as number,
    unhandledRuleCount: body.unhandledRuleCount as number,
    allRuleNodesMapped: body.allRuleNodesMapped,
    sourceRegistryVersion: body.sourceRegistryVersion,
    syncFingerprint: body.syncFingerprint,
  };
}

/**
 * A fingerprint MATCH means the same SQL identity/bindings were observed.
 * It never means the rules are legal, complete or executable for the user.
 */
export function classifyNbrRuntimeIdentity(
  observation: NbrRulesRuntimeObservation,
  expectedAssessmentYear: string,
  expectedIncomeYear: string
): "matched" | "mismatch" {
  return observation.activeYear === expectedAssessmentYear &&
    observation.incomeYear === expectedIncomeYear &&
    observation.ruleCount === 366 &&
    observation.runtimeBindingCount === 366 &&
    observation.unhandledRuleCount === 0 &&
    observation.missingRuntimeBindingCount === 0 &&
    observation.allRuleNodesMapped === true &&
    observation.sourceRegistryVersion === "FINAL_2026_09_30"
    ? "matched" : "mismatch";
}
