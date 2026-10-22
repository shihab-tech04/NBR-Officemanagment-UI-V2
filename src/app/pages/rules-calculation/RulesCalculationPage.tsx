import { useMemo, useState } from "react";
import { PrimaryButton } from "../../components/buttons/PrimaryButton";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import { TaxYearDraftStepper } from "./TaxYearDraftStepper";
import { RuleYearComparisonPanel } from "./RuleYearComparisonPanel";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus } from "lucide-react";
import { RuleDetailsPanel, type RuleDetailRecord } from "./RuleDetailsPanel";
import { RulesAuthenticatedSqlView, type RulesAuthenticatedReadClient } from "./RulesAuthenticatedSqlView";
import { AppSearchField } from "../../components/forms/AppSearchField";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { ResponsiveTable } from "../../components/tables/ResponsiveTable";
import { Pagination } from "../../components/shared/Pagination";
import { fc, type TableRow } from "../modulePageUtils";
import {
  GATE_CODES, RULES_BASELINE, RULES_BASELINE_SHA256, RULES_SNAPSHOT_DATE,
  SQL_RULE_GROUPS, TAX_YEAR_SNAPSHOT, canPublishOrExecuteRule, isCertifiedForEngineExecution,
  type GateState, type TaxYearObservation,
} from "../../data/rulesEngineSnapshot";
import catalog from "../../data/rulesSqlSnapshot.json";

interface RuleObservation {
  id: string;
  group: string;
  origin: string | null;
  source: string | null;
  applicability: string;
  execution: string | null;
  legalSource: string[];
}

const RULES: RuleObservation[] = catalog.rules.map((item) => ({
  ...item, legalSource: item.legalSource.filter((source): source is string => typeof source === "string"),
}));
const BASE_YEAR = "2026-27";
const DRAFT_YEAR = "2027-28";
const TABS = new Set(["tax-years", "year-comparison", "rule-library", "calculation-controls", "validation-publish"]);
const statusLabel = (status: string | null | undefined) => status ? status.replaceAll("_", " ") : "Not recorded";

function recordedStatusLabel(code: string | null | undefined, bn: boolean): string {
  if (!code) return bn ? "নথিভুক্ত নয়" : "Not recorded";
  if (code === "INHERITED_PENDING_REVIEW") return bn ? "উত্তরাধিকারী · পর্যালোচনা বাকি" : "Inherited · review pending";
  if (code === "CERTIFIED_CURRENT") return bn ? "বর্তমান হিসেবে নথিভুক্ত" : "Recorded current";
  if (code.startsWith("EXECUTABLE")) return bn ? "নথিভুক্ত কার্যকর" : "Recorded executable";
  if (code.startsWith("NON_EXECUTABLE")) return bn ? "কার্যকর নয়" : "Not executable";
  if (code.startsWith("FAIL_CLOSED")) return bn ? "নিরাপত্তার জন্য অবরুদ্ধ" : "Blocked";
  return code.replaceAll("_", " ");
}

function ScopeNote({ text }: { text: string }) {
  return <p className="rules-engine__scope">{text}</p>;
}

function YearStatus({ year }: { year: TaxYearObservation }) {
  return (
    <div className="rules-engine__status">
      <p><strong>Observed SQL state (10 Oct 2026 snapshot):</strong> {statusLabel(year.dbState)}</p>
      <p><strong>Lifecycle:</strong> {statusLabel(year.lifecycle)}</p>
      <p><strong>Agent/engine certification:</strong> {isCertifiedForEngineExecution(year) ? "VERIFIED" : "NOT CERTIFIED"}</p>
    </div>
  );
}

