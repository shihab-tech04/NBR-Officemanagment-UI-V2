// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { makeAuditDemoBatch } from "./auditDemoSql";
import { getNextLocalAuditStatuses } from "./auditCandidateStore";

const meta = {
  assessmentYear: "2025-26", zone: "Synthetic zone", track: "Manual Selection",
  selectionBasis: "Manual dummy data", funnelRule: "Fixed 2",
  populationConsidered: 2, eligibleAfterReadiness: 2,
  matchedCriteria: 2, afterPreview: 2, finalCandidates: 2,
};

describe("Shared synthetic Audit data contract", () => {
  it("creates distinct candidate identities and preserves the selected dummy year", () => {
    const rows = makeAuditDemoBatch([
      { return_id: "RET-2026-80001", taxpayer_name: "Demo One", circle: "Circle-1" },
      { return_id: "RET-2026-80002", taxpayer_name: "Demo Two", circle: "Circle-2" },
    ], meta);
    expect(rows).toHaveLength(2);
    expect(rows[0].batch_id).toEqual(rows[1].batch_id);
    expect(new Set(rows.map((row) => row.candidate_id)).size).toBe(2);
    expect(rows.every((row) => row.audit_status === "Not Started" &&
      row.assessment_year === "2025-26" && row.candidate_status === "Selected")).toBe(true);
  });

  it("rejects empty selections, duplicate dummy returns and non-demo identifiers", () => {
    expect(() => makeAuditDemoBatch([], meta)).toThrow(/at least one/);
    expect(() => makeAuditDemoBatch([
      { return_id: "RET-2026-80001" },
      { return_id: "RET-2026-80001" },
    ], meta)).toThrow(/unique dummy/);
    expect(() => makeAuditDemoBatch([{ return_id: "REAL-UNKNOWN" }], meta))
      .toThrow(/unique dummy/);
  });

  it("uses the same reviewed rework transitions as the demo SQL validation", () => {
    expect(getNextLocalAuditStatuses("Second Review")).toContain("Rework Requested");
    expect(getNextLocalAuditStatuses("Rework Requested")).toContain("Verifying");
    expect(getNextLocalAuditStatuses("Closed")).toEqual([]);
  });
});
