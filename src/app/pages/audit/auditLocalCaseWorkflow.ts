import type { TableRow } from "../modulePageUtils";
import { getAuditCandidates, type AuditCandidateRecord } from "./auditCandidateStore";
import { isSharedAuditMode } from "./auditSharedSql";

/**
 * Complete, local-only Audit case actions for the Office prototype.
 * Does not create officer identities or touch a hosted taxpayer database.
 * Every transition writes the candidate and its trace as one recoverable operation.
 */
const WORKFLOW_KEY = "nbr-audit-local-case-workflow-v1";
const CANDIDATE_KEY = "nbr-audit-candidates-v3";

export interface LocalAuditEvidence {
  id: string;
  signal: string;
  reference: string;
  note: string;
  verification: "Pending" | "Verified";
  verification_note?: string;
  attachment?: { name: string; mime: string; dataUrl: string };
  recorded_at: string;
}
export interface LocalAuditFinding {
  summary: string;
  signal_codes: string[];
  evidence_ids: string[];
  submitted_at: string;
  superseded?: boolean;
}
export interface LocalAuditReview {
  action: "sign_off" | "request_rework";
  note: string;
  reviewed_at: string;
}
export interface LocalAuditCase {
  candidate_id: string;
  return_id: string;
  assessment_year: string;
  revision: number;
  evidence: LocalAuditEvidence[];
  findings: LocalAuditFinding[];
  reviews: LocalAuditReview[];
  events: TableRow[];
}
type WorkflowRegistry = Record<string, LocalAuditCase>;

