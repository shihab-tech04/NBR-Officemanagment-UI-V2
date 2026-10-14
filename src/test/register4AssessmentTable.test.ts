import { describe, expect, it } from "vitest";
import {
  REGISTER4_ASSESSMENT_COLUMNS,
  REGISTER4_ASSESSMENT_ROWS,
  REGISTER4_ASSESSMENT_MOBILE_MAPPING,
  REGISTER4_ASSESSMENT_DRAWER_COLUMNS,
  buildRegister4Kpis,
  buildRegister4EntryFields,
  createRegister4LocalDraft,
  buildRegister4SampleCsv,
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

describe("Register-4 coherent tax-assessment display (audit closure)", () => {
  const tr = (_key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? _key;

  it("tags every inherited row as illustrative, never source-verified", () => {
    expect(REGISTER4_ASSESSMENT_ROWS.every(r => r.record_source === "Illustrative sample — not verified")).toBe(true);
    expect(REGISTER4_ASSESSMENT_ROWS.every(r => r.taxpayer_identity === `${r.taxpayer_name} (${r.tin})`)).toBe(true);
    expect(REGISTER4_ASSESSMENT_ROWS.some(r => r.status === "Issued")).toBe(false);
  });

  it("computes truthful KPIs from only currently displayed records", () => {
    const thisYear = REGISTER4_ASSESSMENT_ROWS.filter(r => r.assessment_year === "2024-25");
    const kpis = buildRegister4Kpis(thisYear);
    expect(thisYear).toHaveLength(8);
    expect(kpis.map(k => k.value)).toEqual(["8", "0", "0", "8"]);
    expect(kpis.map(k => k.labelKey)).toEqual([
      "register4.recordsInView", "register4.verifiedAssessments",
      "register4.localDrafts", "register4.incomeUnavailable",
    ]);
  });

  it("preselects the active tax year and uses the matching assessment field schema", () => {
    const fields = buildRegister4EntryFields("2024-25", tr, tr);
    const year = fields.find(f => f.key === "assessment_year");
    expect(year).toMatchObject({ type: "select", required: true, defaultValue: "2024-25", options: ["2024-25"] });
    expect(fields.map(f => f.key)).toContain("assessed_income");
    expect(fields.map(f => f.key)).not.toContain("book_no");
  });

  it("creates only a session-local, source-tagged draft with the right display fields", () => {
    const draft = createRegister4LocalDraft({
      taxpayer_name: "Sample Test", tin: "DEMO-0001", circle: "Circle-2",
      assessment_year: "2024-25", assessed_income: "125000",
      assessment_date: "2026-01-01", remarks: "Synthetic test",
    }, REGISTER4_ASSESSMENT_ROWS);
    expect(draft).toMatchObject({
      taxpayer_identity: "Sample Test (DEMO-0001)",
      assessed_income: "125000", assessment_date: "2026-01-01",
      record_source: "Local draft — not submitted", folio_no: "—",
    });
    expect(buildRegister4Kpis([draft]).map(k => k.value)).toEqual(["1", "0", "1", "0"]);
  });

  it("uses a source-visible, BOM UTF-8 CSV and blocks spreadsheet formula injection", () => {
    const draft = createRegister4LocalDraft({
      taxpayer_name: '=HYPERLINK("https://invalid.test")',
      tin: "DEMO", circle: "Circle-1", assessment_year: "2024-25",
    }, REGISTER4_ASSESSMENT_ROWS);
    const csv = buildRegister4SampleCsv([draft]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"Record source"');
    expect(csv).toContain('"Local draft — not submitted"');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("preserves name and TIN fields for the existing reusable details drawer", () => {
    const keys = REGISTER4_ASSESSMENT_DRAWER_COLUMNS.flatMap(c => c.type === "col" ? [c.col.key] : c.group.cols.map(x => x.key));
    expect(keys).toContain("taxpayer_name");
    expect(keys).toContain("tin");
    expect(keys).toContain("record_source");
  });
});