/** Protected Office auth integration may inject a verified Rules API read client; no tokens stored here. */
export function RulesCalculationPage({ rulesAdminClient }: { rulesAdminClient?: RulesAuthenticatedReadClient } = {}) {
  const { thirdNav } = useParams<{ thirdNav: string }>();
  const section = thirdNav && TABS.has(thirdNav) ? thirdNav : "tax-years";
  const { i18n } = useTranslation();
  const bn = i18n.language.startsWith("bn");
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedYear = searchParams.get("year");
  const year = TAX_YEAR_SNAPSHOT.some((item) => item.assessmentYear === requestedYear) ? requestedYear! : BASE_YEAR;
  const selectedRuleKey = searchParams.get("rule");
  const tr = (en: string, bnText: string) => bn ? bnText : en;
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("");
  const [rulePage, setRulePage] = useState(1);
  const [rulePerPage, setRulePerPage] = useState(25);
  const [draftWizardOpen, setDraftWizardOpen] = useState(false);
  const openYearRules = (row: TableRow) => {
    const selected = String(row.assessment_year ?? "");
    if (!TAX_YEAR_SNAPSHOT.some((item) => item.assessmentYear === selected)) return;
    setRulePage(1);
    navigate(`/administration/rules-calculation/rule-library?year=${encodeURIComponent(selected)}`);
  };
  const openRuleDetails = (row: TableRow) => {
    setSearchParams({ year, rule: String(row.rule_id ?? "") });
  };
  const closeRuleDetails = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("rule");
    setSearchParams(params, { replace: true });
  };
  const selectedYear = TAX_YEAR_SNAPSHOT.find((item) => item.assessmentYear === year) ?? TAX_YEAR_SNAPSHOT[2];
  const groupLabel = (groupId: string) => {
    const found = SQL_RULE_GROUPS.find((item) => item.id === groupId);
    return found ? (bn ? found.bn : found.en) : groupId;
  };
  const isRuleListYear = year === BASE_YEAR || year === DRAFT_YEAR;
  const ruleRows = useMemo(() => {
    if (!isRuleListYear) return [];
    const query = search.toLocaleLowerCase();
    return RULES.filter((rule) => (!group || rule.group === group) &&
      (!query || [rule.id, rule.origin ?? "", rule.source ?? "", rule.group, ...rule.legalSource]
        .some((part) => part.toLocaleLowerCase().includes(query))))
      .map((rule) => ({
        id: rule.id,
        rule_id: rule.id,
        group: groupLabel(rule.group),
        rule_group_id: rule.group,
        year,
        source: rule.source ?? tr("Not recorded", "তথ্য নেই"),
        origin: rule.origin ?? tr("Not recorded", "তথ্য নেই"),
        applicability: year === DRAFT_YEAR ? "INHERITED_PENDING_REVIEW" : rule.applicability,
        execution: year === DRAFT_YEAR ? "NOT_CERTIFIED" : (rule.execution ?? tr("Not recorded", "তথ্য নেই")),
        applicability_view: recordedStatusLabel(year === DRAFT_YEAR ? "INHERITED_PENDING_REVIEW" : rule.applicability, bn),
        execution_view: recordedStatusLabel(year === DRAFT_YEAR ? "NON_EXECUTABLE" : rule.execution, bn),
        legal_source: rule.legalSource.length ? rule.legalSource.join("; ") : tr("Not recorded", "তথ্য নেই"),
        certification: tr("NOT CERTIFIED (Agent v2.1)", "এজেন্ট v2.1 সার্টিফায়েড নয়"),
        status: year === DRAFT_YEAR ? tr("PENDING REVIEW", "পর্যালোচনা বাকি") : tr("SQL snapshot", "SQL স্ন্যাপশট"),
      }));
  }, [isRuleListYear, search, group, year, bn]);
  const selectedCanonicalRule = section === "rule-library" && isRuleListYear && selectedRuleKey
    ? RULES.find((rule) => rule.id === selectedRuleKey) ?? null
    : null;
  const ruleDetails: RuleDetailRecord | null = selectedCanonicalRule ? {
    id: selectedCanonicalRule.id,
    group: groupLabel(selectedCanonicalRule.group),
    year,
    incomeYear: selectedYear.incomeYear,
    source: selectedCanonicalRule.source,
    origin: selectedCanonicalRule.origin,
    legalSource: selectedCanonicalRule.legalSource,
    applicability: selectedCanonicalRule.applicability,
    execution: selectedCanonicalRule.execution,
    inherited: year === DRAFT_YEAR,
  } : null;
  const yearRows: TableRow[] = TAX_YEAR_SNAPSHOT.map((item) => ({
    id: item.assessmentYear,
    assessment_year: item.assessmentYear,
    income_year: item.incomeYear,
    sql_state: item.dbState === "reference_only" ? tr("Historical reference", "ঐতিহাসিক রেফারেন্স") : item.dbState === "draft" ? tr("Draft", "খসড়া") : tr("Recorded active", "নথিভুক্ত সক্রিয়"),
    lifecycle: statusLabel(item.lifecycle),
    rule_versions: item.ruleVersions,
    pending: item.inheritedPending,
    coverage: item.coverage === "complete_canonical" ? tr("Identity inventory recorded", "পরিচয় তালিকা নথিভুক্ত") : item.coverage === "cloned_pending_review" ? tr("Inherited · review pending", "উত্তরাধিকারী · পর্যালোচনা বাকি") : tr("Historical rules incomplete", "ঐতিহাসিক বিধি অসম্পূর্ণ"),
    legal_cutoff: item.legalCutoff || "Not verified",
    certification: tr("NOT CERTIFIED (Agent v2.1)", "এজেন্ট v2.1 সার্টিফায়েড নয়"),
  }));
  const titles: Record<string, string> = bn ? {
    "tax-years": "করবর্ষ", "year-comparison": "বর্ষ তুলনা", "rule-library": "বিধি লাইব্রেরি",
    "calculation-controls": "হিসাব নিয়ন্ত্রণ", "validation-publish": "যাচাই ও প্রকাশ",
  } : {
    "tax-years": "Tax Years", "year-comparison": "Year Comparison", "rule-library": "Rule Library",
    "calculation-controls": "Calculation Controls", "validation-publish": "Validation & Publish",
  };



  return (
    <div className="table-page rules-engine-page">
      <div className="table-page__header rules-engine__header">
        <div>
          <h1 className="table-page__title">{section === "rule-library" ? tr("Rules", "বিধিসমূহ") + " · AY " + year : titles[section]}</h1>
          <p className="table-page__desc">{section === "tax-years"
            ? tr("Select a tax year to explore its recorded rules.", "করবর্ষ নির্বাচন করে সংশ্লিষ্ট নথিভুক্ত বিধি দেখুন।")
            : section === "rule-library"
              ? tr("Select a rule to inspect its legal references and status.", "আইনি রেফারেন্স ও অবস্থা দেখতে বিধি নির্বাচন করুন।")
              : section === "year-comparison"
                ? tr("Compare the recorded identities of two years.", "দুই করবর্ষের বিধির পরিচয় তুলনা করুন।")
                : tr("Controlled rules inventory and review status.", "নিয়ন্ত্রিত বিধি ও পর্যালোচনার অবস্থা।")}</p>
        </div>
        {section === "tax-years" ? <PrimaryButton size="lg" icon={Plus} onClick={() => setDraftWizardOpen(true)}>
          {tr("Prepare tax year", "করবর্ষের খসড়া")}
        </PrimaryButton> : <p className="rules-engine__snapshot-label">
          {rulesAdminClient ? tr("Authenticated Rules API read", "অনুমোদিত Rules API পাঠ") : tr("Historical read-only snapshot", "ঐতিহাসিক স্ন্যাপশট")} {rulesAdminClient ? "" : "· "+RULES_SNAPSHOT_DATE}
        </p>}
      </div>

      {!rulesAdminClient && (section === "calculation-controls" || section === "validation-publish") && (
        <div className="rules-engine__year-filter">
          <AppSelectField id="rules-year" label={bn ? "করবর্ষ নির্বাচন" : tr("Assessment year", "করবর্ষ")}
            compact value={year} onChange={(value) => { setSearchParams({year:value}); setRulePage(1); }}
            options={TAX_YEAR_SNAPSHOT.map((item) => ({ value: item.assessmentYear, label: item.assessmentYear }))} />
        </div>
      )}

      {!rulesAdminClient && section === "tax-years" && (
        <section className="rules-engine__section" aria-labelledby="tax-years-heading">
          <div className="rules-engine__list-heading">
            <h2 id="tax-years-heading" className="rules-engine__heading">{tr("Assessment years", "করবর্ষসমূহ")}</h2>
            <span className="rules-engine__count">{TAX_YEAR_SNAPSHOT.length} {tr("recorded years", "নথিভুক্ত বর্ষ")}</span>
          </div>
          <ResponsiveTable aria-label={tr("Select a tax year to view its rules", "বিধি দেখতে করবর্ষ নির্বাচন করুন")} cols={[
            fc("assessment_year", tr("Assessment year", "করবর্ষ")),
            fc("income_year", tr("Income year", "আয়বর্ষ")),
            fc("rule_versions", tr("Recorded identities", "নথিভুক্ত পরিচয়")),
            fc("coverage", tr("Coverage", "কভারেজ")),
            fc("sql_state", tr("10 Oct 2026 snapshot state", "১০ অক্টোবর ২০২৬-এর স্ন্যাপশট অবস্থা")),
          ]} rows={yearRows} onRowClick={openYearRules}
            mobileCardMapping={{primary:"assessment_year",meta:["income_year","rule_versions","coverage"]}} />
          <p className="rules-engine__meta rules-engine__after-table">
            {tr("Recorded counts are rule identities, not verified complete tax law or 1:1 eReturn calculations. Historical coverage remains incomplete (SQL snapshot: 10 October 2026).", "১০ অক্টোবর ২০২৬-এর স্ন্যাপশট। SQL রেকর্ড আইনি অনুমোদন নয়; ঐতিহাসিক বিধি এখনও অসম্পূর্ণ।")}
          </p>
        </section>
      )}

      {!rulesAdminClient && <p className="rules-engine__scope" role="status">
        {tr("Authenticated SQL view is unavailable in this session. The tables below are a 10 October 2026 historical snapshot, never proof of current legal approval or synchronization.",
        "এই সেশনে অনুমোদিত SQL পাঠ নেই। নিচের তথ্য ১০ অক্টোবর ২০২৬-এর ঐতিহাসিক স্ন্যাপশট; হালনাগাদ আইনি অনুমোদন বা SQL মিলের প্রমাণ নয়।")}
      </p>}
      {rulesAdminClient && section !== "year-comparison" && (
        <RulesAuthenticatedSqlView client={rulesAdminClient}
          view={section as "tax-years" | "rule-library" | "calculation-controls" | "validation-publish"}
          year={year} bn={bn}
          onOpenYear={assessmentYear=>navigate("/administration/rules-calculation/rule-library?year="+encodeURIComponent(assessmentYear))}/>
      )}
      {section === "year-comparison" && <RuleYearComparisonPanel />}

      {!rulesAdminClient && section === "rule-library" && (
        <section className="rules-engine__section" aria-labelledby="rule-library-heading">
          <div className="rules-engine__list-heading">
            <h2 id="rule-library-heading" className="rules-engine__heading">{tr("Recorded rules", "নথিভুক্ত বিধি")}</h2>
            <div className="rules-engine__list-actions">
              <span className="rules-engine__count">{ruleRows.length} {tr("matching rules", "মিলে যাওয়া বিধি")}</span>
              {requestedYear && <SecondaryButton size="sm" icon={ArrowLeft}
                onClick={() => navigate("/administration/rules-calculation/tax-years")}>
                {tr("Tax Years", "করবর্ষ")}</SecondaryButton>}
            </div>
          </div>
          <div className="rules-engine__filters rules-engine__filters--rules">
            <AppSelectField id="rules-year" compact label={tr("Assessment year", "করবর্ষ")}
              value={year} onChange={(value) => {setSearchParams({year:value});setRulePage(1);}}
              options={TAX_YEAR_SNAPSHOT.map((item)=>({value:item.assessmentYear,label:item.assessmentYear}))}/>
            <AppSearchField label={tr("Search rules or legal references", "বিধি বা আইনি রেফারেন্স খুঁজুন")}
              value={search} onChange={(value)=>{setSearch(value);setRulePage(1);}}/>
            <AppSelectField id="rule-group" compact label={tr("Rule group", "বিধির গ্রুপ")}
              value={group} onChange={(value)=>{setGroup(value);setRulePage(1);}} searchableAfter={5} sortOptions
              options={[{value:"",label:tr("All groups","সব গ্রুপ")},
                ...SQL_RULE_GROUPS.map((g)=>({value:g.id,label:`${bn?g.bn:g.en} (${g.count})`}))]}/>
          </div>
          {!isRuleListYear && <p className="rules-engine__scope" role="status">
            {tr("Historical rules have not been reconstructed for this year. No current-year records are copied backward.", "এই করবর্ষের ঐতিহাসিক বিধি পুনর্গঠিত নয়। বর্তমান বিধি পিছনের বছরে অনুলিপি করা হয় না।")}
          </p>}
          <ResponsiveTable aria-label={tr("Year-specific rule library", "করবর্ষভিত্তিক বিধি তালিকা")} cols={[
            fc("rule_id", tr("Rule ID", "বিধি আইডি")),
            fc("legal_source", tr("Recorded legal reference", "নথিভুক্ত আইনি রেফারেন্স"), {truncate:"long"}),
            fc("group", tr("Administrative group", "প্রশাসনিক গ্রুপ")),
            fc("execution_view", tr("Record status", "রেকর্ড অবস্থা")),
          ]} rows={ruleRows.slice((rulePage-1)*rulePerPage,rulePage*rulePerPage)}
            mobileCardMapping={{primary:"rule_id",meta:["legal_source","group","execution_view"]}}
            onRowClick={openRuleDetails}/>
          <div className="table-card__pagination">
            <Pagination page={rulePage} total={ruleRows.length} perPage={rulePerPage} onPage={setRulePage}
              perPageOptions={[10,25,50]} onPerPageChange={(value)=>{setRulePerPage(value);setRulePage(1);}}/>
          </div>
          <p className="rules-engine__meta rules-engine__after-table">
            {tr("Administrative groups are not statutory hierarchy. Legal references and execution labels are recorded, not independently approved.", "প্রশাসনিক গ্রুপ আইনি ধারা-বিন্যাস নয়। আইন ও কার্যকর অবস্থার রেফারেন্স নথিভুক্ত, স্বাধীনভাবে অনুমোদিত নয়।")}
          </p>
        </section>
      )}

      {!rulesAdminClient && section === "calculation-controls" && (
        <section className="rules-engine__section" aria-labelledby="calc-heading">
          <h2 id="calc-heading" className="rules-engine__heading">{bn ? "হিসাব ইঞ্জিনের নির্ভরতা" : "Calculation engine dependency controls"}</h2>
          <YearStatus year={selectedYear} />
          <div className="rules-engine__comparison">
            <article className="rules-engine__panel"><h3>{tr("Source and period", "উৎস ও সময়কাল")}</h3><p>{tr("Require exact legal provision, taxpayer class, income year, transaction/service date, commencement and savings. Assessment year alone cannot select a calculation.", "সুনির্দিষ্ট আইন, করদাতার শ্রেণি, আয়বর্ষ, লেনদেনের তারিখ, কার্যকারিতা ও সংরক্ষণ বিধান যাচাই জরুরি। কেবল করবর্ষ দিয়ে হিসাব করা যাবে না।")}</p></article>
            <article className="rules-engine__panel"><h3>{tr("Execution gate", "কার্যকরীকরণ গেট")}</h3><p>{canPublishOrExecuteRule(selectedYear) ? tr("Authorized", "অনুমোদিত") : tr("BLOCKED — active-Agent legal, version and numerical regression proof incomplete.", "অবরুদ্ধ — সক্রিয় এজেন্টের আইন, সংস্করণ ও সাংখ্যিক রিগ্রেশন প্রমাণ অসম্পূর্ণ।")}</p></article>
            <article className="rules-engine__panel"><h3>{tr("Runtime contracts", "রানটাইম চুক্তি")}</h3><p>{tr("SQL contains individual schedule and runtime-binding records. Their existence does not certify all rebates, exemptions, final/minimum tax or Ledger credits.", "SQL-এ ব্যক্তি কর সিডিউল ও রানটাইম বাইন্ডিং আছে; এগুলোর উপস্থিতি সব রেয়াত, অব্যাহতি, ন্যূনতম/চূড়ান্ত কর ও লেজার ক্রেডিট অনুমোদন করে না।")}</p></article>
            <article className="rules-engine__panel"><h3>{tr("Controlled source identity", "নিয়ন্ত্রিত উৎস পরিচয়")}</h3><p>{RULES_BASELINE} · SHA-256</p><p className="rules-engine__hash">{RULES_BASELINE_SHA256}</p></article>
          </div>
        </section>
      )}

      {!rulesAdminClient && section === "validation-publish" && (
        <section className="rules-engine__section" aria-labelledby="gates-heading">
          <h2 id="gates-heading" className="rules-engine__heading">{bn ? "SQL গেট ও স্বাধীন সার্টিফিকেশন" : "Stored SQL gates vs independent certification"}</h2>
          <YearStatus year={selectedYear} />
          <ResponsiveTable aria-label="Versioned tax-year gate results" cols={[
            fc("gate", tr("Gate", "গেট")), fc("sql_status", tr("Stored SQL label", "SQL-এ সংরক্ষিত অবস্থা")), fc("agent_status", tr("Agent v2.1 hard gate", "এজেন্ট v2.1 যাচাই")),
          ]} rows={GATE_CODES.map((gate) => ({ id:gate, gate:statusLabel(gate).toUpperCase(), sql_status:statusLabel(selectedYear.gates[gate] as GateState | undefined), agent_status:tr("NOT CERTIFIED / RECHECK REQUIRED", "সার্টিফায়েড নয় / পুনরায় যাচাই প্রয়োজন") }))} />
          <ScopeNote text={tr("Archived PASS labels are not post-upgrade Agent reruns. Activation stays blocked until legal-source, all-year coverage, 137 fresh regressions, 32 v2.1 tests and six complete E2E flows are evidenced and approved.", "পুরোনো PASS নতুন এজেন্ট রিগ্রেশন পরীক্ষার বিকল্প নয়। আইনি উৎস, সব বর্ষ, নতুন ১৩৭টি পরীক্ষা, v2.1-এর ৩২টি পরীক্ষা এবং ৬টি পূর্ণ E2E প্রমাণ ও অনুমোদন না হওয়া পর্যন্ত কার্যক্রম চালু হবে না।")} />
        </section>
      )}

      {!rulesAdminClient && <RuleDetailsPanel record={ruleDetails} onClose={closeRuleDetails} bn={bn}/>}
      {draftWizardOpen && <TaxYearDraftStepper onClose={() => setDraftWizardOpen(false)} />}
    </div>
  );
}
