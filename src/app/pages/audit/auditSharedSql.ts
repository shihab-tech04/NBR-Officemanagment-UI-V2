/**
 * Authenticated Audit SQL transport. It is deliberately opt-in until an officer
 * Auth + membership contract is approved and independently certified.
 *
 * No service-role key, app "admin" login, localStorage candidate cache or
 * third-party fallback may authorize an SQL operation. Supabase Auth + RLS do.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type { TableRow } from "../modulePageUtils";
import type { AuditCandidateRecord } from "./auditCandidateStore";

const MODE = import.meta.env.VITE_AUDIT_DATA_MODE;
export const isSharedAuditMode = () => MODE === "shared";
const allowedStatuses = new Set([
  "Not Started", "Assigned", "Verifying", "Evidence Pending",
  "Ready for Review", "Second Review", "Closed",
]);

type SqlMembership = {
  user_id: string; office_role: string; zone: string | null;
  circle: string | null; active: boolean;
};
type SqlCandidate = {
  id: string; batch_id: string; return_id: string; tin: string;
  taxpayer_name: string; assessment_year: string; zone: string; circle: string;
  coverage_tier: string; risk_level: string; data_quality: string;
  audit_status: string; signals: string[]; version: number;
  office_audit_batches: {
    external_batch_id: string; selection_track: string; selection_basis: string;
    funnel_rule: string; created_at: string; source_kind: string;
  } | null;
};
type RowMeta = {
  assessmentYear: string; zone: string; track: string; selectionBasis: string;
  funnelRule: string; populationConsidered: number; eligibleAfterReadiness: number;
  matchedCriteria: number; afterPreview: number; finalCandidates: number;
};
let sharedClient: SupabaseClient | null = null;

export function getAuditSqlClient(): SupabaseClient {
  if (!isSharedAuditMode()) throw new Error("Shared Audit is not enabled");
  const url = import.meta.env.VITE_OFFICE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_OFFICE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !/^https:\/\/[^/]+\.supabase\.co$/.test(url) ||
      !key || key.startsWith("sb_secret_") || key.includes("service_role")) {
    throw new Error("An approved Office Supabase project and publishable key are required");
  }
  if (!sharedClient) {
    sharedClient = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return sharedClient;
}

async function officer(): Promise<{ db: SupabaseClient; user: User; membership: SqlMembership }> {
  const db = getAuditSqlClient();
  // Unlike getSession(), getUser() validates Auth with the server.
  const { data: userData, error: authError } = await db.auth.getUser();
  if (authError || !userData.user || userData.user.is_anonymous) {
    throw new Error("Verified Office officer sign-in is required");
  }
  const { data, error } = await db.from("office_audit_memberships")
    .select("user_id,office_role,zone,circle,active")
    .eq("user_id", userData.user.id).eq("active", true).maybeSingle();
  if (error || !data?.active || data.user_id !== userData.user.id) {
    throw new Error("Active Audit officer membership is required");
  }
  return { db, user: userData.user, membership: data as SqlMembership };
}

export async function checkAuditSqlAccess(): Promise<{
  userId: string; role: string; zone: string | null; circle: string | null;
}> {
  const { user, membership } = await officer();
  return { userId: user.id, role: membership.office_role,
    zone: membership.zone, circle: membership.circle };
}

/** Pure source mapping: never reconstruct a legal finding from a SQL row. */
export function mapSqlAuditCandidate(row: SqlCandidate): AuditCandidateRecord {
  if (!row.office_audit_batches || row.office_audit_batches.source_kind !== "synthetic") {
    throw new Error("This Audit source kind has not been certified for the shared UI");
  }
  if (!row.return_id || !row.assessment_year || !row.batch_id) {
    throw new Error("Missing canonical candidate identity");
  }
  return {
    id: row.id,
    candidate_id: row.id, batch_id: row.office_audit_batches.external_batch_id,
    taxpayer_name: row.taxpayer_name, tin: row.tin, return_id: row.return_id,
    assessment_year: row.assessment_year, zone: row.zone, circle: row.circle,
    coverage_tier: row.coverage_tier, signals: row.signals.join(", "),
    risk_level: row.risk_level, control_flags: "", candidate_status: "Selected",
    audit_status: row.audit_status, selection_track: row.office_audit_batches.selection_track,
    selection_basis: row.office_audit_batches.selection_basis,
    data_quality: row.data_quality, funnel_rule: row.office_audit_batches.funnel_rule,
    population_considered: 0, eligible_after_readiness: 0,
    matched_criteria: 0, after_preview: 0, final_candidates: 0,
    selected_on: row.office_audit_batches.created_at.slice(0, 10),
  };
}

