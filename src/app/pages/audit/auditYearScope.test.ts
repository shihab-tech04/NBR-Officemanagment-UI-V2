// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getAuditCandidates } from "./auditCandidateStore";
import { getAuditYearScope, getAvailableAuditYears } from "./auditYearScope";
import { ALL_TAXPAYER_ROWS } from "./auditData";
import { AUDIT_SIGNAL_IDS, evaluateAuditReturn, type ReturnInputs } from "./auditReturnScreening";

describe("Office Audit AY consistency and stale-cache recovery", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("calculates 15 signals across 64 profiles and leaves 10 or more unaffected", () => {
    expect(ALL_TAXPAYER_ROWS).toHaveLength(64);
    const seen = new Set<string>();
    let unaffected = 0;
    for (const row of ALL_TAXPAYER_ROWS) {
      const result = evaluateAuditReturn(row.audit_input as ReturnInputs,
        String(row.coverage_tier), String(row.data_quality));
      expect(String(row.signals), String(row.id)).toBe(result.hits.map(h => h.id).join(" + ") || "—");
      expect(row.risk_level, String(row.id)).toBe(result.riskLevel);
      result.hits.forEach(hit => seen.add(hit.id));
      if (row.data_quality === "Complete" && result.hits.length === 0) unaffected += 1;
    }
    expect(AUDIT_SIGNAL_IDS.every(id => seen.has(id))).toBe(true);
    expect(unaffected).toBeGreaterThanOrEqual(10);
  });

  it("shows no values from another AY in the empty 2024-25 scope", () => {
    const scope = getAuditYearScope("2024-25", getAuditCandidates());
    expect(scope.population).toHaveLength(0);
    expect(scope.candidates).toHaveLength(0);
    expect(scope.riskCases).toHaveLength(0);
    expect(scope.controlRows).toHaveLength(0);
    expect(scope.secondReviewRows).toHaveLength(0);
    expect(scope.trailRows).toHaveLength(0);
  });

  it("recovers the real loaded sample year for KPIs, cases and candidate batches", () => {
    const candidates = getAuditCandidates();
    const scope = getAuditYearScope("2025-26", candidates);
    expect(scope.population.length).toBeGreaterThan(0);
    expect(scope.candidates.length).toBeGreaterThan(0);
    expect(scope.riskCases).toHaveLength(8);
    expect(scope.controlRows).toHaveLength(6);
    expect(scope.secondReviewRows).toHaveLength(3);
    expect(getAvailableAuditYears(candidates)).toContain("2025-26");
  });

  it("heals an empty v3 browser cache rather than permanently hiding the batches", () => {
    window.localStorage.setItem("nbr-audit-candidates-v3", "[]");
    const result = getAuditCandidates();
    expect(result.length).toBeGreaterThan(0);
    expect(JSON.parse(window.localStorage.getItem("nbr-audit-candidates-v3") ?? "[]")).toHaveLength(result.length);
  });

  it("preserves custom candidate records while restoring missing fixture IDs", () => {
    const example = getAuditCandidates()[0];
    const custom = { ...example, candidate_id: "custom-audit-candidate", batch_id: "custom-batch" };
    window.localStorage.setItem("nbr-audit-candidates-v3", JSON.stringify([custom]));
    const result = getAuditCandidates();
    expect(result.find((row) => row.candidate_id === custom.candidate_id)?.batch_id).toBe("custom-batch");
    expect(new Set(result.map((row) => row.candidate_id)).size).toBe(result.length);
    expect(result.length).toBeGreaterThan(1);
  });
});
