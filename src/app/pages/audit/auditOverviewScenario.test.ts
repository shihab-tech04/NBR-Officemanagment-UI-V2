import { describe, expect, it } from "vitest";
import { ALL_TAXPAYER_ROWS } from "./auditData";
import { getAuditCandidates } from "./auditCandidateStore";
import { scenarioGroupCounts, scenarioSum, scenarioWeights } from "./auditOverviewScenario";

const populationKey = (row: { return_id?: unknown }) => String(row.return_id ?? "");
const candidateKey = (row: { candidate_id?: unknown }) => String(row.candidate_id ?? "");
const modelTotal = 4_000_000;
const selectionsTotal = 72_341;

describe("Audit Overview — illustrative, reproducible model", () => {
  it("uses unique, stable, integer, order-independent weights summing to the exact scenario size", () => {
    const weight = scenarioWeights(ALL_TAXPAYER_ROWS, modelTotal, populationKey);
    const reversed = scenarioWeights([...ALL_TAXPAYER_ROWS].reverse(), modelTotal, populationKey);
    expect(weight.size).toBe(ALL_TAXPAYER_ROWS.length);
    expect([...weight.entries()].sort()).toEqual([...reversed.entries()].sort());
    expect(scenarioSum(ALL_TAXPAYER_ROWS, weight, populationKey)).toBe(modelTotal);
    expect(new Set([...weight.values()]).size).toBeGreaterThan(ALL_TAXPAYER_ROWS.length * 0.75);
    expect([...weight.values()].every((v) => Number.isInteger(v) && v > 0)).toBe(true);
  });

  it.each(["risk_level", "coverage_tier", "data_quality", "circle", "audit_state", "assessment_year", "return_version", "control_flags"])(
    "reconciles the %s lens with exactly the same population",
    (field) => {
      const weight = scenarioWeights(ALL_TAXPAYER_ROWS, modelTotal, populationKey);
      const groups = scenarioGroupCounts(ALL_TAXPAYER_ROWS, weight, populationKey, (r) =>
        [String(r[field] ?? "—")],
      );
      const total = [...groups.values()].reduce((n, value) => n + value, 0);
      expect(total).toBe(modelTotal);
      expect(groups.size).toBeGreaterThan(0);
    },
  );

  it("counts multiple signals once per return while allowing overlap among signal families", () => {
    const weight = scenarioWeights(ALL_TAXPAYER_ROWS, modelTotal, populationKey);
    const signals = (row: { signals?: unknown }) => String(row.signals ?? "").match(/R-[A-Z]\d+/g) ?? [];
    const group = scenarioGroupCounts(ALL_TAXPAYER_ROWS, weight, populationKey, signals);
    expect(group.size).toBeGreaterThan(10);
    for (const [signal, total] of group) {
      expect(signal).toMatch(/^R-[A-Z]\d+$/);
      expect(total).toBeGreaterThan(0);
      expect(total).toBeLessThanOrEqual(modelTotal);
    }
    const selected = ALL_TAXPAYER_ROWS.filter((r) => signals(r).includes("R-C1"));
    expect(group.get("R-C1")).toBe(scenarioSum(selected, weight, populationKey));
  });

  it("retains the same weighted denominator after filtering by an independent attribute", () => {
    const weight = scenarioWeights(ALL_TAXPAYER_ROWS, modelTotal, populationKey);
    const selected = ALL_TAXPAYER_ROWS.filter((r) => r.data_quality === "Complete");
    const expected = scenarioSum(selected, weight, populationKey);
    const risk = scenarioGroupCounts(selected, weight, populationKey, (r) => [String(r.risk_level)]);
    expect([...risk.values()].reduce((a, b) => a + b, 0)).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(modelTotal);
    expect(selected.filter((r) => r.risk_level === "Not determined")).toHaveLength(0);
  });

  it("reconciles source tracks, dates and Circle selection totals to one weighted cohort", () => {
    const candidates = getAuditCandidates();
    const weight = scenarioWeights(candidates, selectionsTotal, candidateKey);
    const all = scenarioSum(candidates, weight, candidateKey);
    const byTrack = scenarioGroupCounts(candidates, weight, candidateKey, (r) => [String(r.selection_track)]);
    const byDay = scenarioGroupCounts(candidates, weight, candidateKey, (r) => [String(r.selected_on)]);
    const byCircle = scenarioGroupCounts(candidates, weight, candidateKey, (r) => [String(r.circle)]);
    expect(all).toBe(selectionsTotal);
    for (const groups of [byTrack, byDay, byCircle]) {
      expect([...groups.values()].reduce((a, b) => a + b, 0)).toBe(all);
    }
    expect(byCircle.size).toBeGreaterThan(1);
  });

  it("fails closed for duplicate fixture keys or invalid scenario targets", () => {
    expect(() => scenarioWeights([{ id: "A" }, { id: "A" }], 100, (r) => r.id)).toThrow(/unique/);
    expect(() => scenarioWeights([{ id: "A" }], -1, (r) => r.id)).toThrow(/target/);
    expect(scenarioWeights([], 0, () => "")).toEqual(new Map());
  });
});
