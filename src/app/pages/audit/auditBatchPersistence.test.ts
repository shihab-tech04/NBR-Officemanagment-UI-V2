// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addAuditCandidates, getAuditCandidates } from "./auditCandidateStore";

const meta = {
  assessmentYear: "2025-26", zone: "Zone-1", track: "Manual Selection",
  selectionBasis: "Selection", funnelRule: "Fixed one",
  populationConsidered: 1, eligibleAfterReadiness: 1, matchedCriteria: 1,
  afterPreview: 1, finalCandidates: 1,
};
const row = {
  return_id: "RET-UNIQUE-NEW-01", tin: "123456789012", taxpayer_name: "Fixture Test Only",
  circle: "Circle-1", risk_level: "High",
};

describe("Audit prototype selection persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("commits one unique batch and survives a fresh store read", () => {
    const result = addAuditCandidates([row], meta);
    const fresh = getAuditCandidates();
    expect(result[0].batch_id).toBeTruthy();
    expect(fresh.some((item) => item.candidate_id === result[0].candidate_id)).toBe(true);
  });

  it("rejects duplicate return identity in a single submission", () => {
    expect(() => addAuditCandidates([row, row], meta)).toThrow(/unique return identity/);
  });

  it("rejects resubmission of an already selected return without adding a second record", () => {
    const result = addAuditCandidates([row], meta);
    expect(() => addAuditCandidates([row], meta)).toThrow(/already selected/);
    expect(getAuditCandidates().filter((item) => item.return_id === row.return_id)).toHaveLength(1);
    expect(result[0].return_id).toBe(row.return_id);
  });

  it("does not claim success when storage rejects the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => addAuditCandidates([row], meta)).toThrow(/Could not persist/);
  });

  it("rejects missing return identity and empty selection", () => {
    expect(() => addAuditCandidates([], meta)).toThrow(/Select at least one/);
    expect(() => addAuditCandidates([{ ...row, return_id: "" }], meta)).toThrow(/unique return identity/);
  });
});
