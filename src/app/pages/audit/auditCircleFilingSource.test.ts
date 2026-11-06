import { describe, expect, it } from "vitest";
import { CIRCLE_FILING_RECORDS, circleFilingYear, getCircleFilingRows } from "./auditCircleFilingSource";

describe("Circle-level filing and TIN compilation", () => {
  it("preserves all Circle-year records without converting them into taxpayer returns", () => {
    expect(CIRCLE_FILING_RECORDS).toHaveLength(2114);
    expect(circleFilingYear("2025-26")).toBe("2025-2026");
    expect(circleFilingYear("2024-25")).toBe("2024-2025");
    expect(getCircleFilingRows("2023-24")).toHaveLength(0);
    for (const year of ["2024-25", "2025-26"]) {
      const rows = getCircleFilingRows(year);
      expect(rows).toHaveLength(1057);
      expect(new Set(rows.map(row => row.zone))).toHaveProperty("size", 49);
      expect(new Set(rows.map(row => row.zone + "|" + row.circle))).toHaveProperty("size", 1057);
      expect(rows.reduce((sum, row) => sum + row.tinCount, 0)).toBe(13501536);
    }
  });

  it("agrees with the source's reported return totals and missing-score handling", () => {
    const year2025 = getCircleFilingRows("2025-26");
    const year2024 = getCircleFilingRows("2024-25");
    expect(year2025.reduce((sum, row) => sum + row.reportedReturns, 0)).toBe(4984983);
    expect(year2024.reduce((sum, row) => sum + row.reportedReturns, 0)).toBe(4365334);
    expect(year2025.filter(row => row.provisionalScore === null)).toHaveLength(6);
    expect(year2024.filter(row => row.provisionalScore === null)).toHaveLength(20);
    expect(year2025.filter(row => row.review === "Priority review")).toHaveLength(67);
  });

  it("preserves exact Circle values, provisional score and visual-only payment flag", () => {
    const row = getCircleFilingRows("2025-26").find(row =>
      row.zone === "16, Dhaka" && row.circle === "Circle-331 (Company)");
    expect(row).toMatchObject({
      tinCount: 2404, reportedReturns: 639, reportedPayment: 809661593,
      review: "Low filing coverage", sourceFlag: "High paid outlier",
      provisionalScore: 4, incompleteChannels: false,
    });
  });
});