/** SQL is authoritative in shared mode. No seeded/local fallback on 401/403/500. */
export async function listSharedAuditCandidates(year?: string): Promise<AuditCandidateRecord[]> {
  const { db } = await officer();
  let query = db.from("office_audit_candidates")
    .select("id,batch_id,return_id,tin,taxpayer_name,assessment_year,zone,circle,coverage_tier,risk_level,data_quality,audit_status,signals,version,office_audit_batches!inner(external_batch_id,selection_track,selection_basis,funnel_rule,created_at,source_kind)")
    .order("created_at", { ascending: false }).limit(2000);
  if (year) query = query.eq("assessment_year", year);
  const { data, error } = await query;
  if (error) throw new Error(`Audit SQL read failed: ${error.message}`);
  return (data ?? []).map(item => mapSqlAuditCandidate(item as unknown as SqlCandidate));
}

function candidateInputs(rows: TableRow[], year: string, zone: string) {
  if (!rows.length || rows.length > 2000 || !year || !zone ||
      /all zones|সব.*জোন|^—$/i.test(zone)) {
    throw new Error("Choose one zone, assessment year and 1–2000 candidate rows");
  }
  const identities = new Set<string>();
  return rows.map(row => {
    const assessment = String(row.assessment_year ?? year);
    const circle = String(row.circle ?? "");
    const item = {
      return_id: String(row.return_id ?? ""), tin: String(row.tin ?? ""),
      taxpayer_name: String(row.taxpayer_name ?? ""),
      circle, coverage_tier: String(row.coverage_tier ?? ""),
      risk_level: String(row.risk_level ?? ""),
      signals: Array.from(new Set(String(row.signals ?? "").match(/R-[A-E]\d/g) ?? [])),
      data_quality: String(row.data_quality ?? ""),
    };
    if (assessment !== year || !item.return_id || !item.tin ||
        !item.taxpayer_name || !circle || circle === "—" ||
        (row.zone && String(row.zone) !== zone)) {
      throw new Error("Candidate zone, year or identity does not match the batch");
    }
    const id = year + ":" + item.return_id;
    if (identities.has(id)) throw new Error("Duplicate return identity in Audit batch");
    identities.add(id);
    return item;
  });
}

export async function createSharedAuditBatch(
  rows: TableRow[], meta: RowMeta,
): Promise<AuditCandidateRecord[]> {
  const data = candidateInputs(rows, meta.assessmentYear, meta.zone);
  const { db, membership } = await officer();
  if (!["nbr_admin", "administrator"].includes(membership.office_role) &&
       membership.zone !== meta.zone) {
    throw new Error("Candidate zone is outside this officer's jurisdiction");
  }
  const externalId = `AUD-${meta.assessmentYear.replace(/\W/g, "")}-${crypto.randomUUID()}`;
  const { error } = await db.rpc("office_audit_create_batch", {
    p_external_batch_id: externalId, p_assessment_year: meta.assessmentYear,
    p_zone: meta.zone, p_selection_track: meta.track,
    p_selection_basis: meta.selectionBasis, p_funnel_rule: meta.funnelRule,
    p_candidates: data,
  });
  if (error) throw new Error(`Audit batch was not saved: ${error.message}`);
  // Read back through RLS. A successful HTTP write alone is not certification.
  const current = await listSharedAuditCandidates(meta.assessmentYear);
  const persisted = current.filter(item => item.batch_id === externalId);
  if (persisted.length !== data.length ||
      data.some(x => !persisted.some(y => y.return_id === x.return_id))) {
    throw new Error("Audit batch SQL read-back did not match the submitted candidates");
  }
  return persisted;
}

export async function changeSharedAuditStatus(
  candidateId: string, expectedVersion: number, nextStatus: string,
): Promise<void> {
  if (!allowedStatuses.has(nextStatus) || !Number.isInteger(expectedVersion) ||
      expectedVersion < 1) throw new Error("Invalid Audit status or version");
  const { db } = await officer();
  const { data, error } = await db.from("office_audit_candidates")
    .update({ audit_status: nextStatus }).eq("id", candidateId)
    .eq("version", expectedVersion).select("id,version,audit_status").maybeSingle();
  if (error || !data || data.audit_status !== nextStatus ||
      data.version !== expectedVersion + 1) {
    throw new Error("Audit status conflict or unauthorized change; reload the source");
  }
  // SQL trigger creates append-only evidence; never write event rows from browser.
}
