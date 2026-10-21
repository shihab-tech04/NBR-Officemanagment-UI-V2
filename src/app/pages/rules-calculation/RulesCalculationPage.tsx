import { useMemo, useState } from "react";
import { PrimaryButton } from "../../components/buttons/PrimaryButton";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import { TaxYearDraftStepper } from "./TaxYearDraftStepper";
import { RuleYearComparisonPanel } from "./RuleYearComparisonPanel";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Plus } from "lucide-react";
import { RuleDetailsPanel, type RuleDetailRecord } from "./RuleDetailsPanel";
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
      <p><strong>Stored SQL state:</strong> {statusLabel(year.dbState)}</p>
      <p><strong>Lifecycle:</strong> {statusLabel(year.lifecycle)}</p>
      <p><strong>Agent/engine certification:</strong> {isCertifiedForEngineExecution(year) ? "VERIFIED" : "NOT CERTIFIED"}</p>
    </div>
  );
}

export function RulesCalculationPage() {
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
    sql_state: statusLabel(item.dbState),
    lifecycle: statusLabel(item.lifecycle),
    rule_versions: item.ruleVersions,
    pending: item.inheritedPending,
    coverage: statusLabel(item.coverage),
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

  if (draftWizardOpen) return <TaxYearDraftStepper onClose={() => setDraftWizardOpen(false)} />;

  return (
    <div className="table-page rules-engine-page">
      <div className="table-page__header">
        <div>
          <h1 className="table-page__title">{titles[section]}</h1>
          <p className="table-page__desc">{bn ? "কর আইন, SQL সংস্করণ ও অনুমোদন অবস্থার তুলনা" : "Legal-source, SQL-version and authorization crosswalk"}</p>
        </div>
        <p className="rules-engine__snapshot-label">{bn ? "যাচাইকৃত SQL পর্যবেক্ষণ" : "SQL observation"} · {RULES_SNAPSHOT_DATE}</p>
      </div>
      {section !== "year-comparison" && <ScopeNote text={bn
        ? "এই তথ্য ১০ অক্টোবর ২০২৬-এ নেওয়া SQL স্ন্যাপশট; এটি সরাসরি ডেটাবেস সংযোগ বা হিসাবের আইনগত অনুমোদন নয়।"
        : "Dated, read-only SQL snapshot. Not a live database session or statutory calculation approval."} />}

      {section !== "year-comparison" && !(section === "rule-library" && requestedYear) && <div className="rules-engine__kpis" aria-label="Rules and calculation inventory">
        <StatCard icon={BookOpen} label={bn ? "বিধির পরিচয়" : "Canonical rule identities"} value="366" subInfo={RULES_BASELINE} />
        <StatCard icon={History} label={bn ? "নথিভুক্ত সংস্করণ" : "SQL rule-version records"} value="733" tone="neutral" />
        <StatCard icon={CalendarRange} label={bn ? "করবর্ষ" : "Year records"} value="4" tone="neutral" />
        <StatCard icon={ShieldCheck} label={bn ? "ইঞ্জিন সার্টিফিকেশন" : "Engine certification"} value="Pending" tone="warning" />
      </div>}

      {(section === "rule-library" || section === "calculation-controls" || section === "validation-publish") && (
        <div className="rules-engine__year-filter">
          <AppSelectField id="rules-year" label={bn ? "করবর্ষ নির্বাচন" : tr("Assessment year", "করবর্ষ")}
            compact value={year} onChange={(value) => { setSearchParams({year:value}); setRulePage(1); }}
            options={TAX_YEAR_SNAPSHOT.map((item) => ({ value: item.assessmentYear, label: item.assessmentYear }))} />
        </div>
      )}

      {section === "tax-years" && (
        <section className="rules-engine__section" aria-labelledby="tax-years-heading">
          <div className="rules-engine__stepper-heading"><h2 id="tax-years-heading" className="rules-engine__heading">{bn ? "SQL করবর্ষ রেজিস্ট্রি" : "Tax-year registry"}</h2>
            <PrimaryButton onClick={() => setDraftWizardOpen(true)}>{tr("Prepare new tax-year draft", "নতুন করবর্ষের খসড়া প্রস্তুত করুন")}</PrimaryButton>
          </div>
          <ResponsiveTable aria-label="Observed tax-year states" cols={[
            fc("assessment_year", tr("Assessment year", "করবর্ষ")), fc("income_year", tr("Income year", "আয়বর্ষ")),
            fc("sql_state", tr("SQL state", "SQL অবস্থা")), fc("coverage", tr("Coverage", "কভারেজ")),
            fc("rule_versions", tr("Rule versions", "বিধি সংস্করণ")), fc("pending", tr("Pending review", "পর্যালোচনা বাকি")),
          ]} rows={yearRows} onRowClick={openYearRules}
            mobileCardMapping={{primary:"assessment_year",meta:["income_year","coverage","rule_versions"]}} />
          <div className="rules-engine__comparison">
            <article className="rules-engine__panel"><h3>AY 2026–27</h3>
              <p>{tr("Income year 2025–26 · 366 recorded rule versions.", "আয়বর্ষ ২০২৫–২৬ · ৩৬৬টি নথিভুক্ত বিধি সংস্করণ।")}</p>
              <p>{tr("SQL state is ACTIVE. Seven stored PASS labels are historical SQL evidence only; Agent v2.1 release remains NOT CERTIFIED.", "SQL অবস্থা ACTIVE। সংরক্ষিত সাতটি PASS কেবল পূর্বের SQL-প্রমাণ; এজেন্ট v2.1-এর প্রকাশ এখনও অনুমোদিত নয়।")}</p>
            </article>
            <article className="rules-engine__panel"><h3>AY 2027–28</h3>
              <p>{tr("Income year 2026–27 · 366 inherited rule versions.", "আয়বর্ষ ২০২৬–২৭ · ৩৬৬টি উত্তরাধিকারী বিধি সংস্করণ।")}</p>
              <p>{tr("DRAFT / INHERITED_PENDING_REVIEW. Every inherited version remains non-executable; approval does not carry forward.", "DRAFT / INHERITED_PENDING_REVIEW। উত্তরাধিকারী সংস্করণগুলো চালু নয়; পূর্বের অনুমোদন নতুন বর্ষে বহাল হয় না।")}</p>
            </article>
          </div>
        </section>
      )}

      {section === "year-comparison" && <RuleYearComparisonPanel />}

      {section === "rule-library" && (
        <section className="rules-engine__section" aria-labelledby="rule-library-heading">
          <div className="rules-engine__stepper-heading">
            <h2 id="rule-library-heading" className="rules-engine__heading">{bn ? "উৎস-সংযুক্ত বিধি পরিচয়" : "Source-linked rule identities"} · AY {year}</h2>
            {requestedYear && <SecondaryButton size="lg" onClick={() => navigate("/administration/rules-calculation/tax-years")}>
              {tr("Back to Tax Years", "করবর্ষে ফিরে যান")}
            </SecondaryButton>}
          </div>
          <p className="rules-engine__meta">{isRuleListYear
            ? `${ruleRows.length} of ${catalog.expected_total} ${bn ? "পরিচয়" : "rule identities"} · ${statusLabel(selectedYear.coverage)}`
            : tr("Historical year detail is incomplete; rule identities are not inferred from current-year records.", "ঐতিহাসিক বর্ষের তথ্য অসম্পূর্ণ; বর্তমান বর্ষ থেকে বিধির পরিচয় অনুমান করা হয় না।")}</p>
          <div className="rules-engine__filters">
            <AppSearchField label={bn ? "বিধি খুঁজুন" : "Search rule ID, source, group"} value={search} onChange={(value) => {setSearch(value); setRulePage(1);}} />
            <AppSelectField id="rule-group" compact label={bn ? "বিধি গ্রুপ" : "Rule group"}
              value={group} onChange={(value) => {setGroup(value); setRulePage(1);}} searchableAfter={5} sortOptions options={[
                { value: "", label: bn ? "সব গ্রুপ" : "All groups" },
                ...SQL_RULE_GROUPS.map((g) => ({ value:g.id, label:`${bn ? g.bn : g.en} (${g.count})` })),
              ]} />
          </div>
          <ResponsiveTable aria-label="Controlled rule identity registry" cols={[
            fc("rule_id", tr("Rule ID", "বিধি আইডি")), fc("group", tr("Administrative group", "প্রশাসনিক গ্রুপ")),
            fc("applicability_view", tr("Recorded applicability", "নথিভুক্ত প্রযোজ্যতা")), fc("execution_view", tr("Recorded execution", "নথিভুক্ত কার্যকর অবস্থা")),
          ]} rows={ruleRows.slice((rulePage - 1) * rulePerPage, rulePage * rulePerPage)}
            mobileCardMapping={{primary:"rule_id",meta:["group","applicability_view"]}}
            onRowClick={openRuleDetails} />
          <div className="table-card__pagination">
            <Pagination page={rulePage} total={ruleRows.length} perPage={rulePerPage} onPage={setRulePage}
              perPageOptions={[10,25,50]} onPerPageChange={(value) => {setRulePerPage(value); setRulePage(1);}} />
          </div>
          <ScopeNote text={bn
            ? "গ্রুপ হলো প্রশাসনিক শ্রেণিবিন্যাস, আইনের স্বয়ংক্রিয় প্যারেন্ট–চাইল্ড সম্পর্ক নয়।"
            : "Groups are administrative classifications, not evidence of statutory parent/subrule/child hierarchy. Open a row for recorded legal-source locators."} />
        </section>
      )}

      {section === "calculation-controls" && (
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

      {section === "validation-publish" && (
        <section className="rules-engine__section" aria-labelledby="gates-heading">
          <h2 id="gates-heading" className="rules-engine__heading">{bn ? "SQL গেট ও স্বাধীন সার্টিফিকেশন" : "Stored SQL gates vs independent certification"}</h2>
          <YearStatus year={selectedYear} />
          <ResponsiveTable aria-label="Versioned tax-year gate results" cols={[
            fc("gate", tr("Gate", "গেট")), fc("sql_status", tr("Stored SQL label", "SQL-এ সংরক্ষিত অবস্থা")), fc("agent_status", tr("Agent v2.1 hard gate", "এজেন্ট v2.1 যাচাই")),
          ]} rows={GATE_CODES.map((gate) => ({ id:gate, gate:statusLabel(gate).toUpperCase(), sql_status:statusLabel(selectedYear.gates[gate] as GateState | undefined), agent_status:tr("NOT CERTIFIED / RECHECK REQUIRED", "সার্টিফায়েড নয় / পুনরায় যাচাই প্রয়োজন") }))} />
          <ScopeNote text={tr("Archived PASS labels are not post-upgrade Agent reruns. Activation stays blocked until legal-source, all-year coverage, 137 fresh regressions, 32 v2.1 tests and six complete E2E flows are evidenced and approved.", "পুরোনো PASS নতুন এজেন্ট রিগ্রেশন পরীক্ষার বিকল্প নয়। আইনি উৎস, সব বর্ষ, নতুন ১৩৭টি পরীক্ষা, v2.1-এর ৩২টি পরীক্ষা এবং ৬টি পূর্ণ E2E প্রমাণ ও অনুমোদন না হওয়া পর্যন্ত কার্যক্রম চালু হবে না।")} />
        </section>
      )}

      <RuleDetailsPanel record={ruleDetails} onClose={closeRuleDetails} bn={bn}/>
    </div>
  );
}
