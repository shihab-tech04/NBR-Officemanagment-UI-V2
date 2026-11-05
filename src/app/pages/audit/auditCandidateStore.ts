import type { TableRow } from "../modulePageUtils";
import { ALL_TAXPAYER_ROWS } from "./auditData";
import { createSharedAuditBatch, isSharedAuditMode, listSharedAuditCandidates } from "./auditSharedSql";
import { getAuditDemoCandidates, getAuditDemoEvents, isAuditDemoMode, loadAuditDemoCandidates, saveAuditDemoBatch, updateAuditDemoStatus } from "./auditDemoSql";

export interface AuditCandidateRecord extends TableRow {
  candidate_id: string;
  batch_id: string;
  taxpayer_name: string;
  tin: string;
  return_id: string;
  assessment_year: string;
  zone: string;
  circle: string;
  coverage_tier: string;
  signals: string;
  risk_level: string;
  control_flags: string;
  candidate_status: string;
  audit_status: string;
  selection_track: string;
  selection_basis: string;
  data_quality: string;
  funnel_rule: string;
  population_considered: number;
  eligible_after_readiness: number;
  matched_criteria: number;
  after_preview: number;
  final_candidates: number;
  selected_on: string;
}

const CANDIDATE_KEY = "nbr-audit-candidates-v3";
const LEGACY_CANDIDATE_KEYS = ["nbr-audit-candidates-v2", "nbr-audit-candidates-v1"];
const LEGACY_SEED_BATCH_IDS = new Set([
  "AUD-2026-RISK-01",
  "AUD-2026-RISK-02",
  "AUD-2026-CONTROL-01",
  "AUD-2026-POP-01",
  "AUD-2026-MANUAL-01",
  "AUD-2025-BASELINE",
]);

function canUseStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

type SeedBatch = {
  batchId: string;
  taxpayerIds: string[];
  track: string;
  selectionBasis: string;
  funnelRule: string;
  populationConsidered: number;
  eligibleAfterReadiness: number;
  matchedCriteria: number;
  afterPreview: number;
  selectedOn: string;
};

const SEED_BATCHES: SeedBatch[] = [
  {
    batchId: "AUD-2026-RISK-01",
    taxpayerIds: ["P1", "P15", "P18", "P20", "P21", "P25"],
    track: "Risk-based Audit",
    selectionBasis: "Risk-based · Circle-1, Circle-2, Circle-4 · Risk: High, Very High · Signals: R-C1, R-E1, R-E2, R-E3 · 25% · Min 4 · Max 10",
    funnelRule: "25% · Min 4 · Max 10",
    populationConsidered: 28,
    eligibleAfterReadiness: 25,
    matchedCriteria: 12,
    afterPreview: 9,
    selectedOn: "2026-10-02",
  },
  {
    batchId: "AUD-2026-RISK-02",
    taxpayerIds: ["P22", "P23", "P29", "P30", "P33", "P35"],
    track: "Risk-based Audit",
    selectionBasis: "Risk-based · Circle-1, Circle-2, Circle-3 · Risk: Medium, High, Very High · Signals: R-B1, R-B2, R-C1, R-C2, R-C3, R-E2, R-E3 · 10% · Min 5 · Max 12",
    funnelRule: "10% · Min 5 · Max 12",
    populationConsidered: 31,
    eligibleAfterReadiness: 29,
    matchedCriteria: 14,
    afterPreview: 11,
    selectedOn: "2026-09-28",
  },
  {
    batchId: "AUD-2026-POP-01",
    taxpayerIds: ["P5", "P11", "P13", "P16", "P17", "P31"],
    track: "Population / Circle-based Audit",
    selectionBasis: "Population selection · Circle-1, Circle-3, Circle-4 · Fixed 6",
    funnelRule: "Fixed 6",
    populationConsidered: 22,
    eligibleAfterReadiness: 19,
    matchedCriteria: 19,
    afterPreview: 10,
    selectedOn: "2026-09-18",
  },
  {
    batchId: "AUD-2026-MANUAL-01",
    taxpayerIds: ["P26", "P27", "P28", "P32", "P34", "P36"],
    track: "Manual Selection",
    selectionBasis: "Manual selection · Circle-2, Circle-3, Circle-4 · 6 selected returns",
    funnelRule: "6 selected returns",
    populationConsidered: 24,
    eligibleAfterReadiness: 21,
    matchedCriteria: 6,
    afterPreview: 6,
    selectedOn: "2026-09-12",
  },
  {
    batchId: "AUD-2025-BASELINE",
    taxpayerIds: ["P2", "P3", "P4", "P6", "P7", "P8"],
    track: "Existing audit plan",
    selectionBasis: "Existing audit plan · Circle-2, Circle-3, Circle-4 · Existing selected cases",
    funnelRule: "Existing audit plan",
    populationConsidered: 6,
    eligibleAfterReadiness: 6,
    matchedCriteria: 6,
    afterPreview: 6,
    selectedOn: "2026-09-01",
  },
];

