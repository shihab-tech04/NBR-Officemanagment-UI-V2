import type { TableRow } from "../modulePageUtils";
import type { AuditCandidateRecord } from "./auditCandidateStore";
import {
  checkAuditSqlAccess, getAuditSqlClient, isSharedAuditMode,
  listSharedAuditCandidates,
} from "./auditSharedSql";

export type AuditReviewDecision = "sign_off" | "request_rework";

export function validateAuditFindingInput(
  candidate: AuditCandidateRecord,
  signal: string,
  reference: string,
  verification: string,
  summary: string,
): void {
  const signals = String(candidate.signals ?? "").match(/R-[A-E][1-9]/g) ?? [];
  if (!signals.includes(signal) ||
      reference.trim().length < 8 || reference.trim().length > 240 ||
      verification.trim().length < 20 || verification.trim().length > 1000 ||
      summary.trim().length < 40 || summary.trim().length > 2000) {
    throw new Error("Select a case signal and provide its evidence reference, verification note and Finding.");
  }
}

export function validateAuditReviewInput(
  row: TableRow, decision: AuditReviewDecision, reason: string,
): void {
  const summary = reason.trim().replace(/\s+/g, " ");
  const signal = String(row["primary_signal"] ?? "");
  const status = String(row["review_status"] ?? "");
  if (!["sign_off","request_rework"].includes(decision) ||
    summary.length < 30 || summary.length > 500 ||
    !signal || !summary.includes(signal) ||
    (decision === "sign_off" && status !== "Second Review") ||
    (decision === "request_rework" && !["Second Review","Ready for Review"].includes(status)) ||
    !Number.isInteger(Number(row["version"])) || Number(row["version"]) < 1) {
    throw new Error("Review requires an eligible case, source-linked signal and a specific reason of 30–500 characters.");
  }
}

function assertSharedMode(): void {
  if (!isSharedAuditMode()) throw new Error("Connected Audit SQL mode is not enabled");
}

export async function listSharedAuditReviewRows(year: string): Promise<{
  rows: TableRow[];
  reviewerRole: string;
}> {
  assertSharedMode();
  const officer = await checkAuditSqlAccess();
  const candidates = await listSharedAuditCandidates(year);
  const active = candidates.filter(c => ["Ready for Review","Second Review"].includes(c.audit_status));
  if (active.length === 0) return {rows:[],reviewerRole:officer.role};

  const db = getAuditSqlClient();
  const ids = active.map(c => c.candidate_id);
  const { data: findings, error: findingError } = await db
    .from("office_audit_findings")
    .select("id,candidate_id,evidence_id,signal_code,finding_summary,submitted_by,submitted_at")
    .in("candidate_id",ids).order("submitted_at",{ascending:false});
  if (findingError) throw new Error("Could not read the authorized DCT Findings");
  const latest = new Map<string,Record<string,unknown>>();
  for (const finding of findings ?? []) {
    const record = finding as Record<string,unknown>;
    const candidateId = String(record.candidate_id ?? "");
    if (!latest.has(candidateId)) latest.set(candidateId,record);
  }
  const evidenceIds = [...new Set([...latest.values()].map(f=>String(f.evidence_id??"")).filter(Boolean))];
  const evidenceRefs = new Map<string,string>();
  if (evidenceIds.length > 0) {
    const { data: evidence, error: evidenceError } = await db
      .from("office_audit_case_evidence")
      .select("id,evidence_ref")
      .in("id",evidenceIds);
    if (evidenceError) throw new Error("Could not read linked Audit evidence");
    for (const item of evidence ?? []) evidenceRefs.set(String(item.id),String(item.evidence_ref));
  }
  return {
    reviewerRole: officer.role,
    rows: active.map(c => {
      const finding = latest.get(c.candidate_id);
      const signal = String(finding?.signal_code ?? "");
      const canReview = officer.role === "range_user" &&
        officer.zone === c.zone && officer.circle === c.circle &&
        Boolean(finding);
      return {
        id:c.candidate_id,
        case_id:c.candidate_id,
        return_id:c.return_id,
        tin:c.tin,
        assessment_year:c.assessment_year,
        circle:c.circle,
        zone:c.zone,
        risk_level:c.risk_level,
        primary_signal:signal || String(c.signals ?? "—"),
        verification_basis:finding?"DCT submitted evidence-linked Finding":"Awaiting DCT Finding",
        evidence_refs:finding?evidenceRefs.get(String(finding.evidence_id)) ?? "—":"—",
        finding_summary:String(finding?.finding_summary ?? "—"),
        submitted_by:String(finding?.submitted_by ?? "—"),
        review_status:c.audit_status,
        permitted_actions:canReview?"Sign off / Request rework":"Read only",
        version:Number(c.version ?? 0),
        finding_id:String(finding?.id ?? ""),
        can_review:canReview,
      } as TableRow;
    }),
  };
}

