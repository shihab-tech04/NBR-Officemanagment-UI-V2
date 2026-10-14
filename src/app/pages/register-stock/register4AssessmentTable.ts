/**
 * Register-4: monthly tax-assessment table schema.
 *
 * This is page-specific metadata for the EXISTING shared table component.
 * Legacy Register-4 fixture contains book-movement records, not assessments.
 * Only its explicitly synthetic identity/AY fields are reused to demonstrate
 * rows; unavailable assessment facts are shown as "—", never guessed.
 *
 * Do not copy taxpayer data or financial amounts from screenshot references.
 */
import { fc, reg4Rows } from "../modulePageUtils";
import type { ColDef, MobileCardMapping, TableRow, KpiDef } from "../modulePageUtils";
import type { FormField, EntryFormValue } from "../../components/forms/EntryForm";

const unknown = "—";

export const REGISTER4_ASSESSMENT_COLUMNS: ColDef[] = [
  fc("serial_no", "S/N", { headerKey: "headers.register4SerialNo", truncate: "compact", align: "center" }),
  fc("circle", "Circle", { headerKey: "headers.circle", truncate: "compact", align: "left" }),
  fc("taxpayer_identity", "Taxpayer Name & TIN", { headerKey: "headers.register4TaxpayerTin", multilineHeader: true, truncate: "normal", align: "left" }),
  fc("folio_no", "Folio No.", { headerKey: "headers.register4FolioNo", align: "left" }),
  fc("disposal_code", "Disposal Code (Section)", { headerKey: "headers.register4DisposalCode", align: "left" }),
  fc("assessment_year", "Assessment Year", { headerKey: "headers.register4AssessmentYear", truncate: "compact", align: "center" }),
  fc("assessment_date", "Assessment Date", { headerKey: "headers.register4AssessmentDate", truncate: "compact", align: "center" }),
  fc("assessed_income", "Assessed Income", { headerKey: "headers.register4AssessedIncome", align: "right" }),
  {
    type: "group",
    group: {
      label: "Created Demand / Allocation",
      groupKey: "headers.register4CreatedDemand",
      cols: [
        { key: "arrear_year_demand", label: "Arrear Tax Year", headerKey: "headers.register4ArrearYearDemand", align: "right" },
        { key: "current_year_demand", label: "Current Tax Year", headerKey: "headers.register4CurrentYearDemand", align: "right" },
      ],
    },
  },
  fc("penalty", "Penalty", { headerKey: "headers.register4Penalty", align: "right" }),
  fc("revised_demand", "Revised Demand / Allocation", { headerKey: "headers.register4RevisedDemand", align: "right" }),
  fc("remarks", "Remarks (if any)", { headerKey: "headers.register4Remarks", truncate: "normal", align: "left" }),
];

export const REGISTER4_ASSESSMENT_MOBILE_MAPPING: MobileCardMapping = {
  primary: "taxpayer_identity",
  identifier: "folio_no",
  meta: ["circle", "assessment_year", "assessed_income"],
  date: "assessment_date",
};

/**
 * No verified assessment rows or authenticated source contract are available.
 * Keep the existing public demo identity fixture without turning unrelated
 * book-issuance, dates or statuses into tax-assessment facts.
 */
/** Entirely synthetic demonstration figures. These values are NOT tax-law
 * calculations, statutory assessments, taxpayer liabilities, or NBR records.
 * Never persist or export them as verified fiscal facts. */
const demoAmounts = (index: number) => {
  const income = 840000 + index * 93650;
  const arrears = index % 4 === 0 ? 0 : 8500 + (index % 8) * 1900;
  const current = 37500 + index * 2330;
  const penalty = index % 5 === 0 ? 0 : (index % 4) * 850;
  const revised = 34000 + index * 3150;
  const format = (value: number): string => value.toLocaleString("en-IN");
  return { income: format(income), arrears: format(arrears), current: format(current),
    penalty: format(penalty), revised: format(revised) };
};

export const REGISTER4_ASSESSMENT_ROWS: TableRow[] = reg4Rows.map((row, index) => {
  const amount = demoAmounts(index);
  return {
    id: row.id,
    serial_no: String(index + 1),
    circle: row.circle,
    taxpayer_name: row.taxpayer_name,
    tin: row.tin,
    taxpayer_identity: `${row.taxpayer_name} (${row.tin})`,
    folio_no: "",
    disposal_code: `DEMO-${String(index + 1).padStart(3, "0")}`,
    assessment_year: row.ay ?? unknown,
    assessment_date: `2026-10-${String(index % 28 + 1).padStart(2, "0")}`,
    assessed_income: amount.income,
    arrear_year_demand: amount.arrears,
    current_year_demand: amount.current,
    penalty: amount.penalty,
    revised_demand: amount.revised,
    remarks: ["Record entered", "Assessment reviewed", "Adjustment noted", "Entry updated"][index % 4],
    record_source: "Illustrative sample — not verified",
  };
});

export const REGISTER4_ASSESSMENT_DRAWER_COLUMNS: ColDef[] = [
  fc("taxpayer_name", "Taxpayer Name", { headerKey: "headers.taxpayerName" }),
  fc("tin", "TIN", { headerKey: "headers.tin" }),
  ...REGISTER4_ASSESSMENT_COLUMNS.filter(col =>
    !(col.type === "col" && col.col.key === "taxpayer_identity")
  ),
  fc("record_source", "Record source", { headerKey: "headers.register4RecordSource" }),
];

