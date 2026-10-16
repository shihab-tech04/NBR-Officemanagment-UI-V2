import { describe, expect, it } from "vitest";
import { validateRegister4InlineRow } from "../app/pages/register-stock/Register4InlineRow";
import { bindRegister4DraftToTaxpayer, findRegister4Taxpayer } from "../app/pages/register-stock/Register4EntryModal";
import { REGISTER4_ILLUSTRATIVE_SECTION_TRAILS } from "../app/pages/register-stock/register4SectionCodes";
import {
  REGISTER4_ASSESSMENT_COLUMNS,
  REGISTER4_ASSESSMENT_ROWS,
  REGISTER4_CIRCLE_OPTIONS,
  REGISTER4_ASSESSMENT_MOBILE_MAPPING,
  REGISTER4_ASSESSMENT_DRAWER_COLUMNS,
  buildRegister4Kpis,
  buildRegister4EntryFields,
  createRegister4LocalDraft,
  nextRegister4SerialNo,
  buildRegister4SampleCsv,
} from "../app/pages/register-stock/register4AssessmentTable";

const flatten = () => REGISTER4_ASSESSMENT_COLUMNS.flatMap((col) =>
  col.type === "col" ? [col.col] : col.group.cols
);

describe("Register-4 assessment table metadata (isolated)", () => {
  it("does not let an editable Circle select override the TIN lookup identity on New Entry", () => {
    const taxpayer = findRegister4Taxpayer("TIN-10000");
    expect(taxpayer).not.toBeNull();
    const values = {
      tin: "TIN-FORGED",
      taxpayer_name: "Different taxpayer",
      circle: "Circle-375",
      disposal_code: "180",
    };
    const submission = bindRegister4DraftToTaxpayer(values, taxpayer!);
    expect(submission).toMatchObject({
      tin: taxpayer!.tin,
      taxpayer_name: taxpayer!.taxpayer_name,
      circle: taxpayer!.circle,
      disposal_code: "180",
      section_review_status: "REVIEW_REQUIRED — not certified",
    });
    expect(values.circle).toBe("Circle-375");
  });
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


  it("uses one left-alignment across all 13 Register-4 headers and cells", () => {
    expect(flatten().map((col) => col.align)).toEqual(Array(13).fill("left"));
    expect(REGISTER4_ASSESSMENT_ROWS).toHaveLength(32);
    expect(REGISTER4_ASSESSMENT_ROWS[0].folio_no).toBe("");
    expect(REGISTER4_ASSESSMENT_ROWS[0].disposal_code).toBe("180/182(2)/182(4)/183(7)/289");
  });

  it("previews an automatic serial using the complete register, independent of filters", () => {
    expect(nextRegister4SerialNo(REGISTER4_ASSESSMENT_ROWS)).toBe("33");
    expect(nextRegister4SerialNo([{ serial_no: "1" }, { serial_no: "5" }] as never)).toBe("6");
    const draft = createRegister4LocalDraft({ taxpayer_name: "Fixture", tin: "TIN-X", circle: "Circle-1" }, REGISTER4_ASSESSMENT_ROWS);
    expect(draft.serial_no).toBe("33");
    expect(draft.folio_no).toBe("");
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

  it("keeps Folio No. empty while populating complete synthetic assessment fields", () => {
    expect(REGISTER4_ASSESSMENT_ROWS).toHaveLength(32);
    for (const row of REGISTER4_ASSESSMENT_ROWS) {
      expect(row.folio_no).toBe("");
      for (const key of [
        "disposal_code", "assessment_date", "assessed_income",
        "arrear_year_demand", "current_year_demand", "penalty",
        "revised_demand", "remarks",
      ]) {
        expect(row[key]).not.toBe("—");
        expect(row[key]).not.toBe("");
      }
      expect(row.record_source).toBe("Illustrative sample — not verified");
      expect(String(row.disposal_code)).not.toMatch(/^DEMO-/);
    }
    expect(REGISTER4_ASSESSMENT_COLUMNS[0]).toMatchObject({
      type: "col", col: { headerKey: "headers.register4SerialNo" },
    });
    expect(REGISTER4_ASSESSMENT_COLUMNS[2]).toMatchObject({
      type: "col", col: { headerKey: "headers.register4TaxpayerTin", multilineHeader: true },
    });
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
    expect(kpis.map(k => k.value)).toEqual(["8", "0", "0", "0"]);
    expect(kpis.map(k => k.labelKey)).toEqual([
      "register4.recordsInView", "register4.verifiedAssessments",
      "register4.localDrafts", "register4.incomeUnavailable",
    ]);
  });

  it("preselects the active tax year and uses the matching assessment field schema", () => {
    const fields = buildRegister4EntryFields("2024-25", tr, tr);
    const circle = fields.find(f => f.key === "circle");
    expect(circle).toMatchObject({ type:"select", required:true, defaultValue:"Circle-1", options:REGISTER4_CIRCLE_OPTIONS });
    expect(REGISTER4_CIRCLE_OPTIONS[0]).toBe("Circle-1");
    expect(REGISTER4_CIRCLE_OPTIONS).toContain("Circle-375");
    expect(REGISTER4_CIRCLE_OPTIONS).toContain("Circle-393");
    expect(REGISTER4_CIRCLE_OPTIONS).not.toContain("All Circle");
    const year = fields.find(f => f.key === "assessment_year");
    expect(year).toMatchObject({ type: "select", required: true, defaultValue: "2024-25", options: ["2024-25"] });
    expect(fields.map(f => f.key)).toContain("assessed_income");
    expect(fields.find(f=>f.key==="folio_no")).toMatchObject({readOnly:true});
    const inputs = fields.filter(f=>f.key!=="taxpayer_name"&&f.key!=="tin").map(f=>f.key);
    expect(inputs).toEqual([
      "circle","assessment_year","folio_no","assessment_date","disposal_code",
      "assessed_income","penalty","arrear_year_demand","current_year_demand",
      "revised_demand","remarks",
    ]);
    expect(new Set(fields.map(f=>f.group)).size).toBeGreaterThanOrEqual(4);
    expect(fields.map(f => f.key)).not.toContain("book_no");
    expect(fields.map(f => f.key)).not.toContain("proceeding_reference");
    expect(fields.map(f => f.key)).not.toContain("proceeding_event_date");
    expect(fields.filter(f=>!["tin","taxpayer_name"].includes(f.key??""))).toHaveLength(11);
  });

  it("creates only reference field values and internal audit metadata in a local draft", () => {
    const draft = createRegister4LocalDraft({
      taxpayer_name: "Sample Test", tin: "DEMO-0001", circle: "Circle-2",
      assessment_year: "2024-25", assessed_income: "125000",
      assessment_date: "2026-01-01", remarks: "Synthetic test",
      proceeding_reference: "MUST_NOT_COPY", proceeding_event_date: "2026-01-05",
    }, REGISTER4_ASSESSMENT_ROWS);
    expect(draft).toMatchObject({
      taxpayer_identity: "Sample Test (DEMO-0001)",
      assessed_income: "125000", assessment_date: "2026-01-01",
      record_source: "Local draft — not submitted", folio_no: "",
    });
    expect(buildRegister4Kpis([draft]).map(k => k.value)).toEqual(["1", "0", "1", "0"]);
    expect(draft).not.toHaveProperty("proceeding_reference");
    expect(draft).not.toHaveProperty("proceeding_event_date");
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

describe("Register-4 inline Add row rules", () => {
  const year="2024-25";
  it("blocks unresolved or mismatched TIN identity",()=>{
    expect(validateRegister4InlineRow({},year)).toBe("TIN");
    expect(validateRegister4InlineRow({tin:"TIN-10000",taxpayer_name:"Wrong",circle:"Circle-1",assessment_year:year,disposal_code:"180"},year)).toBe("TIN");
  });
  it("requires matching current year and a supported section trail",()=>{
    const row={tin:"TIN-10000",taxpayer_name:"Rahman Enterprise",circle:"Circle-1",assessment_year:year,disposal_code:"180"};
    expect(validateRegister4InlineRow({...row,assessment_year:"2023-24"},year)).toBe("YEAR");
    expect(validateRegister4InlineRow({...row,disposal_code:""},year)).toBe("SECTION");
    expect(validateRegister4InlineRow({...row,disposal_code:"180/292"},year)).toBe("SECTION");
    expect(validateRegister4InlineRow(row,year)).toBeNull();
  });
  it("uses the unchanged local-draft creator after validation, never a verified assessment",()=>{
    const values={tin:"TIN-10000",taxpayer_name:"Rahman Enterprise",circle:"Circle-1",assessment_year:year,disposal_code:"180",assessed_income:"12345"};
    expect(validateRegister4InlineRow(values,year)).toBeNull();
    const draft=createRegister4LocalDraft(values,REGISTER4_ASSESSMENT_ROWS);
    expect(draft.record_source).toBe("Local draft — not submitted");
    expect(draft.section_review_status).toBe("REVIEW_REQUIRED — not certified");
    expect(draft.folio_no).toBe("");
  });
});