export async function submitSharedAuditFinding(
  candidate: AuditCandidateRecord, signal: string, reference: string,
  verification: string, summary: string,
): Promise<void> {
  assertSharedMode();
  validateAuditFindingInput(candidate,signal,reference,verification,summary);
  const officer = await checkAuditSqlAccess();
  if (officer.role !== "circle_user" || officer.zone !== candidate.zone ||
      officer.circle !== candidate.circle) throw new Error("Only the assigned DCT can submit this Finding");
  const db = getAuditSqlClient();
  const { data, error } = await db.rpc("office_audit_submit_finding",{
    p_candidate_id:candidate.candidate_id,
    p_signal_code:signal,
    p_evidence_ref:reference.trim(),
    p_verification_note:verification.trim(),
    p_finding_summary:summary.trim(),
  });
  const item = Array.isArray(data)?data[0]:null;
  if (error || !item?.finding_id || !item?.evidence_id) throw new Error("Evidence-linked Finding was not saved");
  const { data: record, error: readError } = await db
    .from("office_audit_findings").select("id,candidate_id,evidence_id,signal_code")
    .eq("id",item.finding_id).maybeSingle();
  if (readError || record?.candidate_id!==candidate.candidate_id ||
      record?.evidence_id!==item.evidence_id || record?.signal_code!==signal)
    throw new Error("Finding submitted but persistence could not be verified");
}

export async function submitSharedAuditReview(
  row: TableRow,decision:AuditReviewDecision,reason:string,
): Promise<void> {
  assertSharedMode();
  validateAuditReviewInput(row,decision,reason);
  const officer = await checkAuditSqlAccess();
  if (officer.role!=="range_user" || officer.zone!==String(row["zone"]) ||
      officer.circle!==String(row["circle"])) throw new Error("Independent Range Officer jurisdiction required");
  const db=getAuditSqlClient();
  const id=String(row["id"]);
  const expected=Number(row["version"]);
  const {data,error}=await db.rpc("office_audit_second_review",{
    p_candidate_id:id,p_expected_version:expected,
    p_decision:decision,p_note:reason.trim(),
  });
  const result=Array.isArray(data)?data[0]:null;
  const status=decision==="sign_off"?"Closed":"Verifying";
  if(error || !result || result.candidate_id!==id ||
     result.version!==expected+1 || result.audit_status!==status ||
     !result.review_id) throw new Error("SQL did not confirm the independent review decision");
  const {data:review,error:reviewError}=await db.from("office_audit_case_reviews")
    .select("id,candidate_id,decision,review_note").eq("id",result.review_id).maybeSingle();
  const {data:events,error:eventError}=await db.from("office_audit_events")
    .select("candidate_id,new_status,review_note").eq("candidate_id",id)
    .order("id",{ascending:false}).limit(1);
  if(reviewError || eventError || !review || review.candidate_id!==id ||
     review.decision!==decision || review.review_note!==reason.trim() ||
     !events?.length || events[0].new_status!==status)
    throw new Error("Review was saved but event read-back is unverified. Reload the case.");
  const records=await listSharedAuditCandidates(String(row["assessment_year"]));
  const confirmed=records.find(c=>c.candidate_id===id);
  if(!confirmed || confirmed.audit_status!==status || confirmed.version!==expected+1)
    throw new Error("Review was saved but refresh did not confirm the new version");
}

/** Read SQL's append-only event log through officer membership and candidate RLS. */
export async function listSharedAuditEventRows(year:string):Promise<TableRow[]> {
  assertSharedMode();
  await checkAuditSqlAccess();
  const db=getAuditSqlClient();
  const { data,error }=await db.from("office_audit_events")
    .select("id,candidate_id,actor_id,changed_at,event_type,previous_status,new_status,review_note,office_audit_candidates!inner(return_id,assessment_year)")
    .eq("office_audit_candidates.assessment_year",year)
    .order("changed_at",{ascending:false}).limit(2000);
  if(error) throw new Error("Authorized Audit event history could not be loaded");
  return (data??[]).map(event=>{
    const source=event.office_audit_candidates as unknown as {return_id:string;assessment_year:string}|null;
    return {
      id:String(event.id),
      event_id:String(event.id),
      timestamp_utc:String(event.changed_at),
      return_id:source?.return_id??"—",
      assessment_year:source?.assessment_year??year,
      actor_id:String(event.actor_id),
      actor_role:"—",
      action:String(event.event_type),
      return_version:"—",
      human_record:String(event.review_note??"—"),
      data_state:String(event.new_status??event.previous_status??"—"),
      assessment:"—",
      access_record:"—",
      classification_version:"—",
      rule_config_version:"—",
    } as TableRow;
  });
}
