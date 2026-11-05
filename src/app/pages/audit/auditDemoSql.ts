/**
 * Shared synthetic Audit data. This is intentionally an open demo dataset:
 * no officer login or session is used and no non-demo table is queried.
 * The publishable key is public. The database only grants access to the
 * explicitly synthetic office_audit_demo_* tables.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TableRow } from "../modulePageUtils";
import type { AuditCandidateRecord } from "./auditCandidateStore";

const TABLE = "office_audit_demo_candidates";
const EVENTS = "office_audit_demo_events";
const CHANGED_EVENT = "office-audit-demo-changed";

type DemoSqlCandidate = {
  candidate_id: string;
  batch_id: string;
  assessment_year: string;
  return_id: string;
  record: AuditCandidateRecord;
  audit_status: string;
  last_note: string | null;
  revision: number;
  updated_at: string;
  source_kind: "synthetic";
};
type DemoSqlEvent = {
  event_id: string;
  candidate_id: string;
  assessment_year: string;
  return_id: string;
  from_status: string;
  to_status: string;
  note: string;
  occurred_at: string;
  source_kind: "synthetic";
};
let client: SupabaseClient | null = null;
let candidateSnapshot: AuditCandidateRecord[] = [];
let eventSnapshot: TableRow[] = [];
let loaded = false;
let pendingRead: Promise<AuditCandidateRecord[]> | null = null;

export function isAuditDemoMode(): boolean {
  return Boolean(import.meta.env.VITE_OFFICE_AUDIT_DEMO_URL &&
    import.meta.env.VITE_OFFICE_AUDIT_DEMO_PUBLISHABLE_KEY);
}

function getClient(): SupabaseClient {
  if (!isAuditDemoMode()) throw new Error("Shared synthetic Audit is not configured");
  if (!client) {
    const url = String(import.meta.env.VITE_OFFICE_AUDIT_DEMO_URL);
    const key = String(import.meta.env.VITE_OFFICE_AUDIT_DEMO_PUBLISHABLE_KEY);
    if (!/^https:\/\/[^/]+\.supabase\.co$/.test(url) || !key.startsWith("sb_publishable_")) {
      throw new Error("Invalid synthetic Audit database configuration");
    }
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

function normalizeCandidate(row: DemoSqlCandidate): AuditCandidateRecord {
  if (row.source_kind !== "synthetic" || row.record.return_id !== row.return_id) {
    throw new Error("Unexpected synthetic Audit record source");
  }
  return {
    ...row.record,
    audit_status: row.audit_status,
    demo_revision: row.revision,
    ...(row.revision > 1 ? { local_status_updated_at: row.updated_at } : {}),
  };
}

function normalizeEvent(row: DemoSqlEvent): TableRow {
  return {
    id: row.event_id,
    event_id: row.event_id,
    timestamp_utc: row.occurred_at.replace("T", " ").slice(0, 19) + " UTC",
    assessment_year: row.assessment_year,
    return_id: row.return_id,
    return_version: "—",
    actor_id: "demo-workspace",
    actor_role: "Demo workspace",
    action: `Candidate status: ${row.from_status} → ${row.to_status}`,
    data_state: "Shared synthetic database",
    assessment: row.to_status,
    human_record: row.note,
    access_record: "No login required",
    classification_version: "—",
    rule_config_version: "—",
  };
}

export function getAuditDemoCandidates(): AuditCandidateRecord[] {
  return candidateSnapshot;
}

export function getAuditDemoEvents(assessmentYear?: string): TableRow[] {
  return assessmentYear
    ? eventSnapshot.filter((r) => r.assessment_year === assessmentYear)
    : eventSnapshot;
}

export function hasLoadedAuditDemo(): boolean { return loaded; }

function notify() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function subscribeAuditDemo(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGED_EVENT, listener);
  return () => window.removeEventListener(CHANGED_EVENT, listener);
}

export async function loadAuditDemoCandidates(): Promise<AuditCandidateRecord[]> {
  if (pendingRead) return pendingRead;
  pendingRead = (async () => {
    const db = getClient();
    const [candidates, events] = await Promise.all([
      db.from(TABLE).select("candidate_id,batch_id,assessment_year,return_id,record,audit_status,last_note,revision,updated_at,source_kind").order("candidate_id"),
      db.from(EVENTS).select("event_id,candidate_id,assessment_year,return_id,from_status,to_status,note,occurred_at,source_kind").order("occurred_at", { ascending: true }),
    ]);
    if (candidates.error) throw new Error("Shared Audit candidates could not be loaded: " + candidates.error.message);
    if (events.error) throw new Error("Shared Audit history could not be loaded: " + events.error.message);
    candidateSnapshot = ((candidates.data ?? []) as DemoSqlCandidate[]).map(normalizeCandidate);
    eventSnapshot = ((events.data ?? []) as DemoSqlEvent[]).map(normalizeEvent);
    loaded = true;
    notify();
    return candidateSnapshot;
  })();
  try { return await pendingRead; }
  finally { pendingRead = null; }
}

export type DemoBatchMeta = {
  assessmentYear: string; zone: string; track: string; selectionBasis: string;
  funnelRule: string; populationConsidered: number; eligibleAfterReadiness: number;
  matchedCriteria: number; afterPreview: number; finalCandidates: number;
};

export function makeAuditDemoBatch(rows: TableRow[], meta: DemoBatchMeta): AuditCandidateRecord[] {
  if (!rows.length) throw new Error("Select at least one Audit candidate");
  if (!meta.assessmentYear.trim() || !meta.zone.trim()) throw new Error("Assessment year and Zone are required");
  const ids = rows.map((row) => String(row.return_id ?? ""));
  if (ids.some((id) => !/^RET-2026-\d+$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error("Select unique dummy return records");
  }
  const token = crypto.randomUUID();
  const batchId = `AUD-${meta.assessmentYear.replace(/[^0-9]/g, "")}-${token}`;
  const selectedOn = new Date().toISOString().slice(0, 10);
  return rows.map((row, i) => ({
    candidate_id: `AC-${meta.assessmentYear.replace(/[^0-9]/g, "")}-${token}-${String(i + 1).padStart(3, "0")}`,
    batch_id: batchId,
    taxpayer_name: String(row.taxpayer_name ?? "—"),
    tin: String(row.tin ?? "—"),
    return_id: String(row.return_id),
    assessment_year: meta.assessmentYear,
    zone: meta.zone,
    circle: String(row.circle ?? "—"),
    coverage_tier: String(row.coverage_tier ?? "—"),
    signals: String(row.signals ?? "—"),
    risk_level: String(row.risk_level ?? "Not determined"),
    control_flags: String(row.control_flags ?? "—"),
    candidate_status: "Selected",
    audit_status: "Not Started",
    selection_track: meta.track,
    selection_basis: meta.selectionBasis,
    data_quality: String(row.data_quality ?? "—"),
    funnel_rule: meta.funnelRule,
    population_considered: meta.populationConsidered,
    eligible_after_readiness: meta.eligibleAfterReadiness,
    matched_criteria: meta.matchedCriteria,
    after_preview: meta.afterPreview,
    final_candidates: meta.finalCandidates,
    selected_on: selectedOn,
  }));
}

/** Database acknowledgement and second SQL readback are required for success. */
export async function saveAuditDemoBatch(rows: TableRow[], meta: DemoBatchMeta): Promise<AuditCandidateRecord[]> {
  const created = makeAuditDemoBatch(rows, meta);
  const db = getClient();
  const existing = await loadAuditDemoCandidates();
  const existingKeys = new Set(existing.map((r) => r.assessment_year + "|" + r.return_id));
  if (created.some((r) => existingKeys.has(r.assessment_year + "|" + r.return_id))) {
    throw new Error("One or more dummy returns have already been selected");
  }
  const inserts = created.map((record) => ({
    candidate_id: record.candidate_id,
    batch_id: record.batch_id,
    assessment_year: record.assessment_year,
    return_id: record.return_id,
    record,
    audit_status: record.audit_status,
    source_kind: "synthetic",
  }));
  const { data, error } = await db.from(TABLE).insert(inserts).select("candidate_id");
  if (error) throw new Error("Candidate batch was not saved: " + error.message);
  if (data?.length !== created.length) throw new Error("Database did not confirm every selected candidate");
  const fresh = await loadAuditDemoCandidates();
  if (!created.every((r) => fresh.some((item) => item.candidate_id === r.candidate_id))) {
    throw new Error("Audit candidate confirmation readback failed");
  }
  return created;
}

