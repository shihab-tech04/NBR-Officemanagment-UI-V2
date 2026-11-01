/**
 * NBR SQL is the source of truth for tax-year identity. A stored executable
 * flag describes legacy SQL state; it is NOT independent legal certification.
 * Office rule-library rows remain a recorded snapshot until the protected
 * two-factor administrator session, read-back and approval are verified.
 */
export const NBR_RULES_PROJECT_URL = "https://gtorruuhvohafapctxym.supabase.co";
export const NBR_RULES_GATEWAY_BASE = NBR_RULES_PROJECT_URL + "/functions/v1/nbr-rules-office-gateway";
export interface PublicRuleYear {
  assessmentYear: string;
  incomeYear: string;
  state: string;
  executable: boolean;
}

function matchesYearPeriod(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return !!match && Number(match[2]) === (Number(match[1]) + 1) % 100;
}

export async function readPublicRuleYears(fetcher: typeof fetch = fetch): Promise<PublicRuleYear[]> {
  const response = await fetcher(NBR_RULES_GATEWAY_BASE + "/public/years", {
    method: "GET",
    headers: { accept: "application/json" }, cache: "no-store",
  });
  if (!response.ok) throw new Error("NBR_RULES_SQL_UNAVAILABLE");
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("years" in payload) ||
      !Array.isArray(payload.years) || payload.years.length === 0) {
    throw new Error("NBR_RULES_SQL_CONTRACT_MISMATCH");
  }
  const seen = new Set<string>();
  const result: PublicRuleYear[] = [];
  for (const item of payload.years as unknown[]) {
    if (!item || typeof item !== "object") throw new Error("NBR_RULES_SQL_CONTRACT_MISMATCH");
    const y = item as Record<string, unknown>;
    if (typeof y.assessmentYear !== "string" || !matchesYearPeriod(y.assessmentYear) ||
        typeof y.incomeYear !== "string" || !matchesYearPeriod(y.incomeYear) ||
        typeof y.state !== "string" || !y.state ||
        typeof y.executable !== "boolean" || seen.has(y.assessmentYear) ||
        Number(y.incomeYear.slice(0, 4)) !== Number(y.assessmentYear.slice(0, 4)) - 1) {
      throw new Error("NBR_RULES_SQL_CONTRACT_MISMATCH");
    }
    seen.add(y.assessmentYear);
    result.push({
      assessmentYear: y.assessmentYear,
      incomeYear: y.incomeYear,
      state: y.state,
      executable: y.executable,
    });
  }
  return result;
}
