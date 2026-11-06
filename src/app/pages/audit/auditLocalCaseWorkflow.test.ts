// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { changeLocalAuditCandidateStatus, getAuditCandidates } from "./auditCandidateStore";
import {
  recordLocalAuditEvidence, verifyLocalAuditEvidence, submitLocalAuditFinding,
  decideLocalAuditReview, getLocalAuditCase, getLocalAuditWorkflowEvents,
} from "./auditLocalCaseWorkflow";
import { getAuditYearScope } from "./auditYearScope";
const first = () => getAuditCandidates().find((row) => row.taxpayer_name === "Rahman Enterprise")!;
function verifying() {
  const candidate = first();
  changeLocalAuditCandidateStatus(candidate.candidate_id, "Assigned", "Assigned to Audit case reviewer");
  changeLocalAuditCandidateStatus(candidate.candidate_id, "Verifying", "Start reconciling signals and documents");
  return candidate.candidate_id;
}
function evidence(candidateId: string) {
  const one = recordLocalAuditEvidence(candidateId, "R-C1", "BANK-REF-001", "Reviewed the returned funds-flow statement");
  verifyLocalAuditEvidence(candidateId, one.evidence[0].id, "Source document matches the submitted financial figures");
  const two = recordLocalAuditEvidence(candidateId, "R-E2", "REGISTRY-REF-002", "Reviewed the disclosed property registry");
  verifyLocalAuditEvidence(candidateId, two.evidence[1].id, "Registry data matches the reviewed taxpayer context");
}
describe("Audit prototype complete local case lifecycle", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
  it("enforces authentic case status and signal references for evidence", () => {
    const candidate = first();
    expect(() => recordLocalAuditEvidence(candidate.candidate_id, "R-C1", "BANK-REF", "Reason for review"))
      .toThrow("Assign");
    const id = verifying();
    expect(() => recordLocalAuditEvidence(id, "R-A2", "BANK-REF", "Reason for review"))
      .toThrow("signal");
    expect(() => recordLocalAuditEvidence(id, "R-C1", "", "Reason for review"))
      .toThrow("document reference");
    const saved = recordLocalAuditEvidence(id,"R-C1","BANK-REF-001","Statement tied to reviewed signal");
    expect(saved.evidence).toHaveLength(1);
    expect(getLocalAuditCase(id).evidence[0].verification).toBe("Pending");
  });
  it("does not allow a Finding without verified evidence for every source signal", () => {
    const id = verifying();
    expect(() => submitLocalAuditFinding(id,"Finding supported by both returned documents"))
      .toThrow("Verify supporting evidence");
    const one = recordLocalAuditEvidence(id,"R-C1","BANK-REF-001","Check the funds-flow statement");
    verifyLocalAuditEvidence(id,one.evidence[0].id,"Bank statement verified for the applicable amount");
    expect(() => submitLocalAuditFinding(id,"Finding supported by both returned documents"))
      .toThrow("Verify supporting evidence");
    expect(getAuditCandidates().find((row) => row.candidate_id === id)?.audit_status).toBe("Verifying");
  });
  it("persists evidence, verification, Finding and independent review to the right case and year", () => {
    const id = verifying();
    evidence(id);
    submitLocalAuditFinding(id,"Both R-C1 and R-E2 are verified against original return and registry evidence");
    const c = getAuditCandidates().find((row) => row.candidate_id === id)!;
    expect(c.audit_status).toBe("Ready for Review");
    let scope = getAuditYearScope(c.assessment_year,getAuditCandidates());
    expect(scope.riskCases.find((row) => row.return_id === c.return_id)?.finding_status).toBe("Submitted");
    expect(scope.secondReviewRows.some((row) => row.return_id === c.return_id)).toBe(true);
    decideLocalAuditReview(id,"sign_off","Reviewed both named signal evidence records and the submitted Finding");
    expect(getAuditCandidates().find((row) => row.candidate_id === id)?.audit_status).toBe("Closed");
    scope = getAuditYearScope(c.assessment_year,getAuditCandidates());
    expect(scope.riskCases.find((row) => row.return_id === c.return_id)?.case_status).toBe("Closed");
    expect(getLocalAuditWorkflowEvents(c.assessment_year)).toHaveLength(6);
    expect(scope.trailRows.some((row) => String(row.action).includes("Second review signed off"))).toBe(true);
  });
  it("rework returns to verification and requires a new non-superseded Finding", () => {
    const id = verifying(); evidence(id);
    submitLocalAuditFinding(id,"Evidence for both signals supports initiating independent review");
    decideLocalAuditReview(id,"request_rework","Return for a detailed additional check of the property registry");
    expect(getAuditCandidates().find((row) => row.candidate_id === id)?.audit_status).toBe("Verifying");
    expect(() => decideLocalAuditReview(id,"sign_off","Reviewed submitted findings after requested rework"))
      .toThrow("not ready");
    submitLocalAuditFinding(id,"Revised finding confirms the reconciling records and property registry");
    decideLocalAuditReview(id,"sign_off","Both signals were independently reviewed after the rework");
    expect(getLocalAuditCase(id).reviews).toHaveLength(2);
  });
  it("rejects duplicate review, generic reasons, unrelated and unverifiable records", () => {
    const id = verifying(); evidence(id);
    submitLocalAuditFinding(id,"Evidence supports the initial review of both financial signals");
    expect(() => decideLocalAuditReview(id,"sign_off","Reviewed and approved.")).toThrow("specific");
    decideLocalAuditReview(id,"sign_off","Both R-C1 and R-E2 have consistent supporting records");
    expect(() => decideLocalAuditReview(id,"sign_off","Repeated review of the identical Finding is not allowed"))
      .toThrow("not ready");
    expect(getLocalAuditCase(id).reviews).toHaveLength(1);
  });
  it("stores the authorized attached document locally with a correct reference", () => {
    const id = verifying();
    const saved = recordLocalAuditEvidence(id,"R-C1","FILE-001",
      "Uploaded the relevant taxpayer certificate",{
        name:"certificate.pdf",mime:"application/pdf",dataUrl:"data:application/pdf;base64,AA==",
      });
    expect(saved.evidence[0].attachment?.name).toBe("certificate.pdf");
    expect(getLocalAuditCase(id).evidence[0].reference).toBe("FILE-001");
  });
  it("rolls back a failed evidence write and never claims successful persistence", () => {
    const id = verifying();
    const old = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype,"setItem").mockImplementation(function(key:string,value:string) {
      if (key === "nbr-audit-local-case-workflow-v1") throw Error("quota reached");
      return old.call(this,key,value);
    });
    expect(() => recordLocalAuditEvidence(id,"R-C1","BANK-001","Proper explanation of the documents"))
      .toThrow("could not be saved");
    expect(getLocalAuditCase(id).evidence).toHaveLength(0);
  });
});
