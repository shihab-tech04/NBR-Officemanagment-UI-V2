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
import type { ColDef, MobileCardMapping, TableRow } from "../modulePageUtils";

const unknown = "—";

export const REGISTER4_ASSESSMENT_COLUMNS: ColDef[] = [
  fc("serial_no", "S/N", { headerKey: "headers.serialNo", truncate: "compact" }),
  fc("circle", "Circle", { headerKey: "headers.circle", truncate: "compact" }),
  fc("taxpayer_identity", "Taxpayer Name & TIN", { headerKey: "headers.register4TaxpayerTin", truncate: "none" }),
  fc("folio_no", "Folio No.", { headerKey: "headers.register4FolioNo" }),
  fc("disposal_code", "Disposal Code (Section)", { headerKey: "headers.register4DisposalCode" }),
  fc("assessment_year", "Assessment Year", { headerKey: "headers.register4AssessmentYear", truncate: "compact" }),
  fc("assessment_date", "Assessment Date", { headerKey: "headers.register4AssessmentDate", truncate: "compact" }),
  fc("assessed_income", "Assessed Income", { headerKey: "headers.register4AssessedIncome" }),
  {
    type: "group",
    group: {
      label: "Created Demand / Allocation",
      groupKey: "headers.register4CreatedDemand",
      cols: [
        { key: "arrear_year_demand", label: "Arrear Tax Year", headerKey: "headers.register4ArrearYearDemand" },
        { key: "current_year_demand", label: "Current Tax Year", headerKey: "headers.register4CurrentYearDemand" },
      ],
    },
  },
  fc("penalty", "Penalty", { headerKey: "headers.register4Penalty" }),
  fc("revised_demand", "Revised Demand / Allocation", { headerKey: "headers.register4RevisedDemand" }),
  fc("remarks", "Remarks (if any)", { headerKey: "headers.register4Remarks", truncate: "normal" }),
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
export const REGISTER4_ASSESSMENT_ROWS: TableRow[] = reg4Rows.map((row, index) => ({
  id: row.id,
  serial_no: String(index + 1),
  circle: row.circle,
  taxpayer_identity: `${row.taxpayer_name} (${row.tin})`,
  folio_no: unknown,
  disposal_code: unknown,
  assessment_year: row.ay ?? unknown,
  assessment_date: unknown,
  assessed_income: unknown,
  arrear_year_demand: unknown,
  current_year_demand: unknown,
  penalty: unknown,
  revised_demand: unknown,
  remarks: unknown,
}));
