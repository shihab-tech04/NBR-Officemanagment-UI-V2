import type { TableRow } from "../modulePageUtils";
import { isSharedAuditMode } from "./auditSharedSql";
import { ALL_TAXPAYER_ROWS, CONTROL_ROWS } from "./auditData";

const KEY = "nbr-audit-local-control-reviews-v1";
export type ControlStatus = "Pending" | "In Progress" | "Under Review" | "Resolved";
export interface LocalAuditControlDecision {
  id: string; return_id: string; assessment_year: string; flag_id: string;
  status: ControlStatus; reason: string; recorded_at: string;
}
const allowed: Record<ControlStatus, ControlStatus[]> = {
  "Pending": ["In Progress", "Under Review"],
  "In Progress": ["Under Review","Resolved"],
  "Under Review": ["In Progress","Resolved"],
  "Resolved": ["Under Review"],
};
function read(): LocalAuditControlDecision[] {
  if (isSharedAuditMode() || typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Control review history is invalid");
  return parsed as LocalAuditControlDecision[];
}
export function getLocalAuditControls(): LocalAuditControlDecision[] {
  return read();
}
export function getLocalControlOptions(status: ControlStatus): ControlStatus[] {
  return allowed[status] ?? [];
}
export function getSourceAuditControls(assessmentYear: string): TableRow[] {
  if (isSharedAuditMode()) return [];
  const decisions = new Map(read().map((item) => [item.id, item]));
  const metadata = new Map(CONTROL_ROWS.map((row) => [String(row.flag_id), row]));
  return ALL_TAXPAYER_ROWS.filter((row) => String(row.assessment_year) === assessmentYear)
    .flatMap((row) => [...new Set(String(row.control_flags ?? "").match(/F[0-5]/g) ?? [])]
      .map((flag) => {
        const template = metadata.get(flag);
        const id = String(row.return_id) + "|" + flag;
        const decision = decisions.get(id);
        return {
          id, return_id: row.return_id, tin: row.tin,
          assessment_year: row.assessment_year, circle: row.circle,
          coverage_tier: row.coverage_tier, flag_id: flag,
          check: template?.check ?? "Review source control discrepancy",
          source: template?.source ?? "Return", dependency: template?.dependency ?? "Record review",
          queue: template?.queue ?? "Control",
          control_status: decision?.status ?? "Pending",
          control_reason: decision?.reason ?? "—",
        } satisfies TableRow;
      }));
}
export function saveLocalAuditControl(
  rowId: string, next: ControlStatus, reason: string,
): LocalAuditControlDecision {
  if (isSharedAuditMode() || typeof window === "undefined") {
    throw new Error("Audit control updates are not enabled in shared SQL mode");
  }
  const [returnId, flag] = rowId.split("|");
  const source = ALL_TAXPAYER_ROWS.find((row) => String(row.return_id) === returnId &&
    String(row.control_flags ?? "").match(/F[0-5]/g)?.includes(flag));
  if (!source || !flag || rowId !== returnId + "|" + flag) {
    throw new Error("Control does not belong to the selected taxpayer");
  }
  const current = read();
  const previous = current.filter((item) => item.id === rowId).at(-1);
  const status = previous?.status ?? "Pending";
  if (!getLocalControlOptions(status).includes(next)) {
    throw new Error("Invalid or repeated control status transition");
  }
  const clean = reason.trim().replace(/\s+/g," ");
  if (clean.length < 10 || clean.length > 500) {
    throw new Error("Enter a specific control review note of 10–500 characters");
  }
  const record: LocalAuditControlDecision = {
    id:rowId, return_id:returnId, flag_id:flag,
    assessment_year:String(source.assessment_year),status:next,
    reason:clean,recorded_at:new Date().toISOString(),
  };
  const raw = localStorage.getItem(KEY);
  try {
    localStorage.setItem(KEY,JSON.stringify([...current,record]));
    const saved = read();
    const latest = saved.at(-1);
    if (latest?.id !== rowId || latest.status !== next ||
      latest.reason !== clean) throw new Error("Control status was not verified");
  } catch {
    try {
      if (raw === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY,raw);
    } catch { /* Never claim a successful action after failed recovery. */ }
    throw new Error("Control review could not be saved and verified");
  }
  window.dispatchEvent(new Event("nbr-audit-local-case-updated"));
  return record;
}
export function getLocalAuditControlEvents(assessmentYear: string): TableRow[] {
  return read().filter((entry) => entry.assessment_year === assessmentYear)
    .map((entry,index) => ({
      id: "LOCAL-CONTROL-" + index + "-" + entry.recorded_at,
      event_id: "LOCAL-CONTROL-" + index,
      timestamp_utc: entry.recorded_at.replace("T"," ").slice(0,19) + " UTC",
      assessment_year:entry.assessment_year,return_id:entry.return_id,
      return_version:"—",actor_id:"audit-workspace",actor_role:"Audit workspace",
      action:"Control " + entry.flag_id + ": " + entry.status,
      data_state:"Saved on this device",assessment:entry.status,
      human_record:entry.reason,access_record:"—",
      classification_version:"—",rule_config_version:"—",
    }));
}
