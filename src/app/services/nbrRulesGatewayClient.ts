
export const NBR_RULES_PROJECT_URL = "https://gtorruuhvohafapctxym.supabase.co";
export const NBR_RULES_GATEWAY_BASE = NBR_RULES_PROJECT_URL + "/functions/v1/nbr-rules-office-gateway";
export interface PublicRuleYear {
  assessmentYear: string;
  incomeYear: string;
  state: string;
  executable: boolean;
}

export async function readPublicRuleYears(fetcher: typeof fetch = fetch): Promise<PublicRuleYear[]> {
  const response = await fetcher(NBR_RULES_GATEWAY_BASE + "/public/years", {
    headers: { accept: "application/json" }, cache: "no-store",
  });
  if (!response.ok) throw new Error("NBR_RULES_SQL_UNAVAILABLE");
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("years" in payload) ||
      !Array.isArray(payload.years) ||
      !payload.years.every((x: unknown) => x !== null && typeof x === "object" &&
        "assessmentYear" in x && typeof x.assessmentYear === "string" &&
        "incomeYear" in x && typeof x.incomeYear === "string" &&
        "state" in x && typeof x.state === "string" &&
        "executable" in x && typeof x.executable === "boolean")) {
    throw new Error("NBR_RULES_SQL_CONTRACT_MISMATCH");
  }
  return payload.years as PublicRuleYear[];
}

