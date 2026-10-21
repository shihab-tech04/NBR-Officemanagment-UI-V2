import { describe, expect, it } from "vitest";
import {
  compareSnapshotIdentities,
  snapshotComparisonAvailable,
  snapshotCoverageReason,
} from "../ruleYearComparison";

describe("controlled assessment-year identity comparison", () => {
  it("compares the recorded 366 identities only when both inventories exist", () => {
    expect(snapshotComparisonAvailable("2026-27", "2027-28")).toBe(true);
    const rows = compareSnapshotIdentities("2026-27", "2027-28");
    expect(rows).toHaveLength(366);
    expect(new Set(rows.map((row) => row.id)).size).toBe(366);
    expect(rows.every((row) => row.status === "INHERITED_PENDING_REVIEW")).toBe(true);
  });

  it("does not manufacture historical rules from current-year canonical identities", () => {
    for (const year of ["2023-24", "2024-25", "2025-26"]) {
      expect(compareSnapshotIdentities(year, "2026-27")).toEqual([]);
    }
    expect(snapshotCoverageReason("2025-26", "2026-27")).toMatch(/incomplete historical/);
  });

  it("does not treat a year compared with itself as a legal change", () => {
    expect(compareSnapshotIdentities("2026-27", "2026-27")).toEqual([]);
    expect(snapshotCoverageReason("2026-27", "2026-27")).toMatch(/different/);
  });

  it("supports existing administrative group and source/ID filters without changing the registry", () => {
    expect(compareSnapshotIdentities("2026-27", "2027-28", "corporate-business")).toHaveLength(58);
    const selected = compareSnapshotIdentities("2026-27", "2027-28", "", "ACK-1695-001");
    expect(selected).toHaveLength(1);
    expect(selected[0].id).toBe("ACK-1695-001");
    expect(selected[0].legalSources).toContain("Income Tax Act s169(5)");
  });
});
