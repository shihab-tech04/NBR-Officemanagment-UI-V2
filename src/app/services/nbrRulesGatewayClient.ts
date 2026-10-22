import { createClient } from "@supabase/supabase-js";

export const NBR_RULES_PROJECT_URL = "https://gtorruuhvohafapctxym.supabase.co";
export const NBR_RULES_GATEWAY_BASE = NBR_RULES_PROJECT_URL + "/functions/v1/nbr-rules-office-gateway";
// Supabase publishable (public) key only. Never place service-role credentials in browser assets.
export const nbrRulesAuth = createClient(NBR_RULES_PROJECT_URL, "sb_publishable_ZwFis7EMwMNdqZNsTi5CKA_8Rs0JNgP", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

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

/** The gateway forwards bearer identity to the original permission-checking Rules API. */
export async function openRuleAdminSession(accessToken: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (!accessToken || accessToken.length < 20) throw new Error("Verified Supabase identity is required");
  const response = await fetcher(NBR_RULES_GATEWAY_BASE + "/session/auto", {
    method: "POST", cache: "no-store", headers: {
      authorization: "Bearer " + accessToken, accept: "application/json",
    },
  });
  if (!response.ok) throw new Error("Rules authorization denied (" + response.status + ")");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("token" in data) || typeof data.token !== "string" || data.token.length < 24) {
    throw new Error("Invalid protected Rules session");
  }
  return data.token;
}