function seedCandidates(): AuditCandidateRecord[] {
  const byId = new Map(
    ALL_TAXPAYER_ROWS.map((row) => [String(row.id ?? ""), row]),
  );

  return SEED_BATCHES.flatMap((batch) =>
    batch.taxpayerIds.flatMap((taxpayerId, index) => {
      const row = byId.get(taxpayerId);
      if (!row) return [];

      return [{
        candidate_id: `AC-${batch.batchId.replace(/^AUD-/, "")}-${String(index + 1).padStart(2, "0")}`,
        batch_id: batch.batchId,
        taxpayer_name: String(row.taxpayer_name ?? "—"),
        tin: String(row.tin ?? "—"),
        return_id: String(row.return_id ?? "—"),
        assessment_year: String(row.assessment_year ?? "2025-26"),
        zone: String(row.zone ?? "—"),
        circle: String(row.circle ?? "—"),
        coverage_tier: String(row.coverage_tier ?? "—"),
        signals: String(row.signals ?? "—"),
        risk_level: String(row.risk_level ?? "Not determined"),
        control_flags: String(row.control_flags ?? "—"),
        candidate_status: "Selected",
        audit_status: String(row.audit_state ?? "Not Started"),
        selection_track: batch.track,
        selection_basis: batch.selectionBasis,
        data_quality: String(row.data_quality ?? "—"),
        funnel_rule: batch.funnelRule,
        population_considered: batch.populationConsidered,
        eligible_after_readiness: batch.eligibleAfterReadiness,
        matched_criteria: batch.matchedCriteria,
        after_preview: batch.afterPreview,
        final_candidates: batch.taxpayerIds.length,
        selected_on: batch.selectedOn,
      } satisfies AuditCandidateRecord];
    }),
  );
}

function normalizeCandidate(item: AuditCandidateRecord): AuditCandidateRecord {
  return {
    ...item,
    zone: String(item.zone ?? "—"),
    data_quality: String(item.data_quality ?? "—"),
    funnel_rule: String(item.funnel_rule ?? item.selection_basis ?? "—"),
    population_considered: Number(item.population_considered ?? 0),
    eligible_after_readiness: Number(item.eligible_after_readiness ?? 0),
    matched_criteria: Number(item.matched_criteria ?? 0),
    after_preview: Number(item.after_preview ?? 0),
    final_candidates: Number(item.final_candidates ?? 0),
  };
}

export function getAuditCandidates(): AuditCandidateRecord[] {
  // The shared service is asynchronous; never pass local synthetic records off as SQL.
  if (isSharedAuditMode()) return [];
  if (isAuditDemoMode()) return getAuditDemoCandidates();
  const seeded = seedCandidates();
  if (!canUseStorage()) return seeded;

  const raw = window.localStorage.getItem(CANDIDATE_KEY);
  if (!raw) {
    let customLegacy: AuditCandidateRecord[] = [];

    for (const legacyKey of LEGACY_CANDIDATE_KEYS) {
      try {
        const legacyRaw = window.localStorage.getItem(legacyKey);
        if (!legacyRaw) continue;
        const legacy = JSON.parse(legacyRaw) as AuditCandidateRecord[];
        if (Array.isArray(legacy)) {
          customLegacy = legacy
            .filter((item) => !LEGACY_SEED_BATCH_IDS.has(String(item.batch_id ?? "")))
            .map(normalizeCandidate);
        }
        break;
      } catch {
        customLegacy = [];
      }
    }

    const seededIds = new Set(seeded.map((item) => item.candidate_id));
    const merged = [
      ...customLegacy.filter((item) => !seededIds.has(item.candidate_id)),
      ...seeded,
    ];
    try {
      window.localStorage.setItem(CANDIDATE_KEY, JSON.stringify(merged));
    } catch {
      // Read-only prototype access is possible even when storage is denied.
      // The explicit batch write path reports persistence failure instead.
    }
    return merged;
  }

  try {
    const parsed = JSON.parse(raw) as AuditCandidateRecord[];
    if (!Array.isArray(parsed)) return seeded;
    // An older empty/incomplete local cache must not hide source fixture batches.
    // Preserve custom candidates and any modified records by candidate ID.
    const normalized = parsed.map(normalizeCandidate);
    const existingIds = new Set(normalized.map((item) => item.candidate_id));
    const missing = seeded.filter((item) => !existingIds.has(item.candidate_id));
    const merged = [...normalized, ...missing];
    if (missing.length) {
      try {
        window.localStorage.setItem(CANDIDATE_KEY, JSON.stringify(merged));
      } catch {
        // Render the recovered records even if the browser storage is full.
      }
    }
    return merged;
  } catch {
    return seeded;
  }
}

