/* Protected Office Audit SQL transport. No prototype credential is trusted. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuditCandidateRecord } from "./auditCandidateStore";
import type { TableRow } from "../modulePageUtils";

const mode = import.meta.env.VITE_OFFICE_AUDIT_DATA_MODE;
const url = import.meta.env.VITE_OFFICE_SUPABASE_URL;
const key = import.meta.env.VITE_OFFICE_SUPABASE_PUBLISHABLE_KEY;
let instance: SupabaseClient | null = null;

export function isAuditSqlMode(): boolean { return mode === "sql"; }

async function verifiedOfficer(): Promise<SupabaseClient> {
  if (!isAuditSqlMode() || !url || !key) throw new Error("Office Audit SQL is not configured");
  instance ??= createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  const { data, error } = await instance.auth.getUser();
  if (error || !data.user) throw new Error("Verified Office officer session required");
  const membership = await instance.from("office_audit_memberships")
    .select("user_id,active").eq("user_id", data.user.id).eq("active", true).maybeSingle();
  if (membership.error || !membership.data) throw new Error("Active Office Audit role required");
  return instance;
}

export async function fetchSharedAuditCandidates(year: string): Promise<AuditCandidateRecord[]> {
  const db = await verifiedOfficer();
  const [candidates, batches] = await Promise.all([
    db.from("office_audit_candidates").select("*").eq("assessment_year", year)
      .order("created_at", { ascending: false }),
    db.from("office_audit_batches").select("*").eq("assessment_year", year),
  ]);
  if (candidates.error || batches.error) {
    throw new Error(candidates.error?.message || batches.error?.message || "Audit SQL read failure");
  }
  const batchById = new Map((batches.data ?? []).map(b => [b.id, b]));
  return (candidates.data ?? []).map(c => {
    const batch = batchById.get(c.batch_id);
    return {
      candidate_id:c.id, batch_id:c.batch_id, taxpayer_name:c.taxpayer_name,
      tin:c.tin, return_id:c.return_id, assessment_year:c.assessment_year,
      zone:c.zone, circle:c.circle, coverage_tier:c.coverage_tier,
      signals:(c.signals ?? []).join(", "), risk_level:c.risk_level,
      control_flags:"", candidate_status:"Selected", audit_status:c.audit_status,
      selection_track:batch?.selection_track ?? "",
      selection_basis:batch?.selection_basis ?? "", data_quality:c.data_quality,
      funnel_rule:batch?.funnel_rule ?? "",
      population_considered:0, eligible_after_readiness:0,
      matched_criteria:0, after_preview:0, final_candidates:0,
      selected_on:String(c.created_at ?? "").slice(0,10),
    } satisfies AuditCandidateRecord;
  });
}

export type SharedAuditBatchInput = {
  assessmentYear:string; zone:string; track:string; selectionBasis:string;
  funnelRule:string; rows:TableRow[];
};

export async function createSharedAuditBatch(input:SharedAuditBatchInput):Promise<string> {
  const db = await verifiedOfficer();
  if (!input.rows.length) throw new Error("Empty candidate batches are not allowed");
  const batchKey = "AUD-" + input.assessmentYear.replace(/[^0-9]/g,"")
    + "-" + crypto.randomUUID();
  const { data:batchId, error } = await db.rpc("office_audit_create_batch", {
    p_external_batch_id:batchKey, p_assessment_year:input.assessmentYear,
    p_zone:input.zone, p_selection_track:input.track,
    p_selection_basis:input.selectionBasis, p_funnel_rule:input.funnelRule,
    p_candidates:input.rows.map(row=>({
      return_id:String(row.return_id ?? ""), circle:String(row.circle ?? ""),
      tin:String(row.tin ?? ""), taxpayer_name:String(row.taxpayer_name ?? ""),
      coverage_tier:String(row.coverage_tier ?? ""),
      risk_level:String(row.risk_level ?? ""),
      data_quality:String(row.data_quality ?? ""),
      signals:String(row.signals ?? "").match(/R-[A-E]\d/g) ?? [],
    })),
  });
  if (error || typeof batchId !== "string") throw new Error(error?.message || "Batch was not committed");
  const check = await db.from("office_audit_candidates")
    .select("return_id,assessment_year,zone,version").eq("batch_id",batchId);
  if (check.error || check.data?.length !== input.rows.length) {
    throw new Error("Audit SQL read-back count does not match");
  }
  const expected = new Set(input.rows.map(row=>String(row.return_id ?? "")));
  if (expected.size !== input.rows.length ||
      !check.data.every(row=>row.assessment_year===input.assessmentYear
        && row.zone===input.zone && row.version===1 && expected.delete(row.return_id)) ||
      expected.size!==0) {
    throw new Error("Audit SQL read-back identity or year mismatch");
  }
  return batchId;
}

export async function fetchSharedScreeningRuns(year:string) {
  const db = await verifiedOfficer();
  const response = await db.from("office_audit_screening_runs")
    .select("id,assessment_year,zone,status,queued_at,finished_at,result_summary")
    .eq("assessment_year",year).order("queued_at",{ascending:false});
  if(response.error)throw new Error(response.error.message);
  return response.data ?? [];
}
