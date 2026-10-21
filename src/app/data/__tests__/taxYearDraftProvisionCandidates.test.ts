import { describe, expect, it } from "vitest";
import { createDraftReviewPackage, freshDraftInput, freshProvisionCandidate } from "../taxYearDraftModel";
import snapshot from "../rulesSqlSnapshot.json";

const ids = new Set(snapshot.rules.map(rule => rule.id));
const SHA = "a".repeat(64);
const originalPdf = {
  name: "synthetic-test-only.pdf", type: "PDF" as const, sizeBytes: 8,
  sha256: SHA, officialUrl: "", suppliedIssueDate: "", suppliedCommencementDate: "",
  evidenceStatus: "UNVERIFIED" as const, persisted: false as const,
};
function fixture() {
  const input = freshDraftInput();
  input.documents = [originalPdf];
  input.proposedProvisions = [{
    ...freshProvisionCandidate(),
    proposalId: "TEST-LEGAL-001",
    ruleId: "ACK-1695-001",
    sourceId: "SYNTHETIC-TEST-SOURCE",
    sourcePdfSha256: SHA,
    provisionLocator: "Synthetic page 1",
    previousText: "Synthetic old legal text - NOT REAL LAW",
    proposedText: "Synthetic proposed text - NOT REAL LAW",
    taxpayerScope: "Synthetic taxpayer and year facts, no law established",
    impacts: ["rules", "forms", "database", "eledger", "tests"],
  }];
  return input;
}

describe("WS03 Office proposed provision fail-closed intake", () => {
  it("exports evidence-linked, OPEN, local-only candidates without upgrading legal or SQL status", () => {
    const input = fixture();
    const original = JSON.stringify(input);
    const exported = createDraftReviewPackage(input, ids);
    expect(exported.provisionCandidates).toHaveLength(1);
    expect(exported.provisionCandidates[0]).toMatchObject({
      proposalId: "TEST-LEGAL-001", sourcePdfSha256: SHA,
      legalVerified: false, sqlVersionId: null, persistence: "LOCAL_REVIEW_ONLY", gapState: "OPEN",
    });
    expect(exported.coverageReconciliation.state).toBe("OPEN");
    expect(exported.coverageReconciliation.sqlVersionsVerified).toBe(0);
    expect(exported.releaseGate.result).toBe("BLOCKED");
    expect(exported.persistentSqlWritePerformed).toBe(false);
    expect(exported.approvedForPublication).toBe(false);
    expect(JSON.stringify(input)).toBe(original);
  });
  it("fails when a JSON extract substitutes for the controlling PDF", () => {
    const input = fixture();
    input.documents = [{...originalPdf, type: "JSON"}];
    expect(() => createDraftReviewPackage(input, ids)).toThrow("linked original PDF");
  });
  it("fails on missing original PDF, locator or previous/proposed text", () => {
    const input = fixture();
    input.documents = [];
    expect(() => createDraftReviewPackage(input, ids)).toThrow("linked original PDF");
    input.documents = [originalPdf];
    input.proposedProvisions[0].provisionLocator = " ";
    expect(() => createDraftReviewPackage(input, ids)).toThrow("linked original PDF");
    input.proposedProvisions[0].provisionLocator = "Synthetic page 1";
    input.proposedProvisions[0].previousText = "";
    input.proposedProvisions[0].proposedText = "";
    expect(() => createDraftReviewPackage(input, ids)).toThrow("linked original PDF");
  });
  it("rejects unknown target, unknown parent and self-parent", () => {
    const input = fixture();
    input.proposedProvisions[0].ruleId = "NOT-A-CANONICAL-ID";
    expect(() => createDraftReviewPackage(input, ids)).toThrow("Invalid proposed hierarchy");
    input.proposedProvisions[0].ruleId = "ACK-1695-001";
    input.proposedProvisions[0].parentRuleId = "NO-SUCH-PARENT";
    expect(() => createDraftReviewPackage(input, ids)).toThrow("Invalid proposed hierarchy");
    input.proposedProvisions[0].parentRuleId = "ACK-1695-001";
    expect(() => createDraftReviewPackage(input, ids)).toThrow("Invalid proposed hierarchy");
  });
  it("does not infer that a statutory child is executable or that an admin hierarchy is law", () => {
    const input = fixture();
    input.proposedProvisions[0].level = "CHILD";
    input.proposedProvisions[0].parentRuleId = "CORE-S-84";
    input.proposedProvisions[0].hierarchyBasis = "ADMINISTRATIVE";
    input.proposedProvisions[0].reviewState = "CONFLICT";
    const exported = createDraftReviewPackage(input, ids);
    expect(exported.provisionCandidates[0].hierarchyBasis).toBe("ADMINISTRATIVE");
    expect(exported.provisionCandidates[0].reviewState).toBe("CONFLICT");
    expect(exported.provisionCandidates[0].legalVerified).toBe(false);
    expect(exported.executionStatus).toBe("NOT_CERTIFIED");
  });
  it("rejects duplicate proposal IDs, unknown impacts and false approval", () => {
    const input = fixture();
    input.proposedProvisions.push({...input.proposedProvisions[0]});
    expect(() => createDraftReviewPackage(input, ids)).toThrow("duplicate provision proposal");
    input.proposedProvisions.pop();
    input.proposedProvisions[0].impacts = ["unverified-product" as never];
    expect(() => createDraftReviewPackage(input, ids)).toThrow("Invalid proposed impact");
    input.proposedProvisions[0].impacts = ["rules"];
    input.proposedProvisions[0].reviewState = "APPROVED" as never;
    expect(() => createDraftReviewPackage(input, ids)).toThrow("Invalid proposed impact");
  });
});