function ensureStorage() {
  if (isSharedAuditMode() || typeof window === "undefined" || !window.localStorage) {
    throw new Error("This action is only available in the local Audit workspace");
  }
}
function registry(): WorkflowRegistry {
  ensureStorage();
  const raw = localStorage.getItem(WORKFLOW_KEY);
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Audit case history could not be loaded");
  }
  return parsed as WorkflowRegistry;
}
function currentCandidate(candidateId: string): AuditCandidateRecord {
  const candidate = getAuditCandidates().find((row) => row.candidate_id === candidateId);
  if (!candidate) throw new Error("Audit candidate not found. Refresh the selected case");
  return candidate;
}
function empty(candidate: AuditCandidateRecord): LocalAuditCase {
  return { candidate_id: candidate.candidate_id, return_id: candidate.return_id,
    assessment_year: candidate.assessment_year, revision: 0, evidence: [], findings: [],
    reviews: [], events: [] };
}
export function getLocalAuditCase(candidateId: string): LocalAuditCase {
  const candidate = currentCandidate(candidateId);
  const loaded = registry()[candidateId];
  return loaded ? { ...empty(candidate), ...loaded } : empty(candidate);
}
function signalCodes(candidate: AuditCandidateRecord): string[] {
  return [...new Set(String(candidate.signals ?? "").match(/R-[A-E]\d/g) ?? [])];
}
function noteText(value: string, minimum: number, maximum: number): string {
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (cleaned.length < minimum || cleaned.length > maximum) {
    throw new Error(`Provide a specific note between ${minimum} and ${maximum} characters`);
  }
  return cleaned;
}
function uniqueId(prefix: string, seq: number) {
  return `LOCAL-${prefix}-${Date.now()}-${seq}`;
}
function appendEvent(
  state: LocalAuditCase, candidate: AuditCandidateRecord, action: string, note: string,
): LocalAuditCase {
  const at = new Date().toISOString();
  const id = uniqueId("AUDIT", state.revision + 1);
  const event: TableRow = {
    id, event_id: id, timestamp_utc: at.replace("T", " ").slice(0, 19) + " UTC",
    assessment_year: candidate.assessment_year, return_id: candidate.return_id,
    return_version: "—", actor_id: "audit-workspace", actor_role: "Audit workspace",
    action, data_state: "Saved on this device", assessment: candidate.audit_status,
    human_record: note, access_record: "—", classification_version: "—",
    rule_config_version: "—",
  };
  return { ...state, revision: state.revision + 1, events: [...state.events, event] };
}
function persist(
  candidate: AuditCandidateRecord, state: LocalAuditCase,
  nextStatus?: "Ready for Review" | "Verifying" | "Closed",
): LocalAuditCase {
  ensureStorage();
  const source = registry();
  // Reject stale browser tabs, rather than overwriting another decision.
  if ((source[candidate.candidate_id]?.revision ?? 0) !== state.revision - 1) {
    throw new Error("Audit case changed. Refresh before recording another action");
  }
  const next = { ...source, [candidate.candidate_id]: state };
  const oldWorkflow = localStorage.getItem(WORKFLOW_KEY);
  const oldCandidates = localStorage.getItem(CANDIDATE_KEY);
  const candidates = nextStatus
    ? getAuditCandidates().map((row) => row.candidate_id === candidate.candidate_id
      ? { ...row, audit_status: nextStatus, local_status_updated_at: new Date().toISOString() } : row)
    : [];
  // Ensure the submitted case status is still current.
  const fresh = currentCandidate(candidate.candidate_id);
  if (fresh.audit_status !== candidate.audit_status) {
    throw new Error("Audit status changed. Refresh the case before submitting");
  }
  try {
    localStorage.setItem(WORKFLOW_KEY, JSON.stringify(next));
    if (nextStatus) localStorage.setItem(CANDIDATE_KEY, JSON.stringify(candidates));
    const check = registry()[candidate.candidate_id];
    if (check?.revision !== state.revision ||
      (nextStatus && currentCandidate(candidate.candidate_id).audit_status !== nextStatus)) {
      throw new Error("Audit write could not be read back");
    }
  } catch {
    try {
      if (oldWorkflow === null) localStorage.removeItem(WORKFLOW_KEY);
      else localStorage.setItem(WORKFLOW_KEY, oldWorkflow);
      if (oldCandidates === null) localStorage.removeItem(CANDIDATE_KEY);
      else localStorage.setItem(CANDIDATE_KEY, oldCandidates);
    } catch {
      // Never report success when rollback is not independently confirmed.
    }
    throw new Error("Audit case could not be saved and verified on this device");
  }
  window.dispatchEvent(new Event("nbr-audit-local-case-updated"));
  return state;
}
function attachmentCheck(attachment?: LocalAuditEvidence["attachment"]) {
  if (!attachment) return;
  if (!attachment.name.trim() || !["application/pdf","image/png","image/jpeg"].includes(attachment.mime) ||
    !attachment.dataUrl.startsWith("data:" + attachment.mime + ";base64,") ||
    attachment.dataUrl.length > 2_000_000) {
    throw new Error("Attach a PDF/JPG/PNG smaller than 1.5 MB");
  }
}
export function recordLocalAuditEvidence(
  candidateId: string, signal: string, reference: string, note: string,
  attachment?: LocalAuditEvidence["attachment"],
): LocalAuditCase {
  const candidate = currentCandidate(candidateId);
  if (candidate.audit_status === "Closed" || candidate.audit_status === "Not Started") {
    throw new Error("Assign this candidate before recording evidence");
  }
  if (!signalCodes(candidate).includes(signal)) throw new Error("Select a signal belonging to this taxpayer");
  const ref = reference.trim();
  if (ref.length < 5 || ref.length > 500) throw new Error("Provide a document reference (5–500 characters)");
  const reason = noteText(note, 10, 1000);
  attachmentCheck(attachment);
  const state = getLocalAuditCase(candidateId);
  const item: LocalAuditEvidence = {
    id: uniqueId("EVIDENCE", state.revision + 1), signal, reference: ref, note: reason,
    verification: "Pending", attachment, recorded_at: new Date().toISOString(),
  };
  const updated = appendEvent({ ...state, evidence: [...state.evidence, item] },
    candidate, "Evidence recorded: " + signal + " · " + ref, reason);
  return persist(candidate, updated);
}
export function verifyLocalAuditEvidence(
  candidateId: string, evidenceId: string, note: string,
): LocalAuditCase {
  const candidate = currentCandidate(candidateId);
  if (candidate.audit_status === "Closed") throw new Error("Closed Audit evidence cannot be changed");
  const state = getLocalAuditCase(candidateId);
  const item = state.evidence.find((row) => row.id === evidenceId);
  if (!item || item.verification !== "Pending") throw new Error("Pending evidence record not found");
  const reason = noteText(note, 10, 1000);
  const updated = appendEvent({ ...state, evidence: state.evidence.map((row) =>
    row.id === evidenceId ? { ...row, verification: "Verified" as const, verification_note: reason } : row) },
    candidate, "Evidence verified: " + item.signal + " · " + item.reference, reason);
  return persist(candidate, updated);
}
export function submitLocalAuditFinding(candidateId: string, summary: string): LocalAuditCase {
  const candidate = currentCandidate(candidateId);
  if (!["Verifying","Evidence Pending","Ready for Review"].includes(candidate.audit_status)) {
    throw new Error("Complete the verification stage before submitting a Finding");
  }
  const state = getLocalAuditCase(candidateId);
  const required = signalCodes(candidate);
  if (!required.length) throw new Error("A Finding requires a calculated risk signal");
  const verified = state.evidence.filter((row) => row.verification === "Verified");
  if (!required.every((signal) => verified.some((row) => row.signal === signal))) {
    throw new Error("Verify supporting evidence for every calculated risk signal");
  }
  const text = noteText(summary, 20, 2000);
  const finding: LocalAuditFinding = {
    summary: text, signal_codes: required, evidence_ids: verified.map((row) => row.id),
    submitted_at: new Date().toISOString(),
  };
  const updated = appendEvent({ ...state, findings: [...state.findings, finding] },
    candidate, "Finding submitted: " + required.join(", "), text);
  return persist(candidate, updated, "Ready for Review");
}
export function decideLocalAuditReview(
  candidateId: string, action: "sign_off" | "request_rework", note: string,
): LocalAuditCase {
  const candidate = currentCandidate(candidateId);
  if (!["Ready for Review","Second Review"].includes(candidate.audit_status)) {
    throw new Error("Candidate is not ready for second review");
  }
  const state = getLocalAuditCase(candidateId);
  const finding = [...state.findings].reverse().find((row) => !row.superseded);
  if (!finding) throw new Error("Submit a verified Finding before second review");
  if (!finding.signal_codes.every((signal) => finding.evidence_ids.some((id) =>
    state.evidence.some((row) => row.id === id && row.signal === signal &&
      row.verification === "Verified")))) {
    throw new Error("All Finding signals require verified evidence");
  }
  const reason = noteText(note, 20, 2000);
  if (/^reviewed( and approved)?\.?$/i.test(reason)) {
    throw new Error("Give a specific evidence-based review reason");
  }
  const review: LocalAuditReview = { action, note: reason, reviewed_at: new Date().toISOString() };
  const updated = appendEvent({
    ...state,
    reviews: [...state.reviews, review],
    findings: action === "request_rework"
      ? state.findings.map((row) => row === finding ? { ...row, superseded: true } : row)
      : state.findings,
  }, candidate, action === "sign_off" ? "Second review signed off" : "Second review requested rework", reason);
  return persist(candidate, updated, action === "sign_off" ? "Closed" : "Verifying");
}
export function getLocalAuditWorkflowEvents(assessmentYear?: string): TableRow[] {
  if (isSharedAuditMode() || typeof window === "undefined") return [];
  return Object.values(registry()).flatMap((state) => state.events || []).filter((row) =>
    !assessmentYear || String(row.assessment_year) === assessmentYear);
}
