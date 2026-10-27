import { describe, expect, it } from "vitest";
import { candidateInputs, mapSqlAuditCandidate } from "./auditSharedSql";

const source = {
  return_id: "RET-TEST-01", tin: "123456789012", taxpayer_name: "Synthetic Test",
  assessment_year: "2025-26", zone: "Zone-1", circle: "Circle-1",
  coverage_tier: "DT3", risk_level: "High", signals: "R-C1, R-E2",
  data_quality: "Complete",
};
const batch = {
  external_batch_id: "AUD-TEST", selection_track: "Manual Selection",
  selection_basis: "Synthetic checks", funnel_rule: "Fixed one",
  source_kind: "synthetic", created_at: "2026-10-27T00:00:00Z",
};

describe("Office Audit authenticated SQL record contract", () => {
  it("maps authorized SQL candidate and its exact parent batch without generating a finding", () => {
    const row = mapSqlAuditCandidate({
      id: "a", batch_id: "b", ...source,
      audit_status: "Not Started", version: 1,
      signals: ["R-C1", "R-E2"], office_audit_batches: batch,
    });
    expect(row.batch_id).toBe("AUD-TEST");
    expect(row.candidate_id).toBe("a");
    expect(row.assessment_year).toBe("2025-26");
    expect(row.signals).toBe("R-C1, R-E2");
    expect(row.audit_status).toBe("Not Started");
  });

  it("refuses unknown source kinds and absent source identity", () => {
    const value = {
      id: "a", batch_id: "b", ...source, signals: ["R-C1"],
      audit_status: "Not Started", version: 1, office_audit_batches: batch,
    };
    expect(() => mapSqlAuditCandidate({
      ...value, office_audit_batches: {...batch, source_kind:"verified"},
    })).toThrow("not been certified");
    expect(() => mapSqlAuditCandidate({...value, return_id:""}))
      .toThrow("Missing canonical candidate identity");
  });

  it("rejects cross-year, cross-zone, duplicate, missing-identity and empty batches", () => {
    expect(candidateInputs([source], "2025-26", "Zone-1")).toEqual([{
      return_id:"RET-TEST-01", tin:"123456789012", taxpayer_name:"Synthetic Test",
      circle:"Circle-1", coverage_tier:"DT3", risk_level:"High",
      signals:["R-C1", "R-E2"], data_quality:"Complete",
    }]);
    expect(() => candidateInputs([source], "2024-25", "Zone-1")).toThrow();
    expect(() => candidateInputs([source], "2025-26", "Zone-2")).toThrow();
    expect(() => candidateInputs([source, source], "2025-26", "Zone-1")).toThrow("Duplicate");
    expect(() => candidateInputs([], "2025-26", "Zone-1")).toThrow();
    expect(() => candidateInputs([source], "2025-26", "All Zones")).toThrow();
    expect(() => candidateInputs([{...source, tin:""}], "2025-26", "Zone-1")).toThrow();
  });
});
