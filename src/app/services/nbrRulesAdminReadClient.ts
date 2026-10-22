/**
 * Exact read-only transport for deployed nbr-rules-api v15.
 *
 * This service is deliberately NOT automatically wired to the unauthenticated
 * Office prototype. Inject a verified bearer token and admin rule-session from
 * the eventual protected Office security layer. Never persist secrets here or
 * silently replace unavailable SQL data with the dated UI snapshot.
 */
export interface RulesAdminApiConfig {
  baseUrl: string;
  bearerToken: string;
  ruleSessionToken: string;
  fetcher?: typeof fetch;
}

export interface SqlYear {
  id: string;
  assessmentYear: string;
  incomeYear: string;
  state: string;
  coverage: string;
  ruleCount: number;
  executable: boolean;
  immutable: boolean;
  legalCutoff: string | null;
  registryVersion: string | null;
  lifecycleStage: string;
}

export interface SqlRuleRecord {
  rule_id: string;
  _backend: {
    versionId: string;
    revisionNo: number;
    yearApplicabilityStatus: string;
    executionStatus: string;
    groupId: string;
    sourceAssessmentYear?: string;
  };
  [key: string]: unknown;
}

export interface PagedSqlRules {
  year: { assessmentYear: string; state: string; coverage: string; executable: boolean };
  total: number;
  page: number;
  perPage: number;
  rules: SqlRuleRecord[];
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function createRulesAdminReadClient(config: RulesAdminApiConfig) {
  const root = config.baseUrl.replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+\//.test(root) || !(root.endsWith("/nbr-rules-api") || root.endsWith("/nbr-rules-office-gateway"))) {
    throw new Error("Rules API base must be a verified HTTPS nbr-rules-api or nbr-rules-office-gateway endpoint.");
  }
  if (!config.bearerToken.trim() || !config.ruleSessionToken.trim()) {
    throw new Error("A verified bearer identity and Rules Admin session are required.");
  }
  const fetcher = config.fetcher ?? fetch;

  async function get(path: string): Promise<Record<string, unknown>> {
    const response = await fetcher(root + path, {
      method: "GET",
      headers: {
        authorization: "Bearer " + config.bearerToken,
        "x-nbr-rule-session": config.ruleSessionToken,
        accept: "application/json",
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Rules API read failed (" + response.status + ").");
    const payload: unknown = await response.json();
    if (!record(payload)) throw new Error("Invalid Rules API response.");
    return payload;
  }

  return {
    async getYears(): Promise<SqlYear[]> {
      const payload = await get("/years");
      if (!Array.isArray(payload.years) ||
          !payload.years.every((item: unknown) =>
            record(item) && typeof item.assessmentYear === "string" &&
            typeof item.incomeYear === "string" && typeof item.ruleCount === "number")) {
        throw new Error("Rules API year schema mismatch.");
      }
      return payload.years as SqlYear[];
    },

    async getRules(assessmentYear: string, page = 1, perPage = 25): Promise<PagedSqlRules> {
      if (!/^\d{4}-\d{2}$/.test(assessmentYear)) throw new Error("Invalid assessment-year identifier.");
      if (!Number.isInteger(page) || page < 1 ||
          !Number.isInteger(perPage) || perPage < 10 || perPage > 100) {
        throw new Error("Invalid Rules API pagination.");
      }
      const query = new URLSearchParams({
        year: assessmentYear, page: String(page), perPage: String(perPage),
      });
      const payload = await get("/rules?" + query.toString());
      if (!Array.isArray(payload.rules) || typeof payload.total !== "number" ||
          !record(payload.year) || payload.year.assessmentYear !== assessmentYear ||
          !payload.rules.every((item: unknown) =>
            record(item) && typeof item.rule_id === "string" && record(item._backend) &&
            typeof item._backend.versionId === "string" && typeof item._backend.revisionNo === "number")) {
        throw new Error("Rules API rule schema or requested-year mismatch.");
      }
      return payload as unknown as PagedSqlRules;
    },

    async getRule(assessmentYear: string, ruleKey: string): Promise<Record<string, unknown>> {
      if (!/^\d{4}-\d{2}$/.test(assessmentYear) || !ruleKey.trim()) {
        throw new Error("A valid year and canonical rule key are required.");
      }
      const payload = await get("/rules/" + encodeURIComponent(ruleKey) +
        "?year=" + encodeURIComponent(assessmentYear));
      if (!record(payload.year) || !record(payload.version) ||
          !record(payload.identity) || !Array.isArray(payload.changes) ||
          !Array.isArray(payload.audit)) throw new Error("Rules API detail schema mismatch.");
      return payload;
    },
  };
}
