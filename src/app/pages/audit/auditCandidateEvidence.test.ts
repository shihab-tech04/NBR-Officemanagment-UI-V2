import { describe, expect, it } from "vitest";
import { reconcileGeneratedFundFlow } from "./auditCandidateEvidence";

describe("audit profile evidence illustration funds-flow integrity", () => {
  const sources = [1_000_000, 1_500_000, 2_000_000];
  const outflow = [900_000, 1_600_000, 2_100_000];

  for (const ids of [[], ["R-C1"], ["R-C2"], ["R-C1", "R-C2"]]) {
    it(`balances every year with signals ${ids.join(", ") || "none"}`, () => {
      const result = reconcileGeneratedFundFlow(sources, outflow, ids);
      expect(result.sourceOfFund).toEqual(sources);
      for (let year = 0; year < 3; year++) {
        expect(result.sourceOfFund[year] - result.fundOutflow[year])
          .toBe(result.difference[year]);
      }
      expect(sources).toEqual([1_000_000, 1_500_000, 2_000_000]);
      expect(outflow).toEqual([900_000, 1_600_000, 2_100_000]);
    });
  }

  it("preserves the existing visual illustration's signed differences", () => {
    expect(reconcileGeneratedFundFlow(sources, outflow, ["R-C1"]).difference)
      .toEqual([100_000, -100_000, -480_000]);
    expect(reconcileGeneratedFundFlow(sources, outflow, ["R-C2"]).difference)
      .toEqual([-80_000, -210_000, -400_000]);
    expect(reconcileGeneratedFundFlow(sources, outflow, ["R-C1", "R-C2"]).difference)
      .toEqual([-80_000, -210_000, -400_000]);
  });

  it("does not infer zero, silently accept non-numeric data, or mix years", () => {
    expect(() => reconcileGeneratedFundFlow([1, 2], [1, 2, 3], ["R-C1"]))
      .toThrow("Three complete numeric years");
    expect(() => reconcileGeneratedFundFlow([1, NaN, 3], [1, 2, 3], ["R-C2"]))
      .toThrow("Three complete numeric years");
    expect(() => reconcileGeneratedFundFlow([1, 2, 3], [1, Infinity, 3], []))
      .toThrow("Three complete numeric years");
  });
});
