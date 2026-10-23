import { describe, expect, it } from "vitest";
import { buildComparison } from "./AuditCandidatesPage";
import { getAuditCandidates } from "./auditCandidateStore";

describe("three-year illustrative financial model", () => {
  it("balances sources, outflow and signed difference for every seeded candidate and year", () => {
    for (const candidate of getAuditCandidates()) {
      const sections = buildComparison(candidate);
      const wealth = sections.find((x) => x.key === "wealth");
      expect(wealth, candidate.candidate_id).toBeDefined();
      const metric = (key: string) => wealth!.metrics.find((m) => m.key === key)?.values;
      const source = metric("sourceOfFund")!;
      const outflow = metric("fundOutflow")!;
      const diff = metric("difference")!;
      expect(source).toHaveLength(3);
      expect(outflow).toHaveLength(3);
      expect(diff).toHaveLength(3);
      for (let year=0; year<3; year++) {
        expect(source[year] - outflow[year], candidate.candidate_id + " year " + year).toBe(diff[year]);
      }
    }
  });
  it("Rahman illustration's specific source gap is explainable by exact outflow, not a plugged balance", () => {
    const rahman = getAuditCandidates().find((c) => c.taxpayer_name === "Rahman Enterprise");
    expect(rahman).toBeDefined();
    const m = buildComparison(rahman!).find((x) => x.key === "wealth")!.metrics;
    const val = (key: string) => m.find((x) => x.key === key)!.values[2];
    expect(val("sourceOfFund")).toBe(3074468);
    expect(val("fundOutflow")).toBe(3812340);
    expect(val("difference")).toBe(-737872);
  });
});
