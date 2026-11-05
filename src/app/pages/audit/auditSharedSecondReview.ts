import type { TableRow } from "../modulePageUtils";
import { checkAuditSqlAccess, getAuditSqlClient, isSharedAuditMode, listSharedAuditCandidates } from "./auditSharedSql";

export type SharedReviewAction = "sign_off" | "request_rework";
export interface SharedReviewRow extends TableRow {
  candidate_id: string;
  version: number;
  case_id: string;
  return_id: string;
  tin: string;
  circle: string;
  zone: string;
  risk_level: string;
  primary_signal: string;
  evidence_refs: string;
  verification_basis: string;
  finding_summary: string;
  submitted_by: string;
  review_status: string;
  permitted_actions: string;
  evidence_verified: boolean;
}

/** A second review is available only for real RLS-visible SQL candidates. */
export async function listSharedSecondReviews(year: string): Promise<{
  rows: SharedReviewRow[]; reviewerScope: { role: string; zone: string | null; circle: string | null };
}> {
  if (!isSharedAuditMode()) throw new Error("Shared Audit is not enabled");
  const access = await checkAuditSqlAccess();
  const candidates = (await listSharedAuditCandidates(year)).filter((row) =>
    ["Ready for Review", "Second Review"].includes(row.audit_status));
  if (candidates.length === 0) return { rows: [], reviewerScope: { role: access.role, zone: access.zone, circle: access.circle } };

  const db = getAuditSqlClient();
  const ids = candidates.map((row) => row.candidate_id);
  const { data: findings, error: findingError } = await db.from("office_audit_findings")
    .select("id,candidate_id,evidence_id,signal_code,finding_summary,submitted_by")
    .in("candidate_id", ids);
  if (findingError) throw new Error("Unable to read authorized Audit Findings: " + findingError.message);
  const evidenceIds = (findings ?? []).map((f) => f.evidence_id);
  let evidence: Array<{ id: string; candidate_id: string; signal_code: string; evidence_ref: string; verification_note: string | null; verification_status: string }> = [];
  if (evidenceIds.length) {
    const { data, error } = await db.from("office_audit_evidence")
      .select("id,candidate_id,signal_code,evidence_ref,verification_note,verification_status")
      .in("id", evidenceIds);
    if (error) throw new Error("Unable to read authorized signal evidence: " + error.message);
    evidence = data ?? [];
  }
  const rows = candidates.map((candidate): SharedReviewRow => {
    const finding = findings?.find((f) => f.candidate_id === candidate.candidate_id);
    const item = finding && evidence.find((e) => e.id === finding.evidence_id &&
      e.candidate_id === candidate.candidate_id && e.signal_code === finding.signal_code);
    const verified = !!item && item.verification_status === "Verified";
    const authorized = access.role === "range_user" && access.zone === candidate.zone &&
      access.circle === candidate.circle && verified;
    return {
      id: candidate.candidate_id, candidate_id: candidate.candidate_id, version: candidate.version ?? 0,
      case_id: candidate.candidate_id, return_id: candidate.return_id,
      tin: candidate.tin, zone: candidate.zone, circle: candidate.circle,
      risk_level: candidate.risk_level, primary_signal: finding?.signal_code ?? "—",
      evidence_refs: item?.evidence_ref ?? "—",
      verification_basis: item?.verification_note ?? "Evidence not independently verified",
      finding_summary: finding?.finding_summary ?? "No finding submitted",
      submitted_by: finding?.submitted_by ?? "—",
      review_status: candidate.audit_status,
      permitted_actions: authorized ? "Sign off / Request rework" : "Read-only · verified finding and Range Officer required",
      evidence_verified: verified,
    };
  });
  return { rows, reviewerScope: { role: access.role, zone: access.zone, circle: access.circle } };
}

export function validateSecondReviewInput(
  version: number, action: string, note: string,
): { action: SharedReviewAction; reason: string } {
  if (!Number.isInteger(version) || version < 1 ||
    (action !== "sign_off" && action !== "request_rework")) {
    throw new Error("Invalid second-review version or action");
  }
  const reason = note.trim().replace(/\s+/g, " ");
  if (reason.length < 20 || reason.length > 2000 ||
      /^reviewed( and approved)?\.?$/i.test(reason)) {
    throw new Error("Provide a specific 20–2000-character evidence-based reason");
  }
  return { action, reason };
}

/** Successful UI action requires a matching versioned SQL row and review event. */
export async function decideSharedSecondReview(
  candidateId: string, expectedVersion: number, action: SharedReviewAction, note: string,
): Promise<void> {
  if (!candidateId) throw new Error("Candidate identity is required");
  const input = validateSecondReviewInput(expectedVersion, action, note);
  const { role } = await checkAuditSqlAccess();
  if (role !== "range_user") throw new Error("Independent Range Officer permission required");
  const db = getAuditSqlClient();
  const { data, error } = await db.rpc("office_audit_second_review", {
    p_candidate_id: candidateId, p_expected_version: expectedVersion,
    p_action: input.action, p_note: input.reason,
  });
  const expectedStatus = action === "sign_off" ? "Closed" : "Verifying";
  const result = Array.isArray(data) ? data[0] : null;
  if (error || result?.candidate_id !== candidateId ||
    result.version !== expectedVersion + 1 || result.audit_status !== expectedStatus) {
    throw new Error(error?.message ?? "Range Officer review was not confirmed by SQL");
  }
  const { data: candidate, error: candidateError } = await db.from("office_audit_candidates")
    .select("id,audit_status,version").eq("id", candidateId).single();
  const { data: reviews, error: reviewError } = await db.from("office_audit_second_reviews")
    .select("candidate_id,action,review_note,next_version").eq("candidate_id",candidateId)
    .order("id",{ascending:false}).limit(1);
  if (candidateError || reviewError || candidate?.version !== expectedVersion + 1 ||
    candidate.audit_status !== expectedStatus || reviews?.[0]?.action !== action ||
    reviews[0].review_note !== input.reason || reviews[0].next_version !== expectedVersion+1) {
    throw new Error("Review state or immutable event could not be confirmed after refresh");
  }
}
