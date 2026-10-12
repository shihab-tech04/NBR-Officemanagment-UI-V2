import type { TableRow } from "../modulePageUtils";
import { ALL_TAXPAYER_ROWS } from "./auditData";

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
    window.localStorage.setItem(CANDIDATE_KEY, JSON.stringify(merged));
    return merged;
  }

  try {
    const parsed = JSON.parse(raw) as AuditCandidateRecord[];
    if (!Array.isArray(parsed)) return seeded;
    return parsed.map(normalizeCandidate);
  } catch {
    return seeded;
  }
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
  const existing = getAuditCandidates();
  const selectedOn = new Date().toISOString().slice(0, 10);
  const batchToken = Date.now().toString();
  const batchId = `AUD-${meta.assessmentYear.replace(/[^0-9]/g, "")}-${batchToken.slice(-6)}`;

  const additions = rows.map((row, index): AuditCandidateRecord => ({
      candidate_id: `AC-${meta.assessmentYear.replace(/[^0-9]/g, "").slice(0, 4)}-${batchToken.slice(-6)}-${String(index + 1).padStart(3, "0")}`,
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
  if (canUseStorage()) window.localStorage.setItem(CANDIDATE_KEY, JSON.stringify(next));
  return next;
}
