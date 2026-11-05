import { useEffect, useState } from "react";
import { getAuditCandidates, loadAuditCandidates, type AuditCandidateRecord } from "./auditCandidateStore";
import { isSharedAuditMode } from "./auditSharedSql";

/** Authoritative source-only hook. Shared-mode SQL failures never fall back to local records. */
export function useLoadedAuditCandidates(year:string): {
  candidates:AuditCandidateRecord[]; loading:boolean; error:string;
} {
  const shared=isSharedAuditMode();
  const [records,setRecords]=useState<AuditCandidateRecord[]>([]);
  const [loading,setLoading]=useState(shared);
  const [error,setError]=useState("");
  useEffect(()=>{
    if(!shared)return;
    let cancelled=false;
    setLoading(true);
    setError("");
    setRecords([]);
    void loadAuditCandidates(year).then(rows=>{
      if(!cancelled)setRecords(rows);
    }).catch(e=>{
      if(!cancelled){setRecords([]);setError(e instanceof Error?e.message:"Audit SQL source unavailable");}
    }).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[shared,year]);
  return {candidates:shared?records:getAuditCandidates(),loading:shared&&loading,error:shared?error:""};
}
