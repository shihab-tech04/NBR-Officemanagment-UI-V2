import { describe, expect, it } from "vitest";
import { REGISTER4_SECTIONS, normalizeRegister4SectionCode, isRegister4SectionSyntax,
  appendRegister4Section, appendReviewedRegister4Section, reviewRegister4Transition, reviewRegister4History, nextRegister4CandidateCodes, illustrativeRegister4Trail, REGISTER4_ILLUSTRATIVE_SECTION_TRAILS, getRegister4DemoShortcutSection } from "../app/pages/register-stock/register4SectionCodes";
import { buildRegister4EntryFields, createRegister4LocalDraft, REGISTER4_ASSESSMENT_ROWS } from "../app/pages/register-stock/register4AssessmentTable";

describe("Register-4 statutory selection (draft-only)", () => {
  it("uses fresh first TIN, three varied and editable example histories, and no other implicit defaults", () => {
    expect(["TIN-10000","TIN-10001","TIN-10002","TIN-10003"].map(getRegister4DemoShortcutSection))
      .toEqual(["","180","180/180(2)","180/182/183(7)"]);
    expect(getRegister4DemoShortcutSection("tin-10000")).toBe("");
    expect(getRegister4DemoShortcutSection("TIN-10004")).toBe("");
  });
  it("uses screenshot-style multi-section values in synthetic rows only", () => {
    expect(REGISTER4_ILLUSTRATIVE_SECTION_TRAILS).toHaveLength(8);
    expect(illustrativeRegister4Trail(0)).toBe("180/182(2)/182(4)/183(7)/289");
    expect(illustrativeRegister4Trail(4)).toBe("180");
    expect(illustrativeRegister4Trail(28)).toBe("183(7)/213");
    expect(REGISTER4_ILLUSTRATIVE_SECTION_TRAILS.every(s => s.split("/").every(part => isRegister4SectionSyntax(part)))).toBe(true);
  });
  const tr = (_key: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _key;
  it("offers all ten documented statutory references", () => {
    expect(REGISTER4_SECTIONS.map(v => v.code)).toEqual(["180","180(2)","182","183(7)","184","212","213","285","289","292"]);
  });
  it("requires the Under Section selection in the existing entry field", () => {
    expect(buildRegister4EntryFields("2024-25",tr,tr).find(f => f.key === "disposal_code"))
      .toMatchObject({ type:"sectionTrail", required:true });
  });
  it("appends in selection order without silently deleting repeated real-world codes", () => {
    expect(appendRegister4Section("180/182", "183(7)")).toBe("180/182/183(7)");
    expect(appendRegister4Section("180/182", "182")).toBe("180/182/182");
    expect(reviewRegister4Transition("180/182","183(7)").status).toBe("REVIEW_REQUIRED");
    expect(appendReviewedRegister4Section("180/182","183(7)")).toBe("180/182/183(7)");
  });
  it("accepts Bengali digits but rejects free text, slash injection, zero and invalid parentheses", () => {
    expect(normalizeRegister4SectionCode("১৮৩(৭)")).toBe("183(7)");
    expect(appendRegister4Section("180", "১৮৩(৭)")).toBe("180/183(7)");
    for(const bad of ["", "abc", "180/182", "0", "180(0)", "182(", "=1", "184<script>"]) {
      expect(isRegister4SectionSyntax(bad)).toBe(false);
      expect(appendRegister4Section("180", bad)).toBeNull();
    }
  });
  it("blocks impossible first-step appeals and ordinary revisions after audit selection", () => {
    for(const code of ["180(2)","182","289","292","213","285"]) {
      expect(reviewRegister4Transition("",code).status).toBe("BLOCKED");
    }
    expect(reviewRegister4Transition("180/182","180(2)").status).toBe("BLOCKED");
    expect(reviewRegister4Transition("180","292").status).toBe("BLOCKED");
    expect(reviewRegister4Transition("180/183(7)","184").status).toBe("BLOCKED");
    expect(appendReviewedRegister4Section("180","292")).toBeNull();
  });
  it("restricts candidate choices to context-specific pathways, never legal PASS", () => {
    expect(nextRegister4CandidateCodes("180")).toContain("182");
    expect(nextRegister4CandidateCodes("180")).not.toContain("292");
    expect(nextRegister4CandidateCodes("180/182")).toContain("182(11)");
    expect(nextRegister4CandidateCodes("180/182")).toContain("184");
    expect(nextRegister4CandidateCodes("180/183(7)")).toContain("289");
    expect(nextRegister4CandidateCodes("180/183(7)/289")).toContain("292");
    expect(reviewRegister4Transition("180/183(7)/289","292")).toMatchObject({status:"REVIEW_REQUIRED"});
    expect(reviewRegister4Transition("180","444")).toMatchObject({status:"REVIEW_REQUIRED",reason:"CUSTOM_UNVERIFIED"});
    expect(reviewRegister4History("180/292").status).toBe("BLOCKED");
    expect(reviewRegister4History("180/182/183(7)").status).toBe("REVIEW_REQUIRED");
  });
  it("retains string history in the existing local-draft and export data contract", () => {
    const draft = createRegister4LocalDraft({
      taxpayer_name:"Sample", tin:"DEMO", circle:"Circle-1", assessment_year:"2024-25",
      disposal_code:"180/182/183(7)",
    },REGISTER4_ASSESSMENT_ROWS);
    expect(draft.disposal_code).toBe("180/182/183(7)");
    expect(draft.record_source).toBe("Local draft — not submitted");
  });
});
