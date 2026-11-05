// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  changeLocalAuditCandidateStatus,
  getAuditCandidates,
  getLocalAuditStatusEvents,
  getNextLocalAuditStatuses,
} from "./auditCandidateStore";
import { getAuditYearScope } from "./auditYearScope";

describe("Office Audit device-local candidate lifecycle", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("moves a selected candidate through an allowed step and persists after fresh read", () => {
    const candidate = getAuditCandidates().find((row) => row.audit_status === "Not Started");
    expect(candidate).toBeDefined();
    const updated = changeLocalAuditCandidateStatus(
      candidate!.candidate_id, "Assigned", "Assigned for document verification",
    );
    expect(updated.audit_status).toBe("Assigned");
    expect(getAuditCandidates().find((row) => row.candidate_id === candidate!.candidate_id)?.audit_status)
      .toBe("Assigned");
    expect(getLocalAuditStatusEvents(candidate!.assessment_year)).toEqual([
      expect.objectContaining({
        return_id: candidate!.return_id, assessment_year: candidate!.assessment_year,
        actor_role: "Local workspace", human_record: "Assigned for document verification",
      }),
    ]);
    const scope = getAuditYearScope(candidate!.assessment_year, getAuditCandidates());
    expect(scope.trailRows.some((row) => row.action === "Candidate status: Not Started → Assigned"))
      .toBe(true);
    expect(scope.riskCases.some((row) => row.return_id === candidate!.return_id &&
      row.case_status === "Assigned")).toBe(true);
  });

  it("rejects skipped, duplicate, closed, empty-note and excessive-note transitions", () => {
    const candidate = getAuditCandidates().find((row) => row.audit_status === "Not Started")!;
    expect(getNextLocalAuditStatuses("Not Started")).toEqual(["Assigned"]);
    expect(() => changeLocalAuditCandidateStatus(candidate.candidate_id, "Closed", "No review completed"))
      .toThrow("Invalid Audit status transition");
    expect(() => changeLocalAuditCandidateStatus(candidate.candidate_id, "Assigned", "short"))
      .toThrow("between 10 and 500");
    expect(() => changeLocalAuditCandidateStatus(candidate.candidate_id, "Assigned", "x".repeat(501)))
      .toThrow("between 10 and 500");
    changeLocalAuditCandidateStatus(candidate.candidate_id, "Assigned", "First review assigned");
    expect(() => changeLocalAuditCandidateStatus(candidate.candidate_id, "Assigned", "Duplicate status update"))
      .toThrow("Invalid Audit status transition");
    expect(getLocalAuditStatusEvents()).toHaveLength(1);
    expect(getNextLocalAuditStatuses("Closed")).toEqual([]);
  });

  it("does not overwrite another assessment year or unrelated candidate", () => {
    const original = getAuditCandidates();
    const candidate = original.find((row) => row.audit_status === "Not Started")!;
    const other = original.find((row) => row.candidate_id !== candidate.candidate_id)!;
    changeLocalAuditCandidateStatus(candidate.candidate_id, "Assigned", "Review only one candidate");
    const loaded = getAuditCandidates();
    expect(loaded.find((row) => row.candidate_id === other.candidate_id)).toEqual(other);
    expect(getLocalAuditStatusEvents("1900-01")).toHaveLength(0);
  });

  it("rolls back the candidate update when audit history cannot be saved", () => {
    const candidate = getAuditCandidates().find((row) => row.audit_status === "Not Started")!;
    const originalSetItem = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(key: string, value: string) {
      if (key === "nbr-audit-local-status-events-v1") throw new Error("quota exceeded");
      return originalSetItem.call(this, key, value);
    });
    expect(() => changeLocalAuditCandidateStatus(candidate.candidate_id, "Assigned", "Review should not be partial"))
      .toThrow("could not be saved and verified");
    spy.mockRestore();
    expect(getAuditCandidates().find((row) => row.candidate_id === candidate.candidate_id)?.audit_status)
      .toBe(candidate.audit_status);
    expect(getLocalAuditStatusEvents()).toHaveLength(0);
  });
});
