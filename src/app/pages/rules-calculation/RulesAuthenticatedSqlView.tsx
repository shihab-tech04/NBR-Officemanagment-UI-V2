import { useEffect, useMemo, useState } from "react";
import { ResponsiveTable } from "../../components/tables/ResponsiveTable";
import { ResponsiveOverlay } from "../../components/shared/ResponsiveOverlay";
import { Pagination } from "../../components/shared/Pagination";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import { AppSearchField } from "../../components/forms/AppSearchField";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { fc, type TableRow } from "../modulePageUtils";
import type {
  createRulesAdminReadClient, SqlGate, SqlRuleDetail, SqlRuleGroup,
  SqlRuleRecord, SqlSummary, SqlYear,
} from "../../services/nbrRulesAdminReadClient";
import snapshot from "../../data/rulesSqlSnapshot.json";

export type RulesAuthenticatedReadClient = ReturnType<typeof createRulesAdminReadClient>;
type LiveView = "tax-years" | "rule-library" | "calculation-controls" | "validation-publish";
interface Props {
  client: RulesAuthenticatedReadClient;
  view: LiveView;
  year: string;
  bn: boolean;
  onOpenYear: (year: string) => void;
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "NOT RECORDED";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

const SOURCE_FIELDS = [
  "authority", "legal_source", "statutory_section", "evidence_references",
  "form_source", "canonical_source_ref", "canonical_origin_task",
];
const APPLICABILITY_FIELDS = [
  "taxpayer_type", "taxpayer_entity", "payer_type", "payee_type", "residence_status",
  "applicable_period", "ay_iy_applicability", "commencement_window",
  "cessation_expiry", "cohort_savings_version", "effective_from",
];
const CALCULATION_FIELDS = [
  "logic", "output", "formula_condition", "cap_formula", "rate",
  "compliance_conditions", "blocking_dependencies", "evidence_proof",
  "failure_behavior", "exemption_or_exception",
];
const STATUS_FIELDS = [
  "canonical_execution_status", "final_execution_disposition",
  "terminal_blocker_state", "final_execution_authorized", "unsafe_executable",
];

function DetailFieldGroup({
  title, data, keys,
}: { title: string; data: Record<string,unknown>; keys: string[] }) {
  const present = keys.filter(key => Object.prototype.hasOwnProperty.call(data, key));
  return <section className="rules-engine__detail-section">
    <h3>{title}</h3>
    {present.length === 0 ? <p>NOT RECORDED · OPEN</p> :
      <dl className="rules-engine__detail-grid">{present.map(key =>
        <div key={key}><dt>{key.replaceAll("_"," ")}</dt><dd>{display(data[key])}</dd></div>)}</dl>}
  </section>;
}

function ServerRuleDetails({
  detail, bn, onClose,
}: { detail: SqlRuleDetail | null; bn: boolean; onClose: () => void }) {
  if (!detail) return null;
  const version = detail.version;
  const data = version.rule_data;
  return <ResponsiveOverlay open onClose={onClose}
    closeLabel={bn ? "বিধির বিস্তারিত বন্ধ করুন" : "Close SQL rule details"}
    title={bn ? "SQL বিধি ও সংস্করণের বিবরণ" : "Authenticated SQL rule and revision"}
    desktopWidth="620px" className="rules-engine__details-dialog">
    <div className="rules-engine__detail">
      <div className="rules-engine__detail-intro"><div><h3>{version.rule_key}</h3>
        <p>{version.group_id}</p></div>
        <span className="rules-engine__detail-state">{version.year_applicability_status}</span></div>
      <p className="rules-engine__scope" role="status">{bn
        ? "এগুলো সার্ভারে সংরক্ষিত তথ্য; স্বাধীন আইনি/এজেন্ট সার্টিফিকেশন নয়।"
        : "Authenticated server record, NOT independent legal or Agent certification."}</p>
      <section className="rules-engine__detail-section">
        <h3>{bn ? "সংস্করণ ও করবর্ষ" : "Version and tax-year identity"}</h3>
        <dl className="rules-engine__detail-grid">
          <div><dt>Rule ID</dt><dd>{version.rule_key}</dd></div>
          <div><dt>Assessment year</dt><dd>{detail.year.assessment_year}</dd></div>
          <div><dt>Income year</dt><dd>{detail.year.income_year}</dd></div>
          <div><dt>SQL version UUID</dt><dd>{version.id}</dd></div>
          <div><dt>Revision</dt><dd>{version.revision_no}</dd></div>
          <div><dt>Current record</dt><dd>{String(version.is_current)}</dd></div>
          <div><dt>SQL execution label</dt><dd>{display(version.execution_status)}</dd></div>
          <div><dt>Replaces version UUID</dt><dd>{display(version.supersedes_version_id)}</dd></div>
          <div><dt>Source assessment year</dt><dd>{display(version.source_assessment_year)}</dd></div>
          <div><dt>Legal cutoff recorded</dt><dd>{display(detail.year.legal_cutoff)}</dd></div>
          <div><dt>Registry version</dt><dd>{display(detail.year.source_registry_version)}</dd></div>
          <div><dt>Admin grouping basis</dt><dd>{display(detail.identity?.grouping_basis)}</dd></div>
        </dl>
      </section>
      <DetailFieldGroup title={bn ? "আইনি উৎস ও মূল প্রমাণ" : "Recorded legal source/provision"} data={data} keys={SOURCE_FIELDS}/>
      <DetailFieldGroup title={bn ? "করদাতা, তারিখ ও প্রযোজ্যতা" : "Taxpayer, period, facts and exclusions"} data={data} keys={APPLICABILITY_FIELDS}/>
      <DetailFieldGroup title={bn ? "হিসাব, শর্ত ও ব্যর্থতা" : "Calculation, conditions and failure"} data={data} keys={CALCULATION_FIELDS}/>
      <DetailFieldGroup title={bn ? "সংরক্ষিত নিরাপত্তা অবস্থা" : "Stored safety status"} data={data} keys={STATUS_FIELDS}/>
      <section className="rules-engine__detail-section">
        <h3>{bn ? "পর্যালোচনা ও অডিট ইতিহাস" : "Recorded change requests and audit"}</h3>
        <p>{bn ? "সংরক্ষিত পরিবর্তন প্রস্তাব" : "Stored change requests"}: {detail.changes.length}</p>
        {detail.changes.map((change,i) => <p key={String(change.id || i)}>
          {display(change.status)} · {display(change.request_type)} · {display(change.requested_at)} · {display(change.review_note)}
        </p>)}
        <p>{bn ? "অডিট রেকর্ড" : "Audit events"}: {detail.audit.length}</p>
        {detail.audit.map((event,i) => <p key={String(event.id || i)}>
          {display(event.action)} · {display(event.occurred_at)}</p>)}
        <p className="rules-engine__scope">{bn
          ? "API v15 পূর্ববর্তী সম্পূর্ণ বিধি-সংস্করণ পাঠায় না। পুরোনো সংস্করণ সংরক্ষিত আছে কিনা SQL/API দ্বারা যাচাই বাকি।"
          : "API v15 does not expose full retired version bodies. Historical revision retrieval remains OPEN."}</p>
      </section>
    </div>
  </ResponsiveOverlay>;
}

/** This component is mounted ONLY with a caller-supplied protected client.
 * No authentication tokens or service-role keys are stored in UI persistence.
 */
export function RulesAuthenticatedSqlView({client,view,year,bn,onOpenYear}: Props) {
  const tr = (en:string, translated:string) => bn ? translated : en;
  const [years,setYears] = useState<SqlYear[]>([]);
  const [rules,setRules] = useState<SqlRuleRecord[]>([]);
  const [groups,setGroups] = useState<SqlRuleGroup[]>([]);
  const [gates,setGates] = useState<SqlGate[]>([]);
  const [summary,setSummary] = useState<SqlSummary|null>(null);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  const [refresh,setRefresh] = useState(0);
  const [search,setSearch] = useState("");
  const [group,setGroup] = useState("");
  const [page,setPage] = useState(1);
  const [perPage,setPerPage] = useState(25);
  const [detail,setDetail] = useState<SqlRuleDetail|null>(null);
  const [detailError,setDetailError] = useState("");
  useEffect(()=>{
    let mounted=true;
    setLoading(true); setError(""); setDetail(null); setDetailError("");
    (async()=>{
      try {
        if(view==="tax-years") {
          const result=await client.getYears();
          if(mounted) setYears(result);
        } else if(view==="rule-library") {
          const [list, grouping]=await Promise.all([client.getAllRules(year),client.getGroups(year)]);
          if(mounted){setRules(list);setGroups(grouping);}
        } else if(view==="validation-publish") {
          const result=await client.getGates(year);
          if(mounted) setGates(result);
        } else {
          const result=await client.getSummary(year);
          if(mounted) setSummary(result);
        }
      } catch(e) {
        if(mounted) setError(e instanceof Error?e.message:String(e));
      } finally {if(mounted)setLoading(false);}
    })();
    return ()=>{mounted=false;};
  },[client,view,year,refresh]);
  const filtered=useMemo(()=>{
    const text=search.trim().toLowerCase();
    return rules.filter(rule=>(!group||rule._backend.groupId===group) &&
      (!text||JSON.stringify({
        id:rule.rule_id,legal_source:rule.legal_source,statutory_section:rule.statutory_section,
        authority:rule.authority,canonical_source_ref:rule.canonical_source_ref,
        taxpayer:rule.taxpayer_type,applicability:rule.applicable_period,
      }).toLowerCase().includes(text)));
  },[rules,search,group]);
  const snapshotIds = useMemo(()=>new Map(snapshot.rules.map(row=>[row.id,row.group])),[]);
  const unmatched=useMemo(()=>rules.filter(rule=>
    snapshotIds.get(rule.rule_id)!==rule._backend.groupId).map(rule=>rule.rule_id),[rules,snapshotIds]);
  const selectRule=async (row:TableRow)=>{
    setDetail(null);setDetailError("");
    try {
      const result=await client.getRule(year,String(row.rule_id));
      const listVersion=rules.find(rule=>rule.rule_id===result.version.rule_key)?._backend;
      if(!listVersion||listVersion.versionId!==result.version.id ||
         listVersion.revisionNo!==result.version.revision_no)
        throw new Error("List and detail SQL version differ; reload before review.");
      setDetail(result);
    }catch(e){setDetailError(e instanceof Error?e.message:String(e));}
  };
  const yearRows:TableRow[]=years.map(y=>({
    id:y.id,assessment_year:y.assessmentYear,income_year:y.incomeYear,
    rule_versions:y.ruleCount,coverage:y.coverage,sql_state:y.state,
    legal_cutoff:y.legalCutoff??"NOT VERIFIED",registry_version:y.registryVersion??"UNVERIFIED",
  }));
  const ruleRows:TableRow[]=filtered.map(rule=>({
    id:rule.rule_id,rule_id:rule.rule_id,
    group:groups.find(g=>g.id===rule._backend.groupId)?.[bn?"nameBn":"nameEn"]??rule._backend.groupId,
    legal_source:display(rule.legal_source??rule.statutory_section??rule.authority??rule.canonical_source_ref),
    taxpayer:display(rule.taxpayer_type??rule.taxpayer_entity),
    execution_view:rule._backend.executionStatus,
    applicability:rule._backend.yearApplicabilityStatus,
    version_uuid:rule._backend.versionId,revision:rule._backend.revisionNo,
  }));
  return <section className="rules-engine__section" aria-label={tr("Authenticated SQL records","অনুমোদিত SQL রেকর্ড")}>
    <p className="rules-engine__scope" role="status">{tr(
      "Authenticated Rules API read. Server versions are recorded evidence, NOT Agent/legal execution certification.",
      "অনুমোদিত Rules API পাঠ। সার্ভারের সংস্করণ নথিভুক্ত প্রমাণ, এজেন্ট/আইনি কার্যকরীকরণ অনুমোদন নয়।")}</p>
    <div className="rules-engine__wizard-actions">
      <SecondaryButton size="sm" onClick={()=>setRefresh(n=>n+1)}>{tr("Refresh SQL records","SQL রেকর্ড পুনরায় আনুন")}</SecondaryButton>
    </div>
    {loading&&<p role="status">{tr("Loading protected SQL records…","সুরক্ষিত SQL রেকর্ড লোড হচ্ছে…")}</p>}
    {error&&<p role="alert">{tr("Protected SQL read failed. No historical snapshot substituted: ","SQL পাঠ ব্যর্থ। পুরোনো স্ন্যাপশট প্রতিস্থাপিত হয়নি: ")}{error}</p>}
    {!loading&&!error&&view==="tax-years"&&<>
      <ResponsiveTable aria-label={tr("Server tax years","সার্ভারের করবর্ষ")} cols={[
        fc("assessment_year",tr("Assessment year","করবর্ষ")),
        fc("income_year",tr("Income year","আয়বর্ষ")),
        fc("rule_versions",tr("Server rule count","সার্ভারের বিধি সংখ্যা")),
        fc("coverage",tr("SQL coverage label","SQL কভারেজ")),
        fc("sql_state",tr("SQL state","SQL অবস্থা")),
      ]} rows={yearRows} onRowClick={row=>onOpenYear(String(row.assessment_year))}
        mobileCardMapping={{primary:"assessment_year",meta:["income_year","rule_versions","sql_state"]}} />
    </>}
    {!loading&&!error&&view==="rule-library"&&<>
      <p role="status">{tr("Current SQL identities","বর্তমান SQL বিধির পরিচয়")}: {rules.length};
        {tr(" snapshot identity/group mismatches"," স্ন্যাপশট পরিচয়/গ্রুপ অমিল")}: {unmatched.length}.
        {tr(" Law completeness remains OPEN."," আইনি পূর্ণতা যাচাই বাকি।")}</p>
      {unmatched.length>0&&<p role="alert">{tr("Identity/group conflict; inspect before relying on this list.","পরিচয়/গ্রুপের অসামঞ্জস্য; ব্যবহারের আগে পরীক্ষা করুন।")} {unmatched.slice(0,20).join(", ")}</p>}
      <div className="rules-engine__filters">
        <AppSearchField label={tr("Search recorded rule and source","বিধি ও উৎস খুঁজুন")} value={search}
          onChange={v=>{setSearch(v);setPage(1);}}/>
        <AppSelectField id="sql-group" compact label={tr("Administrative group","প্রশাসনিক গ্রুপ")}
          value={group} onChange={v=>{setGroup(v);setPage(1);}} searchableAfter={5} sortOptions
          options={[{value:"",label:tr("All groups","সব গ্রুপ")},...groups.map(g=>({value:g.id,label:bn?g.nameBn:g.nameEn}))]}/>
      </div>
      <ResponsiveTable aria-label={tr("Authenticated SQL rule library","অনুমোদিত SQL বিধি লাইব্রেরি")}
        cols={[fc("rule_id",tr("Rule ID","বিধি আইডি")),
          fc("legal_source",tr("Recorded legal reference","নথিভুক্ত আইনি উৎস"),{truncate:"long"}),
          fc("group",tr("Administrative group","প্রশাসনিক গ্রুপ")),
          fc("execution_view",tr("Stored execution label","সংরক্ষিত অবস্থা"))]}
        rows={ruleRows.slice((page-1)*perPage,page*perPage)}
        mobileCardMapping={{primary:"rule_id",meta:["legal_source","group","execution_view"]}}
        onRowClick={row=>{void selectRule(row);}}/>
      <div className="table-card__pagination"><Pagination page={page} total={ruleRows.length}
        perPage={perPage} onPage={setPage} perPageOptions={[10,25,50]}
        onPerPageChange={v=>{setPerPage(v);setPage(1);}}/></div>
      {detailError&&<p role="alert">{detailError}</p>}
      <ServerRuleDetails detail={detail} bn={bn} onClose={()=>setDetail(null)}/>
    </>}
    {!loading&&!error&&view==="calculation-controls"&&summary&&<>
      <p>{tr("Current SQL identities","বর্তমান SQL বিধি")}: {summary.total}</p>
      <p>{tr("Open server change requests","উন্মুক্ত পরিবর্তন প্রস্তাব")}: {summary.openChangeRequests}</p>
      <ResponsiveTable aria-label={tr("SQL execution counts","SQL কার্যকর অবস্থা")}
        cols={[fc("state",tr("Recorded state","সংরক্ষিত অবস্থা")),fc("total",tr("Rule count","বিধি সংখ্যা"))]}
        rows={Object.entries(summary.executionCounts).map(([code,count])=>({id:code,state:code,total:count}))}/>
      <p className="rules-engine__scope">{tr("Stored executable labels are not a verified current-law execution permit.","SQL কার্যকর লেবেল হালনাগাদ আইনি অনুমোদন নয়।")}</p>
    </>}
    {!loading&&!error&&view==="validation-publish"&&<>
      <ResponsiveTable aria-label={tr("Authenticated server gate history","সার্ভারের গেট ইতিহাস")}
        cols={[fc("gate",tr("Gate","গেট")),fc("sql_status",tr("Stored SQL label","সংরক্ষিত SQL অবস্থা")),
          fc("agent_status",tr("Agent v2.1 certification","এজেন্ট v2.1 সার্টিফিকেশন"))]}
        rows={gates.map(g=>({id:g.id,gate:g.gate_name||g.gate_code,sql_status:g.status,
          agent_status:tr("NOT CERTIFIED / RETEST REQUIRED","সার্টিফায়েড নয় / পুনরায় পরীক্ষা আবশ্যক")}))}/>
      <p className="rules-engine__scope">{tr("Old PASS labels do not approve rule activation. Independent 137 + 32 + six-workflow certification remains OPEN.",
        "পুরোনো PASS চালু করার অনুমোদন নয়। ১৩৭ + ৩২ ও ছয়টি কাজের পরীক্ষা বাকি।")}</p>
    </>}
  </section>;
}
