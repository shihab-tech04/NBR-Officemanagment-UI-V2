import { describe, expect, it } from "vitest";
import { getAuditSignalDefinition } from "./auditKnowledge";

const ids = [
  "R-A1", "R-A2", "R-A3",
  "R-B1", "R-B2",
  "R-C1", "R-C2", "R-C3", "R-C4",
  "R-D1", "R-D2", "R-D3",
  "R-E1", "R-E2", "R-E3",
];

describe("source-backed audit signal flow definitions", () => {
  it("covers every named A-E signal without guessing new rules", () => {
    expect(ids).toHaveLength(15);
    for (const id of ids) {
      const s = getAuditSignalDefinition(id, "en");
      expect(s?.id).toBe(id);
      expect(s?.condition.length).toBeGreaterThan(15);
      expect(s?.requires).toBeTruthy();
      expect(s?.evidence).toBeTruthy();
      expect(s?.legitimate).toBeTruthy();
    }
    expect(getAuditSignalDefinition("R-Z99", "en")).toBeNull();
    expect(getAuditSignalDefinition("F0", "en")).toBeNull();
  });

  it("keeps source R-C1 distinct from the separate Sources-minus-Outflow metric", () => {
    const c1 = getAuditSignalDefinition("R-C1", "en")!;
    expect(c1.condition).toMatch(/independently declared assets/);
    expect(c1.condition).toMatch(/funds-flow closing wealth/);
    expect(c1.requires).toContain("DT1");
    expect(c1.condition).not.toMatch(/24%|50%|risk score/);
  });

  it("localizes conditions and evidence without changing rule identity", () => {
    const en = getAuditSignalDefinition("R-C1", "en")!;
    const bn = getAuditSignalDefinition("R-C1", "bn-BD")!;
    expect(bn.id).toBe(en.id);
    expect(bn.condition).not.toBe(en.condition);
    expect(bn.evidence).not.toBe(en.evidence);
  });
});
