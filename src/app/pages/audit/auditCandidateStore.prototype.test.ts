import { describe, expect, it } from "vitest";
import { getAuditCandidates, loadAuditCandidates } from "./auditCandidateStore";

describe("Office Audit prototype without officer Auth", () => {
  it("loads only selected assessment-year demo records without an officer session", async () => {
    const all = getAuditCandidates();
    const ay = all[0]?.assessment_year ?? "2026-2027";
    const expected = all.filter(candidate => candidate.assessment_year === ay);
    expect(await loadAuditCandidates(ay)).toEqual(expected);
    expect((await loadAuditCandidates("9999-9999")).length).toBe(0);
  });
});