export async function loadAuditCandidates(assessmentYear?:string):Promise<AuditCandidateRecord[]> {
  if (isSharedAuditMode()) return listSharedAuditCandidates(assessmentYear);
  if (isAuditDemoMode()) {
    const data = await loadAuditDemoCandidates();
    return data.filter((candidate) => !assessmentYear || candidate.assessment_year === assessmentYear);
  }
  return getAuditCandidates().filter(candidate => !assessmentYear || candidate.assessment_year === assessmentYear);
}

export async function saveAuditCandidates(
  rows: TableRow[],
  meta: Parameters<typeof addAuditCandidates>[1],
): Promise<AuditCandidateRecord[]> {
  if (isSharedAuditMode()) return createSharedAuditBatch(rows, meta);
  if (isAuditDemoMode()) return saveAuditDemoBatch(rows, meta);
  // A separate prototype mode is intentionally local-only and is never shared SQL.
  return addAuditCandidates(rows, meta);
}

const LOCAL_EVENT_KEY = "nbr-audit-local-status-events-v1";

const AUDIT_STATUS_TRANSITIONS: Record<string, string[]> = {
  "Not Started": ["Assigned"],
  "Assigned": ["Verifying"],
  "Verifying": ["Evidence Pending", "Ready for Review"],
  "Evidence Pending": ["Verifying", "Ready for Review"],
  "Ready for Review": ["Verifying", "Second Review"],
  "Second Review": ["Ready for Review", "Closed"],
  "Closed": [],
};

export function getNextLocalAuditStatuses(status: string): string[] {
  return [...(AUDIT_STATUS_TRANSITIONS[status] ?? [])];
}

export function getLocalAuditStatusEvents(assessmentYear?: string): TableRow[] {
  if (isAuditDemoMode()) return getAuditDemoEvents(assessmentYear);
  if (!canUseStorage() || isSharedAuditMode()) return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_EVENT_KEY);
    if (!raw) return [];
    const rows = JSON.parse(raw) as TableRow[];
    if (!Array.isArray(rows)) return [];
    return rows.filter((row) =>
      row && typeof row === "object" &&
      (!assessmentYear || String(row.assessment_year ?? "") === assessmentYear));
  } catch {
    return [];
  }
}

/**
 * Public-office candidate reviews are device-local drafts, not hosted decisions.
 * Require a traceable note, write status and event together and verify readback.
 * The protected SQL path is never replaced with this local fallback.
 */
export function changeLocalAuditCandidateStatus(
  candidateId: string, nextStatus: string, note: string,
): AuditCandidateRecord {
  if (isSharedAuditMode()) throw new Error("Device-local Audit status is unavailable for shared SQL records");
  if (!canUseStorage()) throw new Error("This browser does not support persistent Audit status changes");
  const details = note.trim().replace(/\s+/g, " ");
  if (details.length < 10 || details.length > 500) {
    throw new Error("Record a reason between 10 and 500 characters");
  }
  const current = getAuditCandidates();
  const index = current.findIndex((item) => item.candidate_id === candidateId);
  if (index < 0) throw new Error("Candidate not found. Reload and try again");
  const old = current[index];
  if (!getNextLocalAuditStatuses(old.audit_status).includes(nextStatus)) {
    throw new Error("Invalid Audit status transition. Reload the candidate");
  }
  const at = new Date().toISOString();
  const updated: AuditCandidateRecord = {
    ...old, audit_status: nextStatus, local_status_updated_at: at,
  };
  const changed = [...current];
  changed[index] = updated;
  const event: TableRow = {
    id: `LOCAL-${at}-${candidateId}`,
    event_id: `LOCAL-${Date.now()}`,
    timestamp_utc: at.replace("T", " ").slice(0, 19) + " UTC",
    assessment_year: old.assessment_year,
    return_id: old.return_id,
    return_version: "—",
    actor_id: "local-workspace",
    actor_role: "Local workspace",
    action: `Candidate status: ${old.audit_status} → ${nextStatus}`,
    data_state: "Saved on this device",
    assessment: nextStatus,
    human_record: details,
    access_record: "—",
    classification_version: "—",
    rule_config_version: "—",
  };
  const previousCandidates = window.localStorage.getItem(CANDIDATE_KEY);
  const previousEvents = window.localStorage.getItem(LOCAL_EVENT_KEY);
  try {
    const events = getLocalAuditStatusEvents();
    window.localStorage.setItem(CANDIDATE_KEY, JSON.stringify(changed));
    window.localStorage.setItem(LOCAL_EVENT_KEY, JSON.stringify([...events, event]));
    const check = JSON.parse(window.localStorage.getItem(CANDIDATE_KEY) ?? "[]") as AuditCandidateRecord[];
    const restoredEvents = getLocalAuditStatusEvents();
    if (check.find((item) => item.candidate_id === candidateId)?.audit_status !== nextStatus ||
        !restoredEvents.some((item) => item.id === event.id)) {
      throw new Error("Audit change did not persist");
    }
    return updated;
  } catch {
    // Prevent a status write without its explanatory event, or vice versa.
    try {
      if (previousCandidates === null) window.localStorage.removeItem(CANDIDATE_KEY);
      else window.localStorage.setItem(CANDIDATE_KEY, previousCandidates);
      if (previousEvents === null) window.localStorage.removeItem(LOCAL_EVENT_KEY);
      else window.localStorage.setItem(LOCAL_EVENT_KEY, previousEvents);
    } catch {
      // A storage failure may also prevent rollback. Never claim success.
    }
    throw new Error("Audit status could not be saved and verified on this device");
  }
}

