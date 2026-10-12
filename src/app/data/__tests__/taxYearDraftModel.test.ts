import { describe, expect, it } from "vitest";
import { createDraftReviewPackage, freshDraftInput, isSupportedDraftYear, isValidCustomRuleId } from "../taxYearDraftModel";
import snapshot from "../rulesSqlSnapshot.json";

const canonical = new Set(snapshot.rules.map(x => x.id));

describe("NBR tax-year draft intake hard legal gates", () => {
  it("only accepts the verified SQL target/base/income year tuple", () => {
    expect(isSupportedDraftYear(freshDraftInput())).toBe(true);
    expect(isSupportedDraftYear({ ...freshDraftInput(), incomeYear: "2025-26" })).toBe(false);
    expect(isSupportedDraftYear({ ...freshDraftInput(), targetYear: "2028-29" })).toBe(false);
  });
  it("always exports non-executable draft and preserves canonical SHA", () => {
    const d = createDraftReviewPackage(freshDraftInput(), canonical);
    expect(d.canonicalParent.frozenIdentities).toBe(366);
    expect(d.canonicalParent.sha256).toBe("34902bac07a459a4f0c051b90bfe3b4c492f2465d06c661bab18ab7f36252184");
    expect(d.yearState).toBe("DRAFT");
    expect(d.inheritedApplicability).toBe("INHERITED_PENDING_REVIEW");
    expect(d.executionStatus).toBe("NOT_CERTIFIED");
    expect(d.approvalsInherited).toBe(false);
    expect(d.persistentSqlWritePerformed).toBe(false);
    expect(d.approvedForPublication).toBe(false);
    expect(d.releaseGate.result).toBe("BLOCKED");
  });
  it("rejects canonical IDs fabricated outside the frozen universe", () => {
    expect(() => createDraftReviewPackage({ ...freshDraftInput(), selectedRuleIds: ["FAKE-999"] }, canonical)).toThrow("Unrecognized");
  });
  it("rejects duplicate identity submissions", () => {
    expect(() => createDraftReviewPackage({ ...freshDraftInput(), selectedRuleIds: ["ACK-1695-001", "ACK-1695-001"] }, canonical)).toThrow("Duplicate");
  });
  it("does not permit custom proposals to overwrite canonical IDs", () => {
    expect(isValidCustomRuleId("ACK-1695-001", canonical, [])).toBe(false);
    expect(isValidCustomRuleId("PROPOSED-AB123", canonical, [])).toBe(true);
  });
  it("rejects duplicate custom proposals and proposal without purpose", () => {
    const input = freshDraftInput();
    input.customRules = [{candidateId:"PROPOSED-TEST",purpose:"A",status:"PROPOSED"},{candidateId:"PROPOSED-TEST",purpose:"B",status:"PROPOSED"}];
    expect(() => createDraftReviewPackage(input, canonical)).toThrow("Invalid or duplicate");
    input.customRules = [{candidateId:"PROPOSED-TEST",purpose:" ",status:"PROPOSED"}];
    expect(() => createDraftReviewPackage(input, canonical)).toThrow("Invalid or duplicate");
  });
  it("keeps document metadata unverified even with official-looking URL", () => {
    const input=freshDraftInput();
    input.documents=[{name:"gazette.pdf",type:"PDF",sizeBytes:4,sha256:"a".repeat(64),officialUrl:"https://nbr.gov.bd/fake",suppliedIssueDate:"2026-07-05",suppliedCommencementDate:"2026-07-01",evidenceStatus:"UNVERIFIED",persisted:false}];
    const o=createDraftReviewPackage(input,canonical);
    expect(o.sourceDocuments[0].evidenceStatus).toBe("UNVERIFIED");
    expect(o.sourceDocuments[0].persisted).toBe(false);
    expect(o.legalComparison.verifiedAmendment).toBe(false);
  });
  it("rejects a document with untrusted digest", () => {
    const input=freshDraftInput();
    input.documents=[{name:"fake.json",type:"JSON",sizeBytes:1,sha256:"BAD",officialUrl:"",suppliedIssueDate:"",suppliedCommencementDate:"",evidenceStatus:"UNVERIFIED",persisted:false}];
    expect(() => createDraftReviewPackage(input,canonical)).toThrow("Document metadata");
  });
  it("marks all impacts OPEN, including selected candidates", () => {
    const input=freshDraftInput();input.proposedImpacts=["eledger","calculation"];
    const x=createDraftReviewPackage(input,canonical);
    expect(x.impactReview).toHaveLength(8);
    expect(x.impactReview.every(i => i.status === "OPEN")).toBe(true);
    expect(x.impactReview.find(i=>i.target==="eledger")?.candidate).toBe(true);
  });
  it("proposed repeal does not become confirmed repeal", () => {
    const x=createDraftReviewPackage({...freshDraftInput(),legalEffect:"REPEAL"},canonical);
    expect(x.legalComparison.proposedEffect).toBe("REPEAL");
    expect(x.legalComparison.result).toBe("HUMAN_REVIEW_REQUIRED");
  });
  it("never mutates the selected canonical IDs or base input", () => {
    const input=freshDraftInput();input.selectedRuleIds=["ACK-1695-001","CORE-S-84"];
    const original=JSON.stringify(input);
    const x=createDraftReviewPackage(input,canonical);
    expect(x.reviewSelection.canonicalRuleIds).toEqual(["ACK-1695-001","CORE-S-84"]);
    expect(JSON.stringify(input)).toBe(original);
  });
});