export function buildRegister4Kpis(rows: TableRow[]): KpiDef[] {
  const drafts = rows.filter(row => row.record_source === "Local draft — not submitted").length;
  const missing = rows.filter(row => !row.assessed_income || row.assessed_income === unknown).length;
  return [
    { label: "Records in view", labelKey: "register4.recordsInView", value: String(rows.length), tone: "primary" },
    { label: "Verified assessments", labelKey: "register4.verifiedAssessments", value: "0", tone: "neutral" },
    { label: "Local drafts", labelKey: "register4.localDrafts", value: String(drafts), tone: "warning" },
    { label: "Income unavailable", labelKey: "register4.incomeUnavailable", value: String(missing), tone: "neutral" },
  ];
}

export const REGISTER4_ASSESSMENT_FILTERS = [
  {
    key: "circle", label: "Circle", labelKey: "labels.circle", type: "select" as const,
    options: ["All Circles", "Circle-1"],
    optionKeys: { "All Circles": "options.allCircles" },
  },
  { key: "from", label: "From Date", labelKey: "labels.fromDate", type: "date" as const },
  { key: "to", label: "To Date", labelKey: "labels.toDate", type: "date" as const },
];

type HeaderTranslate = (key: string, options?: { defaultValue?: string }) => string;

export function buildRegister4EntryFields(
  year: string,
  th: HeaderTranslate,
  tp: HeaderTranslate,
): FormField[] {
  const label = (key: string, fallback: string) => th(`headers.${key}`, { defaultValue: fallback });
  return [
    { key: "taxpayer_name", label: label("taxpayerName", "Taxpayer Name"), type: "text", required: true },
    { key: "tin", label: label("tin", "TIN"), type: "text", required: true },
    { key: "circle", label: label("circle", "Circle"), type: "text", required: true, defaultValue: "Circle-1" },
    { key: "assessment_year", label: label("register4AssessmentYear", "Tax Year"), type: "select",
      options: [year], required: true, defaultValue: year,
      helper: tp("register4.yearHelp", { defaultValue: "Matches the selected assessment year" }) },
    { key: "folio_no", label: label("register4FolioNo", "Folio No."), type: "text" },
    { key: "disposal_code", label: label("register4DisposalCode", "Disposal Code (Section)"), type: "sectionTrail", required: true },
    { key: "assessment_date", label: label("register4AssessmentDate", "Assessment Date"), type: "date" },
    { key: "assessed_income", label: label("register4AssessedIncome", "Assessed Income (BDT)"), type: "number" },
    { key: "arrear_year_demand", label: label("register4ArrearYearDemand", "Arrear Tax Year Demand (BDT)"), type: "number" },
    { key: "current_year_demand", label: label("register4CurrentYearDemand", "Current Tax Year Demand (BDT)"), type: "number" },
    { key: "penalty", label: label("register4Penalty", "Penalty (BDT)"), type: "number" },
    { key: "revised_demand", label: label("register4RevisedDemand", "Revised Demand / Allocation (BDT)"), type: "number" },
    { key: "remarks", label: label("register4Remarks", "Remarks"), type: "textarea", span: true },
  ];
}

export function createRegister4LocalDraft(
  values: Record<string, EntryFormValue>,
  existingRows: TableRow[],
): TableRow {
  const get = (key: string): string =>
    typeof values[key] === "string" ? String(values[key]).trim() : "";
  const taxpayerName = get("taxpayer_name");
  const tin = get("tin");
  const optional = (key: string) => get(key) || unknown;
  return {
    id: `local-draft-${existingRows.length + 1}`,
    serial_no: String(existingRows.length + 1),
    taxpayer_name: taxpayerName,
    tin,
    taxpayer_identity: `${taxpayerName} (${tin})`,
    circle: get("circle"),
    assessment_year: get("assessment_year"),
    folio_no: optional("folio_no"),
    disposal_code: optional("disposal_code"),
    assessment_date: optional("assessment_date"),
    assessed_income: optional("assessed_income"),
    arrear_year_demand: optional("arrear_year_demand"),
    current_year_demand: optional("current_year_demand"),
    penalty: optional("penalty"),
    revised_demand: optional("revised_demand"),
    remarks: optional("remarks"),
    record_source: "Local draft — not submitted",
  };
}


/** CSV data is explicitly sample/local-only and never a government assessment export. */
export function buildRegister4SampleCsv(rows: TableRow[], translate?: HeaderTranslate): string {
  const columns = REGISTER4_ASSESSMENT_COLUMNS.flatMap(col =>
    col.type === "col" ? [col.col] : col.group.cols
  );
  const fields = [
    ...columns.map(col => ({ key: col.key, label: translate?.(col.headerKey ?? "", { defaultValue: col.label }) ?? col.label })),
    { key: "record_source", label: translate?.("headers.register4RecordSource", { defaultValue: "Record source" }) ?? "Record source" },
  ];
  const safe = (value: unknown): string => {
    let text = value == null ? "" : String(value);
    // Prevent spreadsheet formula execution if a user enters untrusted text.
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return "\uFEFF" + [fields.map(f => safe(f.label)).join(","),
    ...rows.map(row => fields.map(f => safe(row[f.key])).join(","))].join("\r\n");
}

export function downloadRegister4SampleCsv(rows: TableRow[], translate?: HeaderTranslate): void {
  const csv = buildRegister4SampleCsv(rows, translate);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "register4-sample-or-local-draft.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
