import type { TableRow } from "../modulePageUtils";
import {
  ALL_TAXPAYER_ROWS, AUDIT_TRAIL_ROWS, CONTROL_ROWS,
  RISK_CASE_ROWS, SECOND_REVIEW_ROWS,
} from "./auditData";
import type { AuditCandidateRecord } from "./auditCandidateStore";
import { getLocalAuditStatusEvents } from "./auditCandidateStore";

/** Every Audit workload count and destination must describe the selected AY. */
export function getAuditYearScope(
  assessmentYear: string,
  allCandidates: AuditCandidateRecord[],
) {
  const matchesYear = (row: TableRow) =>
    String(row.assessment_year ?? "") === assessmentYear;
  const population = ALL_TAXPAYER_ROWS.filter(matchesYear);
  const candidates = allCandidates.filter(matchesYear);
  const changed = new Map(
    candidates.filter((c) => c.local_status_updated_at)
      .map((c) => [String(c.return_id ?? ""), c]),
  );
  // Preserve previously recorded cases, updating only locally changed drafts.
  const storedCaseRows = RISK_CASE_ROWS.filter(matchesYear).map((row) => {
    const current = changed.get(String(row.return_id ?? ""));
    return current ? { ...row, case_status: current.audit_status } : row;
  });
  const caseReturnIds = new Set(storedCaseRows.map((row) => String(row.return_id ?? "")));
  // Starting a selected candidate makes it visible in the local case queue.
  // Never claim that selecting a taxpayer automatically creates an official case.
  const newLocalCases: TableRow[] = candidates
    .filter((candidate) => candidate.local_status_updated_at &&
      candidate.audit_status !== "Not Started" && !caseReturnIds.has(candidate.return_id))
    .map((candidate) => ({
      id: `LOCAL-CASE-${candidate.candidate_id}`,
      case_id: `LOCAL-CASE-${candidate.candidate_id}`,
      return_id: candidate.return_id,
      tin: candidate.tin,
      assessment_year: candidate.assessment_year,
      return_version: "—",
      circle: candidate.circle,
      coverage_tier: candidate.coverage_tier,
      risk_level: candidate.risk_level,
      signals: candidate.signals,
      verification_summary: "Not independently verified",
      evidence_status: candidate.audit_status === "Evidence Pending" ? "Pending" : "Not requested",
      evidence_refs: "—",
      finding_status: "Not recorded",
      sla: "—",
      case_status: candidate.audit_status,
      assigned_to: "Local workspace",
      reason_code: candidate.selection_basis,
    }));
  const riskCases = [...storedCaseRows, ...newLocalCases];
  const controlRows = CONTROL_ROWS.filter(matchesYear);
  const caseIds = new Set(riskCases.map((row) => String(row.case_id ?? "")));
  const reviewStates = new Set(["Ready for Review", "Second Review", "Rework Requested"]);
  const secondReviewBase = SECOND_REVIEW_ROWS.filter((row) =>
    caseIds.has(String(row.case_id ?? "")) &&
    riskCases.some((item) => item.return_id === row.return_id &&
      item.case_id === row.case_id && reviewStates.has(String(item.case_status ?? ""))),
  ).map((row) => {
    const updated = changed.get(String(row.return_id ?? ""));
    const caseRow = riskCases.find((item) => item.return_id === row.return_id &&
      item.case_id === row.case_id);
    return updated && caseRow
      ? { ...row, review_status: caseRow.case_status }
      : row;
  });
  const knownReviewIds = new Set(secondReviewBase.map((row) => String(row.case_id ?? "")));
  const newLocalReviews: TableRow[] = riskCases
    .filter((row) => String(row.case_id ?? "").startsWith("LOCAL-CASE-") &&
      reviewStates.has(String(row.case_status ?? "")) &&
      !knownReviewIds.has(String(row.case_id ?? "")))
    .map((row) => ({
      id: row.id, case_id: row.case_id, return_id: row.return_id, tin: row.tin,
      circle: row.circle, risk_level: row.risk_level,
      primary_signal: row.signals, verification_basis: "Awaiting evidence verification",
      evidence_refs: "—", finding_summary: "Not recorded",
      submitted_by: "Local workspace", review_status: row.case_status,
      permitted_actions: "Review draft",
    }));
  const secondReviewRows = [...secondReviewBase, ...newLocalReviews];
  const returnIds = new Set(riskCases.map((row) => String(row.return_id ?? "")));
  const trailRows = [
    ...AUDIT_TRAIL_ROWS.filter((row) => returnIds.has(String(row.return_id ?? ""))),
    ...getLocalAuditStatusEvents(assessmentYear),
  ];
  return { population, candidates, riskCases, controlRows, secondReviewRows, trailRows };
}

/** Only announce years actually present in the loaded Audit sources. */
export function getAvailableAuditYears(candidates: AuditCandidateRecord[]): string[] {
  return Array.from(new Set([
    ...ALL_TAXPAYER_ROWS.map((row) => String(row.assessment_year ?? "")),
    ...candidates.map((row) => String(row.assessment_year ?? "")),
  ].filter(Boolean))).sort().reverse();
}