/** Versioned update with an automatic same-transaction SQL activity event. */
export async function updateAuditDemoStatus(
  candidateId: string, nextStatus: string, note: string,
): Promise<AuditCandidateRecord> {
  const normalizedNote = note.trim().replace(/\s+/g, " ");
  if (normalizedNote.length < 10 || normalizedNote.length > 500) {
    throw new Error("Provide a reason between 10 and 500 characters");
  }
  const candidates = await loadAuditDemoCandidates();
  const current = candidates.find((r) => r.candidate_id === candidateId);
  if (!current) throw new Error("This Audit candidate no longer exists; reload");
  const revision = Number(current.demo_revision ?? 1);
  const db = getClient();
  const { data, error } = await db.from(TABLE)
    .update({ audit_status: nextStatus, last_note: normalizedNote, revision: revision + 1 })
    .eq("candidate_id", candidateId).eq("revision", revision)
    .select("candidate_id,revision,audit_status");
  if (error) throw new Error("Audit status was not saved: " + error.message);
  if (!data || data.length !== 1 || data[0].audit_status !== nextStatus) {
    throw new Error("Audit status changed elsewhere. Reload and review the latest record");
  }
  const refreshed = await loadAuditDemoCandidates();
  const updated = refreshed.find((r) => r.candidate_id === candidateId);
  if (updated?.audit_status !== nextStatus ||
      !eventSnapshot.some((e) => e.return_id === updated.return_id &&
        String(e.action).endsWith("→ " + nextStatus) && e.human_record === normalizedNote)) {
    throw new Error("Status and Audit Trail could not both be verified");
  }
  return updated;
}
