import { describe, expect, it } from "vitest";
import { canPublishOrExecuteRule, isCertifiedForEngineExecution, SQL_RULE_GROUPS, TAX_YEAR_SNAPSHOT } from "../rulesEngineSnapshot";
import catalog from "../rulesSqlSnapshot.json";

describe("NBR Rules Engine read-only legal gates", () => {
  it("retains 366 classified identities", () => {
    expect(SQL_RULE_GROUPS.reduce((sum, group) => sum + group.count, 0)).toBe(366);
    expect(catalog.expected_total).toBe(366);
    expect(catalog.rules).toHaveLength(366);
    expect(new Set(catalog.rules.map((rule) => rule.id)).size).toBe(366);
  });
  it("keeps cloned 2027–28 year and all inherited rules pending review", () => {
    const next = TAX_YEAR_SNAPSHOT.find((year) => year.assessmentYear === "2027-28");
    expect(next?.ruleVersions).toBe(366);
    expect(next?.inheritedPending).toBe(366);
    expect(next?.executableFlag).toBe(false);
    expect(next?.gates.approval).toBe("BLOCKED");
  });
  it("never promotes SQL active/PASS labels into independent legal certification", () => {
    for (const year of TAX_YEAR_SNAPSHOT) {
      expect(isCertifiedForEngineExecution(year)).toBe(false);
      expect(canPublishOrExecuteRule(year)).toBe(false);
      expect(canPublishOrExecuteRule(year, "EXECUTABLE_CURRENT")).toBe(false);
    }
  });
  it("preserves distinct assessment and income periods", () => {
    expect(TAX_YEAR_SNAPSHOT.map(y => y.assessmentYear)).toEqual(["2024-25", "2025-26", "2026-27", "2027-28"]);
    expect(TAX_YEAR_SNAPSHOT[2].incomeYear).toBe("2025-26");
    expect(TAX_YEAR_SNAPSHOT[3].incomeYear).toBe("2026-27");
  });
});
