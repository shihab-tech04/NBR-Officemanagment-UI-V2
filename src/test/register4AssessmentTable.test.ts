import { describe, expect, it } from "vitest";
import {
  REGISTER4_ASSESSMENT_COLUMNS,
  REGISTER4_ASSESSMENT_ROWS,
  REGISTER4_ASSESSMENT_MOBILE_MAPPING,
} from "../app/pages/register-stock/register4AssessmentTable";

const flatten = () => REGISTER4_ASSESSMENT_COLUMNS.flatMap((col) =>
  col.type === "col" ? [col.col] : col.group.cols
);

describe("Register-4 assessment table metadata (isolated)", () => {
  it("uses the reference column order without legacy book-issuance fields", () => {
    expect(flatten().map((col) => col.key)).toEqual([
      "serial_no",
      "circle",
      "taxpayer_identity",
      "folio_no",
      "disposal_code",
      "assessment_year",
      "assessment_date",
      "assessed_income",
      "arrear_year_demand",
      "current_year_demand",
      "penalty",
      "revised_demand",
      "remarks",
    ]);
    expect(flatten().map((col) => col.key)).not.toContain("book_no");
    expect(flatten().map((col) => col.key)).not.toContain("from_serial");
    expect(flatten().map((col) => col.key)).not.toContain("status");
  });

  it("uses existing two-level grouped table header support", () => {
    const groups = REGISTER4_ASSESSMENT_COLUMNS.filter(
      (col) => col.type === "group"
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      type: "group",
      group: {
        groupKey: "headers.register4CreatedDemand",
        cols: [
          { key: "arrear_year_demand" },
          { key: "current_year_demand" },
        ],
      },
    });
  });

  it("does not fabricate assessed income, demand, penalty or folio values", () => {
    expect(REGISTER4_ASSESSMENT_ROWS).toHaveLength(32);
    for (const row of REGISTER4_ASSESSMENT_ROWS) {
      for (const key of [
        "folio_no", "disposal_code", "assessment_date", "assessed_income",
        "arrear_year_demand", "current_year_demand", "penalty",
        "revised_demand", "remarks",
      ]) {
        expect(row[key]).toBe("—");
      }
    }
  });

  it("keeps mobile card mappings aligned to the new columns", () => {
    const keys = new Set(flatten().map((col) => col.key));
    expect(keys.has(REGISTER4_ASSESSMENT_MOBILE_MAPPING.primary!)).toBe(true);
    for (const key of REGISTER4_ASSESSMENT_MOBILE_MAPPING.meta ?? []) {
      expect(keys.has(key)).toBe(true);
    }
  });
});
