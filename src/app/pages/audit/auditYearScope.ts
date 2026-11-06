import type { TableRow } from "../modulePageUtils";
import {
  ALL_TAXPAYER_ROWS, AUDIT_TRAIL_ROWS, CONTROL_ROWS,
  RISK_CASE_ROWS, SECOND_REVIEW_ROWS,
} from "./auditData";
import type { AuditCandidateRecord } from "./auditCandidateStore";
import { getLocalAuditStatusEvents } from "./auditCandidateStore";
import { isSharedAuditMode } from "./auditSharedSql";
import { getLocalAuditCase, getLocalAuditWorkflowEvents } from "./auditLocalCaseWorkflow";
import { getLocalAuditControlEvents, getSourceAuditControls } from "./auditLocalControlStore";

/** Every Audit workload count and destination must describe the selected AY. */
export function getAuditYearScope(
  assessmentYear: string,
  allCandidates: AuditCandidateRecord[],
) {
  // Without certified SQL-backed source records, never show local sample returns,
  // officer reviews or events in a connected Audit environment.
  if (isSharedAuditMode()) {
    return {
      population: [] as TableRow[],
      // Preserve authorized SQL candidates that the caller already loaded;
      // never replace them with the browser's local population.
      candidates: allCandidates.filter((row) => row.assessment_year === assessmentYear),
      riskCases: [] as TableRow[],
      controlRows: [] as TableRow[],
      secondReviewRows: [] as TableRow[],
      trailRows: [] as TableRow[],
    };
  }
  const matchesYear = (row: TableRow) =>
    String(row.assessment_year ?? "") === assessmentYear;
  const population = ALL_TAXPAYER_ROWS.filter(matchesYear);
  const candidates = allCandidates.filter(matchesYear);
  const selectedByReturn = new Map(candidates.map((candidate) => [candidate.return_id, candidate]));
  const summarize = (candidate: AuditCandidateRecord | undefined, base: TableRow): TableRow => {
    if (!candidate) return base;
    const workflow = getLocalAuditCase(candidate.candidate_id);
    const latest = [...workflow.findings].reverse().find((finding) => !finding.superseded);
    const evidence = workflow.evidence;
    const statusChanged = !!candidate.local_status_updated_at;
    return {
      ...base,
      case_status: statusChanged ? candidate.audit_status : base.case_status,
      audit_status: statusChanged ? candidate.audit_status : base.audit_status,
      evidence_refs: evidence.length ? evidence.map((item) => item.reference).join("; ") : base.evidence_refs,
      evidence_status: evidence.length
        ? (evidence.every((item) => item.verification === "Verified") ? "Verified" : "Pending")
        : base.evidence_status,
      verification_summary: evidence.length
        ? evidence.filter((item) => item.verification === "Verified").length + "/" + evidence.length + " evidence records verified"
        : base.verification_summary,
      finding_status: latest ? "Submitted"
        : workflow.reviews.some((review) => review.action === "request_rework")
          ? "Rework Requested" : base.finding_status,
      finding_summary: latest?.summary ?? base.finding_summary,
    };
  };
  // Preserve existing case identifiers and their unchanged approved content.
  const storedCaseRows = RISK_CASE_ROWS.filter(matchesYear)
    .map((row) => summarize(selectedByReturn.get(String(row.return_id ?? "")), row));
  const caseReturnIds = new Set(storedCaseRows.map((row) => String(row.return_id ?? "")));
  // New confirmed batches appear as real local case drafts immediately;
  // previously selected examples remain unchanged until the user acts.
  const newLocalCases: TableRow[] = candidates
    .filter((candidate) => !caseReturnIds.has(candidate.return_id) &&
      (!!candidate.local_status_updated_at ||
       /^AC-\d{4}-[0-9a-f]{8}-[0-9a-f]{4}-/i.test(candidate.candidate_id)))
    .map((candidate) => summarize(candidate, {
      id: `LOCAL-CASE-${candidate.candidate_id}`,
      case_id: `LOCAL-CASE-${candidate.candidate_id}`,
      return_id: candidate.return_id, tin: candidate.tin,
      assessment_year: candidate.assessment_year, return_version: "—",
      circle: candidate.circle, coverage_tier: candidate.coverage_tier,
      risk_level: candidate.risk_level, signals: candidate.signals,
      verification_summary: "Not independently verified",
      evidence_status: "Not requested", evidence_refs: "—",
      finding_status: "Not recorded", sla: "—",
      case_status: candidate.audit_status,
      assigned_to: "Local workspace", reason_code: candidate.selection_basis,
    }));
  const riskCases = [...storedCaseRows, ...newLocalCases];
  const controlRows = getSourceAuditControls(assessmentYear);
  const caseIds = new Set(riskCases.map((row) => String(row.case_id ?? "")));
  const reviewStates = new Set(["Ready for Review", "Second Review", "Rework Requested"]);
  const secondReviewBase = SECOND_REVIEW_ROWS.filter((row) =>
    caseIds.has(String(row.case_id ?? "")) &&
    riskCases.some((item) => item.return_id === row.return_id &&
      item.case_id === row.case_id && reviewStates.has(String(item.case_status ?? ""))),
  ).map((row) => {
    const candidate = selectedByReturn.get(String(row.return_id ?? ""));
    const caseRow = riskCases.find((item) => item.return_id === row.return_id &&
      item.case_id === row.case_id);
    const workflow = candidate ? getLocalAuditCase(candidate.candidate_id) : null;
    const latest = [...(workflow?.findings ?? [])].reverse().find((finding) => !finding.superseded);
    return {
      ...row,
      review_status: candidate?.local_status_updated_at && caseRow ? caseRow.case_status : row.review_status,
      evidence_refs: workflow?.evidence.length
        ? workflow.evidence.map((item) => item.reference).join("; ") : row.evidence_refs,
      finding_summary: latest?.summary ?? row.finding_summary,
      verification_basis: workflow?.evidence.length
        ? workflow.evidence.filter((item) => item.verification === "Verified").length + " verified evidence records"
        : row.verification_basis,
    };
  });
  const knownReviewIds = new Set(secondReviewBase.map((row) => String(row.case_id ?? "")));
  const newLocalReviews: TableRow[] = riskCases
    .filter((row) => reviewStates.has(String(row.case_status ?? "")) &&
      !knownReviewIds.has(String(row.case_id ?? "")) &&
      (String(row.case_id ?? "").startsWith("LOCAL-CASE-") ||
       !!selectedByReturn.get(String(row.return_id ?? ""))?.local_status_updated_at))
    .map((row) => ({
      id: row.id, case_id: row.case_id, return_id: row.return_id, tin: row.tin,
      circle: row.circle, risk_level: row.risk_level,
      primary_signal: row.signals, verification_basis: row.verification_summary,
      evidence_refs: row.evidence_refs, finding_summary: row.finding_summary ?? "Not recorded",
      submitted_by: "Local workspace", review_status: row.case_status,
      permitted_actions: "Sign off / Request rework",
    }));
  const secondReviewRows = [...secondReviewBase, ...newLocalReviews];
  const returnIds = new Set(riskCases.map((row) => String(row.return_id ?? "")));
  const trailRows = [
    ...AUDIT_TRAIL_ROWS.filter((row) => returnIds.has(String(row.return_id ?? ""))),
    ...getLocalAuditStatusEvents(assessmentYear),
    ...getLocalAuditWorkflowEvents(assessmentYear),
    ...getLocalAuditControlEvents(assessmentYear),
  ];
  return { population, candidates, riskCases, controlRows, secondReviewRows, trailRows };
}

/** Only announce years actually present in the loaded Audit sources. */
export function getAvailableAuditYears(candidates: AuditCandidateRecord[]): string[] {
  return Array.from(new Set([
    ...(isSharedAuditMode() ? [] : ALL_TAXPAYER_ROWS.map((row) => String(row.assessment_year ?? ""))),
    ...candidates.map((row) => String(row.assessment_year ?? "")),
  ].filter(Boolean))).sort().reverse();
}
