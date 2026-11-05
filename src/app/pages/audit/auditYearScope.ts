import type { TableRow } from "../modulePageUtils";
import {
  ALL_TAXPAYER_ROWS, AUDIT_TRAIL_ROWS, CONTROL_ROWS,
  RISK_CASE_ROWS, SECOND_REVIEW_ROWS,
} from "./auditData";
import type { AuditCandidateRecord } from "./auditCandidateStore";

/** Every Audit workload count and destination must describe the selected AY. */
export function getAuditYearScope(
  assessmentYear: string,
  allCandidates: AuditCandidateRecord[],
) {
  const matchesYear = (row: TableRow) =>
    String(row.assessment_year ?? "") === assessmentYear;
  const population = ALL_TAXPAYER_ROWS.filter(matchesYear);
  const candidates = allCandidates.filter(matchesYear);
  const riskCases = RISK_CASE_ROWS.filter(matchesYear);
  const controlRows = CONTROL_ROWS.filter(matchesYear);
  const caseIds = new Set(riskCases.map((row) => String(row.case_id ?? "")));
  const secondReviewRows = SECOND_REVIEW_ROWS.filter((row) =>
    caseIds.has(String(row.case_id ?? "")) &&
    riskCases.some((item) => item.return_id === row.return_id && item.case_id === row.case_id),
  );
  const returnIds = new Set(riskCases.map((row) => String(row.return_id ?? "")));
  const trailRows = AUDIT_TRAIL_ROWS.filter((row) =>
    returnIds.has(String(row.return_id ?? "")),
  );
  return { population, candidates, riskCases, controlRows, secondReviewRows, trailRows };
}

/** Only announce years actually present in the loaded Audit sources. */
export function getAvailableAuditYears(candidates: AuditCandidateRecord[]): string[] {
  return Array.from(new Set([
    ...ALL_TAXPAYER_ROWS.map((row) => String(row.assessment_year ?? "")),
    ...candidates.map((row) => String(row.assessment_year ?? "")),
  ].filter(Boolean))).sort().reverse();
}
