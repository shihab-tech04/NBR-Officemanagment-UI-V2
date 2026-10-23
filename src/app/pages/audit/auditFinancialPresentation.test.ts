import { describe, it, expect } from "vitest";
import { crossesBalanceSign, formatFinancialChange, fundFlowReconciliation } from "./auditFinancialPresentation";
describe("financial presentation invariants", () => {
  it("reconciles the historical illustrated fund-flow gap instead of fabricating a plug", () => {
    const source=3074468, shownGap=-737872, outflow=source-shownGap;
    expect(fundFlowReconciliation(source,outflow,shownGap)).toEqual({
      difference:-737872, verifiedWithinModel:true,
    });
    expect(fundFlowReconciliation(3074468,3644938,shownGap).verifiedWithinModel).toBe(false);
  });
  it("suppresses misleading percentages on both sign crossings", () => {
    expect(crossesBalanceSign(-737872,1588738)).toBe(true);
    expect(formatFinancialChange(-737872,1588738)).toBe("−৳2,326,610");
    expect(formatFinancialChange(500, -100)).toBe("+৳600");
    expect(formatFinancialChange(100, 0)).toBe("+৳100");
    expect(formatFinancialChange(110, 100)).toBe("+10%");
    expect(formatFinancialChange(80, 100)).toBe("−20%");
  });
  it("fails closed for invalid financial values", () => {
    expect(fundFlowReconciliation(NaN, 10, 10).verifiedWithinModel).toBe(false);
    expect(formatFinancialChange(NaN, 10)).toBe("—");
  });
});
