import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ResponsiveTable } from "../../components/tables/ResponsiveTable";
import { DynamicDetailsDrawer } from "../../components/drawers/DynamicDetailsDrawer";
import { Pagination } from "../../components/shared/Pagination";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { AppSearchField } from "../../components/forms/AppSearchField";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import { fc, type TableRow } from "../modulePageUtils";
import type { RulesAuthenticatedReadClient } from "./RulesAuthenticatedSqlView";
import type { SqlRuleRecord, SqlYear } from "../../services/nbrRulesAdminReadClient";

/** Metadata difference is evidence of changed stored records, never a legal-amendment finding. */
export interface ObservedYearDifference {
  ruleId:string; base:SqlRuleRecord|null; target:SqlRuleRecord|null;
  identityState:"BOTH"|"BASE_ONLY"|"TARGET_ONLY";
  recordedDifference:"NONE"|"RECORDED_METADATA_DIFFERENCE"|"NO_SECOND_YEAR_RECORD";
}
function canonicalJson(value:unknown):string {
  if (Array.isArray(value)) return "["+value.map(canonicalJson).join(",")+"]";
  if(value && typeof value==="object") {
    const data=value as Record<string,unknown>;
    return "{"+Object.keys(data).sort().map(k=>JSON.stringify(k)+":"+canonicalJson(data[k])).join(",")+"}";
  }
  return JSON.stringify(value)??"null";
}
export function compareObservedSqlYears(base:SqlRuleRecord[],target:SqlRuleRecord[]):ObservedYearDifference[] {
  const a=new Map(base.map(rule=>[rule.rule_id,rule]));
  const b=new Map(target.map(rule=>[rule.rule_id,rule]));
  const keys=[...new Set([...a.keys(),...b.keys()])].sort();
  return keys.map(ruleId=>{
    const first=a.get(ruleId)??null, second=b.get(ruleId)??null;
    if(!first||!second)return {ruleId,base:first,target:second,
      identityState:first?"BASE_ONLY":"TARGET_ONLY" as "BASE_ONLY"|"TARGET_ONLY",
      recordedDifference:"NO_SECOND_YEAR_RECORD" as const};
    const firstBody={...first};delete (firstBody as Partial<SqlRuleRecord>)._backend;
    const secondBody={...second};delete (secondBody as Partial<SqlRuleRecord>)._backend;
    const metadataSame=first._backend.groupId===second._backend.groupId &&
      first._backend.executionStatus===second._backend.executionStatus &&
      first._backend.yearApplicabilityStatus===second._backend.yearApplicabilityStatus &&
      canonicalJson(firstBody)===canonicalJson(secondBody);
    return {ruleId,base:first,target:second,identityState:"BOTH" as const,
      recordedDifference:metadataSame?"NONE" as const:"RECORDED_METADATA_DIFFERENCE" as const};
  });
}
export function RulesAuthenticatedYearComparison({client}: {client:RulesAuthenticatedReadClient}) {
  const {i18n}=useTranslation();
  const bn=i18n.language.startsWith("bn");
  const tr=(a:string,b:string)=>bn?b:a;
  const [baseYear,setBaseYear]=useState("2026-27");
  const [targetYear,setTargetYear]=useState("2027-28");
  const [years,setYears]=useState<SqlYear[]>([]);
  const [baseRules,setBaseRules]=useState<SqlRuleRecord[]>([]);
  const [targetRules,setTargetRules]=useState<SqlRuleRecord[]>([]);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [refresh,setRefresh]=useState(0);
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(1);
  const [perPage,setPerPage]=useState(25);
  const [detail,setDetail]=useState<TableRow|null>(null);
  useEffect(()=>{
    let mounted=true;setLoading(true);setError("");setDetail(null);
    (async()=>{
      try{
        const y=await client.getYears();
        const [a,b]=await Promise.all([
          client.getAllRules(baseYear),client.getAllRules(targetYear),
        ]);
        if(mounted){setYears(y);setBaseRules(a);setTargetRules(b);}
      }catch(e){if(mounted)setError(e instanceof Error?e.message:String(e));}
      finally{if(mounted)setLoading(false);}
    })();
    return()=>{mounted=false;};
  },[client,baseYear,targetYear,refresh]);
  const differences=useMemo(()=>compareObservedSqlYears(baseRules,targetRules),[baseRules,targetRules]);
  const filtered=useMemo(()=>differences.filter(item=>!search.trim()||
    [item.ruleId,item.base?._backend.yearApplicabilityStatus||"",item.target?._backend.yearApplicabilityStatus||""]
      .join(" ").toLowerCase().includes(search.toLowerCase())),[differences,search]);
  const rows:TableRow[]=filtered.map(item=>({
    id:item.ruleId,rule_id:item.ruleId,
    before_status:item.base?._backend.yearApplicabilityStatus??"NOT RECORDED",
    after_status:item.target?._backend.yearApplicabilityStatus??"NOT RECORDED",
    difference:item.recordedDifference==="NONE"?tr("Same stored metadata","একই সংরক্ষিত তথ্য"):
      item.recordedDifference==="NO_SECOND_YEAR_RECORD"?tr("Only one year recorded","এক বর্ষে রেকর্ড রয়েছে"):
        tr("Stored metadata differs — law NOT VERIFIED","সংরক্ষিত তথ্য ভিন্ন — আইন অযাচাইকৃত"),
    from_version:item.base?._backend.versionId??"NOT RECORDED",
    to_version:item.target?._backend.versionId??"NOT RECORDED",
    from_revision:item.base?._backend.revisionNo??"NOT RECORDED",
    to_revision:item.target?._backend.revisionNo??"NOT RECORDED",
    from_execution:item.base?._backend.executionStatus??"NOT RECORDED",
    to_execution:item.target?._backend.executionStatus??"NOT RECORDED",
    from_source:item.base?.canonical_source_ref??item.base?.legal_source??"NOT RECORDED",
    to_source:item.target?.canonical_source_ref??item.target?.legal_source??"NOT RECORDED",
    review_state:tr("INDEPENDENT LEGAL REVIEW OPEN","স্বাধীন আইনি যাচাই বাকি"),
  }));
  return <section className="rules-engine__section" aria-label={tr("Authenticated SQL year comparison","অনুমোদিত SQL করবর্ষ তুলনা")}>
    <h2 className="rules-engine__heading">{tr("Recorded year-version comparison","সংরক্ষিত বর্ষ-সংস্করণ তুলনা")}</h2>
    <p className="rules-engine__scope">{tr(
      "Authenticated SQL versions. A recorded metadata difference is not proof of an amendment, repeal, effective date, savings or entitlement.",
      "অনুমোদিত SQL সংস্করণ। সংরক্ষিত তথ্যের পার্থক্য সংশোধন, রহিত, কার্যকারিতা, সংরক্ষণ বা কর-সুবিধার প্রমাণ নয়।")}</p>
    <div className="rules-engine__filters">
      <AppSelectField id="sql-compare-base" compact label={tr("Base assessment year","পূর্ব করবর্ষ")}
        value={baseYear} onChange={v=>{setBaseYear(v);setPage(1);}}
        sortOptions options={years.map(y=>({value:y.assessmentYear,label:y.assessmentYear}))}/>
      <AppSelectField id="sql-compare-target" compact label={tr("Target assessment year","পরের করবর্ষ")}
        value={targetYear} onChange={v=>{setTargetYear(v);setPage(1);}}
        sortOptions options={years.map(y=>({value:y.assessmentYear,label:y.assessmentYear}))}/>
      <SecondaryButton size="sm" onClick={()=>setRefresh(n=>n+1)}>{tr("Refresh server versions","সার্ভারের সংস্করণ পুনরায় আনুন")}</SecondaryButton>
    </div>
    {loading&&<p role="status">{tr("Reading both SQL years…","দুই বর্ষের SQL পড়া হচ্ছে…")}</p>}
    {error&&<p role="alert">{tr("Authenticated comparison failed; no archival fallback substituted: ","অনুমোদিত তুলনা ব্যর্থ; পুরোনো তথ্য ব্যবহার হয়নি: ")}{error}</p>}
    {!loading&&!error&&<>
      <div className="rules-engine__filters"><AppSearchField label={tr("Search rule IDs and statuses","বিধি ও অবস্থা খুঁজুন")}
        value={search} onChange={v=>{setSearch(v);setPage(1);}}/></div>
      <p aria-live="polite">{filtered.length} {tr("stored identities compared; legal verification OPEN","টি সংরক্ষিত পরিচয় তুলনা; আইনি যাচাই বাকি")}</p>
      <ResponsiveTable aria-label={tr("Side-by-side authenticated year records","দুই বর্ষের SQL রেকর্ড")}
        cols={[fc("rule_id",tr("Rule ID","বিধি আইডি")),
          fc("before_status",tr("From year","পূর্ব বর্ষ")),
          fc("after_status",tr("To year","পরের বর্ষ")),
          fc("difference",tr("Recorded difference","সংরক্ষিত পার্থক্য"))]}
        rows={rows.slice((page-1)*perPage,page*perPage)}
        mobileCardMapping={{primary:"rule_id",meta:["before_status","after_status","difference"]}}
        onRowClick={setDetail}/>
      <div className="table-card__pagination"><Pagination page={page} total={rows.length} perPage={perPage}
        onPage={setPage} perPageOptions={[10,25,50]}
        onPerPageChange={value=>{setPerPage(value);setPage(1);}}/></div>
    </>}
    <DynamicDetailsDrawer open={!!detail} onClose={()=>setDetail(null)}
      title={tr("Recorded version difference — not verified law","সংস্করণ পার্থক্য — যাচাইকৃত আইন নয়")}
      rowData={detail} showActions={false}
      columns={[
        {key:"rule_id",label:"Rule ID",groupLabel:"Identity"},
        {key:"from_version",label:"Source SQL version UUID",groupLabel:"Before"},
        {key:"from_revision",label:"Source revision",groupLabel:"Before"},
        {key:"before_status",label:"Source applicability",groupLabel:"Before"},
        {key:"from_execution",label:"Source execution label",groupLabel:"Before"},
        {key:"from_source",label:"Source reference",groupLabel:"Before"},
        {key:"to_version",label:"Target SQL version UUID",groupLabel:"After"},
        {key:"to_revision",label:"Target revision",groupLabel:"After"},
        {key:"after_status",label:"Target applicability",groupLabel:"After"},
        {key:"to_execution",label:"Target execution label",groupLabel:"After"},
        {key:"to_source",label:"Target source reference",groupLabel:"After"},
        {key:"difference",label:"Recorded difference",groupLabel:"Review"},
        {key:"review_state",label:"Legal verification",groupLabel:"Review"},
      ]}/>
  </section>;
}
