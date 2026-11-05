import { describe, expect, it } from "vitest";
import type { AuditCandidateRecord } from "./auditCandidateStore";
import type { TableRow } from "../modulePageUtils";
import { validateAuditFindingInput, validateAuditReviewInput } from "./auditReviewSql";

const candidate={
  candidate_id:"case-01",signals:"R-C1, R-E2",zone:"Zone-1",circle:"Circle-1",
} as AuditCandidateRecord;
const row={
  id:"case-01",review_status:"Second Review",version:4,primary_signal:"R-C1",
  zone:"Zone-1",circle:"Circle-1",
} as TableRow;

describe("Independent DCT/Range evidence and review contracts",()=>{
  it("requires a source-backed signal, evidence ref, DCT verification and specific finding",()=>{
    expect(()=>validateAuditFindingInput(candidate,"R-C1","CERT-2026-001",
      "Verified record reference and confirmed related source",
      "The source-of-funds discrepancy is supported by the referenced asset register")).not.toThrow();
    expect(()=>validateAuditFindingInput(candidate,"R-F2","CERT-2026-001",
      "Verified record reference and confirmed related source",
      "The source-of-funds discrepancy is supported by the referenced asset register")).toThrow();
    expect(()=>validateAuditFindingInput(candidate,"R-C1","bad",
      "Verified record reference and confirmed related source",
      "The source-of-funds discrepancy is supported by the referenced asset register")).toThrow();
    expect(()=>validateAuditFindingInput(candidate,"R-C1","CERT-2026-001",
      "Too short",
      "The source-of-funds discrepancy is supported by the referenced asset register")).toThrow();
  });
  it("permits only specified status and signal-linked second-officer decisions",()=>{
    expect(()=>validateAuditReviewInput(row,"sign_off",
      "R-C1: I checked the supplied evidence reference against the submitted DCT finding.")).not.toThrow();
    expect(()=>validateAuditReviewInput(row,"request_rework",
      "R-C1: Supporting evidence is incomplete; return the case for further verification.")).not.toThrow();
    expect(()=>validateAuditReviewInput(row,"sign_off","Reviewed and approved")).toThrow();
    expect(()=>validateAuditReviewInput(row,"sign_off",
      "An unrelated generic statement that has no risk code or supporting evidence.")).toThrow();
    expect(()=>validateAuditReviewInput({...row,version:0},"sign_off",
      "R-C1: A supported decision with a complete evidence-specific officer reason.")).toThrow();
    expect(()=>validateAuditReviewInput({...row,review_status:"Verifying"},"sign_off",
      "R-C1: A supported decision with a complete evidence-specific officer reason.")).toThrow();
    expect(()=>validateAuditReviewInput({...row,review_status:"Verifying"},"request_rework",
      "R-C1: A supported decision with a complete evidence-specific officer reason.")).toThrow();
  });
});
