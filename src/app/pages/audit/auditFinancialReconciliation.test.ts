import { describe, expect, it } from "vitest";
import { buildComparison } from "./AuditCandidatesPage";
import { getAuditCandidates } from "./auditCandidateStore";
import { ALL_TAXPAYER_ROWS } from "./auditData";

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
  it("uses one set of current-year financial inputs for all source-backed candidates", () => {
    for (const candidate of getAuditCandidates()) {
      const source = ALL_TAXPAYER_ROWS.find((row) =>
        row.return_id === candidate.return_id && row.assessment_year === candidate.assessment_year);
      if (!source || source.data_quality !== "Complete") continue;
      const facts = JSON.parse(String(source.financial_inputs)) as {
        income:number; payableTax:number; tds:number; assets:number;
        openingWealth:number; expenditure:number; otherReceipts:number;
        liabilitiesChange:number;
      };
      const sections = buildComparison(candidate);
      const current = (key:string) => sections.flatMap((section) => section.metrics)
        .find((item) => item.key === key)?.values[2];
      expect(current("totalIncome"), candidate.return_id).toBe(facts.income);
      expect(current("taxPayable"), candidate.return_id).toBe(facts.payableTax);
      expect(current("tds"), candidate.return_id).toBe(facts.tds);
      expect(current("netWealth"), candidate.return_id).toBe(facts.assets);
      expect(current("lifestyleExpense"), candidate.return_id).toBe(facts.expenditure);
      expect(current("sourceOfFund"), candidate.return_id)
        .toBe(facts.openingWealth + facts.income + facts.otherReceipts);
      expect(current("fundOutflow"), candidate.return_id)
        .toBe(facts.assets + facts.expenditure + facts.liabilitiesChange);
    }
  });

  it("Rahman signed fund gap is calculated from the actual signal inputs", () => {
    const rahman = getAuditCandidates().find((candidate) => candidate.taxpayer_name === "Rahman Enterprise")!;
    const source = ALL_TAXPAYER_ROWS.find((row) => row.return_id === rahman.return_id)!;
    const f = JSON.parse(String(source.financial_inputs));
    const m = buildComparison(rahman).find((section) => section.key === "wealth")!.metrics;
    const current = (key:string) => m.find((metric) => metric.key === key)!.values[2];
    expect(current("sourceOfFund")).toBe(f.openingWealth + f.income + f.otherReceipts);
    expect(current("fundOutflow")).toBe(f.assets + f.expenditure + f.liabilitiesChange);
    expect(current("difference")).toBe(-Number(source.mismatch_amount));
  });
});
