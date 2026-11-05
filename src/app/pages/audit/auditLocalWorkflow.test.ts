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

  it("keeps Risk Cases and Second Review synchronized after a status change", () => {
    const candidate = getAuditCandidates().find((row) => row.return_id === "RET-2026-10502");
    expect(candidate?.audit_status).toBe("Ready for Review");
    changeLocalAuditCandidateStatus(candidate!.candidate_id, "Verifying", "Review requested additional evidence");
    let scope = getAuditYearScope(candidate!.assessment_year, getAuditCandidates());
    expect(scope.riskCases.find((row) => row.return_id === candidate!.return_id)?.case_status)
      .toBe("Verifying");
    expect(scope.secondReviewRows.some((row) => row.return_id === candidate!.return_id))
      .toBe(false);
    changeLocalAuditCandidateStatus(candidate!.candidate_id, "Ready for Review", "New evidence is ready for review");
    scope = getAuditYearScope(candidate!.assessment_year, getAuditCandidates());
    expect(scope.secondReviewRows.find((row) => row.return_id === candidate!.return_id)?.review_status)
      .toBe("Ready for Review");
    expect(getLocalAuditStatusEvents()).toHaveLength(2);
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

  it("creates only a distinct local case draft and never invents a verified finding", () => {
    const all = getAuditCandidates();
    const baseline = getAuditYearScope("2025-26", all);
    const candidate = all.find((row) =>
      row.assessment_year === "2025-26" && row.audit_status === "Not Started" &&
      !baseline.riskCases.some((item) => item.return_id === row.return_id));
    expect(candidate).toBeDefined();
    changeLocalAuditCandidateStatus(candidate!.candidate_id, "Assigned", "Assigned for source verification");
    const next = getAuditYearScope("2025-26", getAuditCandidates());
    const record = next.riskCases.find((item) => item.return_id === candidate!.return_id);
    expect(String(record?.case_id)).toMatch(/^LOCAL-CASE-/);
    expect(record?.verification_summary).toBe("Not independently verified");
    expect(record?.finding_status).toBe("Not recorded");
    expect(next.trailRows.some((row) => row.return_id === candidate!.return_id &&
      String(row.action).includes("Candidate status:"))).toBe(true);
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