/** Shared dummy-data mode writes through the SQL source; old local mode remains isolated. */
export async function changeAuditCandidateStatus(
  candidateId: string, nextStatus: string, note: string,
): Promise<AuditCandidateRecord> {
  if (isAuditDemoMode()) return updateAuditDemoStatus(candidateId, nextStatus, note);
  return changeLocalAuditCandidateStatus(candidateId, nextStatus, note);
}

export function addAuditCandidates(
  rows: TableRow[],
  meta: {
    assessmentYear: string;
    zone: string;
    track: string;
    selectionBasis: string;
    funnelRule: string;
    populationConsidered: number;
    eligibleAfterReadiness: number;
    matchedCriteria: number;
    afterPreview: number;
    finalCandidates: number;
  },
): AuditCandidateRecord[] {
  if (isSharedAuditMode()) throw new Error("Local Audit candidate writes are disabled in shared mode");
  // Prototype writes must not report success if there is no durable local store.
  if (!canUseStorage()) throw new Error("Audit storage is unavailable; no candidates were saved");
  if (!rows.length) throw new Error("Select at least one candidate");
  if (!meta.assessmentYear.trim() || !meta.zone.trim())
    throw new Error("Assessment year and Zone are required");
  const keys = rows.map((row) => `${meta.assessmentYear}|${String(row.return_id ?? "").trim()}`);
  if (keys.some((key) => key.endsWith("|")) || new Set(keys).size !== keys.length)
    throw new Error("Every candidate must have a unique return identity");
  const existing = getAuditCandidates();
  const existingKeys = new Set(existing.map((item) => `${item.assessment_year}|${item.return_id}`));
  if (keys.some((key) => existingKeys.has(key)))
    throw new Error("One or more returns are already selected for this assessment year");
  const selectedOn = new Date().toISOString().slice(0, 10);
  const batchToken = crypto.randomUUID();
  const batchId = `AUD-${meta.assessmentYear.replace(/[^0-9]/g, "")}-${batchToken}`;

  const additions = rows.map((row, index): AuditCandidateRecord => ({
      candidate_id: `AC-${meta.assessmentYear.replace(/[^0-9]/g, "").slice(0, 4)}-${batchToken}-${String(index + 1).padStart(3, "0")}`,
      batch_id: batchId,
      taxpayer_name: String(row.taxpayer_name ?? "—"),
      tin: String(row.tin ?? "—"),
      return_id: String(row.return_id ?? "—"),
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

  const next = [...additions, ...existing];
  try {
    window.localStorage.setItem(CANDIDATE_KEY, JSON.stringify(next));
    const saved = window.localStorage.getItem(CANDIDATE_KEY);
    const persisted = saved ? JSON.parse(saved) as AuditCandidateRecord[] : null;
    const savedIds = new Set(Array.isArray(persisted) ? persisted.map((item) => item.candidate_id) : []);
    if (!additions.every((item) => savedIds.has(item.candidate_id))) {
      throw new Error("Audit candidate read-back did not match the submitted batch");
    }
  } catch {
    throw new Error("Could not persist Audit candidates; please retry the operation");
  }
  return next;
}
