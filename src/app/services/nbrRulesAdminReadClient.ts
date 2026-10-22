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

/** Exact server-owned current version, not independently approved law. */
export interface SqlRuleDetail {
  year: {
    id: string; assessment_year: string; income_year: string;
    state: string; coverage: string; source_registry_version: string | null;
    is_executable: boolean; legal_cutoff: string | null;
  };
  version: {
    id: string; tax_year_id: string; rule_key: string; revision_no: number;
    is_current: boolean; group_id: string; year_applicability_status: string;
    execution_status: string | null; rule_data: Record<string, unknown>;
    source_assessment_year: string | null; change_reason: string | null;
    supersedes_version_id: string | null; created_at: string;
  };
  identity: Record<string, unknown> | null;
  changes: Record<string, unknown>[];
  audit: Record<string, unknown>[];
}
export interface SqlRuleGroup {
  id: string; nameEn: string; nameBn: string; isLegalClassification: boolean;
  total: number; review: number; blocked: number; executable: number;
}
export interface SqlGate {
  id: string; gate_code: string; gate_name: string; status: string;
  evidence_ref: string | null; evaluated_at: string | null;
}
export interface SqlSummary {
  year: string; total: number; executionCounts: Record<string, number>;
  yearStatusCounts: Record<string, number>; openChangeRequests: number;
}
export interface PagedSqlRules {
  year: { assessmentYear: string; state: string; coverage: string; executable: boolean };
  total: number;
  page: number;
  perPage: number;
  rules: SqlRuleRecord[];
}

/** Compare the complete returned JSON rule body and exact revision metadata, not only its ID/count. */
export function compareAuthenticatedRuleDetail(
  listed: SqlRuleRecord, detailed: SqlRuleDetail, assessmentYear: string,
): string[] {
  const errors: string[] = [];
  if (detailed.year.assessment_year !== assessmentYear) errors.push("assessment_year");
  if (listed.rule_id !== detailed.version.rule_key) errors.push("rule_key");
  if (listed._backend.versionId !== detailed.version.id) errors.push("versionId");
  if (listed._backend.revisionNo !== detailed.version.revision_no) errors.push("revisionNo");
  if (listed._backend.groupId !== detailed.version.group_id) errors.push("groupId");
  if (listed._backend.yearApplicabilityStatus !== detailed.version.year_applicability_status) errors.push("yearApplicabilityStatus");
  if (listed._backend.executionStatus !== detailed.version.execution_status) errors.push("executionStatus");
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(listed)) if (key !== "_backend") body[key] = value;
  const expectedKeys = Object.keys(body).sort();
  const actualKeys = Object.keys(detailed.version.rule_data).sort();
  if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) errors.push("ruleData.keys");
  for (const key of expectedKeys) {
    if (JSON.stringify(body[key]) !== JSON.stringify(detailed.version.rule_data[key]))
      errors.push("ruleData." + key);
  }
  return errors;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function createRulesAdminReadClient(config: RulesAdminApiConfig) {
  const root = config.baseUrl.replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+\//.test(root) || !root.endsWith("/nbr-rules-api")) {
    throw new Error("Rules API base must be an HTTPS nbr-rules-api endpoint.");
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

    async getGroups(assessmentYear: string): Promise<SqlRuleGroup[]> {
      if (!/^\d{4}-\d{2}$/.test(assessmentYear)) throw new Error("Invalid assessment-year identifier.");
      const payload = await get("/groups?year=" + encodeURIComponent(assessmentYear));
      if (payload.year !== assessmentYear || !Array.isArray(payload.groups) ||
          !payload.groups.every((g: unknown) => record(g) && typeof g.id === "string" &&
            typeof g.nameEn === "string" && typeof g.nameBn === "string" &&
            typeof g.isLegalClassification === "boolean" && typeof g.total === "number")) {
        throw new Error("Rules API groups schema or year mismatch.");
      }
      return payload.groups as SqlRuleGroup[];
    },

    async getSummary(assessmentYear: string): Promise<SqlSummary> {
      if (!/^\d{4}-\d{2}$/.test(assessmentYear)) throw new Error("Invalid assessment-year identifier.");
      const payload = await get("/summary?year=" + encodeURIComponent(assessmentYear));
      if (payload.year !== assessmentYear || typeof payload.total !== "number" ||
          !record(payload.executionCounts) || !record(payload.yearStatusCounts) ||
          typeof payload.openChangeRequests !== "number") throw new Error("Rules API summary schema or year mismatch.");
      return payload as unknown as SqlSummary;
    },

    async getGates(assessmentYear: string): Promise<SqlGate[]> {
      if (!/^\d{4}-\d{2}$/.test(assessmentYear)) throw new Error("Invalid assessment-year identifier.");
      const payload = await get("/gates?year=" + encodeURIComponent(assessmentYear));
      if (payload.year !== assessmentYear || !Array.isArray(payload.gates) ||
          !payload.gates.every((g: unknown) => record(g) &&
            typeof g.gate_code === "string" && typeof g.status === "string")) {
        throw new Error("Rules API gates schema or year mismatch.");
      }
      return payload.gates as SqlGate[];
    },

    /** Read every server page, rejecting non-stable totals and duplicate identity/version IDs. */
    async getAllRules(assessmentYear: string): Promise<SqlRuleRecord[]> {
      const first = await this.getRules(assessmentYear, 1, 100);
      if (!Number.isInteger(first.total) || first.total < 0 || first.total > 10000)
        throw new Error("Rules API invalid or excessive total.");
      const rows = [...first.rules];
      for (let page = 2; rows.length < first.total; page++) {
        const next = await this.getRules(assessmentYear, page, 100);
        if (next.total !== first.total || next.page !== page || next.perPage !== 100)
          throw new Error("Rules API changed during paged read.");
        if (!next.rules.length) throw new Error("Rules API incomplete paged read.");
        rows.push(...next.rules);
      }
      const ids = new Set<string>();
      const versions = new Set<string>();
      for (const row of rows) {
        if (!row.rule_id || ids.has(row.rule_id) || versions.has(row._backend.versionId))
          throw new Error("Rules API duplicate/missing rule identity or server version.");
        ids.add(row.rule_id); versions.add(row._backend.versionId);
      }
      if (rows.length !== first.total) throw new Error("Rules API record count mismatch.");
      return rows;
    },

    async getRule(assessmentYear: string, ruleKey: string): Promise<SqlRuleDetail> {
      if (!/^\d{4}-\d{2}$/.test(assessmentYear) || !ruleKey.trim()) {
        throw new Error("A valid year and canonical rule key are required.");
      }
      const payload = await get("/rules/" + encodeURIComponent(ruleKey) +
        "?year=" + encodeURIComponent(assessmentYear));
      if (!record(payload.year) || payload.year.assessment_year !== assessmentYear ||
          !record(payload.version) || payload.version.rule_key !== ruleKey ||
          typeof payload.version.id !== "string" ||
          typeof payload.version.revision_no !== "number" ||
          typeof payload.version.year_applicability_status !== "string" ||
          !record(payload.version.rule_data) ||
          payload.version.rule_data.rule_id !== ruleKey ||
          !(payload.identity === null || record(payload.identity)) ||
          !Array.isArray(payload.changes) || !Array.isArray(payload.audit)) {
        throw new Error("Rules API detail identity/version/year schema mismatch.");
      }
      return payload as unknown as SqlRuleDetail;
    },
  };
}
