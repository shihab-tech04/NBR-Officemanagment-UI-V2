import { describe, expect, it } from "vitest";
import { REGISTER4_SECTIONS, normalizeRegister4SectionCode, isRegister4SectionSyntax,
  appendRegister4Section, undoRegister4Section } from "../app/pages/register-stock/register4SectionCodes";
import { buildRegister4EntryFields, createRegister4LocalDraft, REGISTER4_ASSESSMENT_ROWS } from "../app/pages/register-stock/register4AssessmentTable";

describe("Register-4 statutory selection (draft-only)", () => {
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
    expect(undoRegister4Section("180/182/183(7)")).toBe("180/182");
  });
  it("accepts Bengali digits but rejects free text, slash injection, zero and invalid parentheses", () => {
    expect(normalizeRegister4SectionCode("১৮৩(৭)")).toBe("183(7)");
    expect(appendRegister4Section("180", "১৮৩(৭)")).toBe("180/183(7)");
    for(const bad of ["", "abc", "180/182", "0", "180(0)", "182(", "=1", "184<script>"]) {
      expect(isRegister4SectionSyntax(bad)).toBe(false);
      expect(appendRegister4Section("180", bad)).toBeNull();
    }
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
