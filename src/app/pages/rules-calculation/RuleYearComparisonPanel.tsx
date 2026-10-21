import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppSearchField } from "../../components/forms/AppSearchField";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { ResponsiveTable } from "../../components/tables/ResponsiveTable";
import { DynamicDetailsDrawer } from "../../components/drawers/DynamicDetailsDrawer";
import { Pagination } from "../../components/shared/Pagination";
import { fc, type TableRow } from "../modulePageUtils";
import { RULES_BASELINE, RULES_SNAPSHOT_DATE, SQL_RULE_GROUPS, TAX_YEAR_SNAPSHOT } from "../../data/rulesEngineSnapshot";
import { compareSnapshotIdentities, snapshotComparisonAvailable, snapshotCoverageReason } from "../../data/ruleYearComparison";

/**
 * Same shared Office table, filters, drawer and pagination as the other Admin pages.
 * Read-only until the authenticated Rules API supplies two independently verified
 * legal rule versions; identity overlap is never treated as unchanged legislation.
 */
function readableExecution(value: string, bn: boolean): string {
  if (value === "INHERITED_PENDING_REVIEW") return bn ? "উত্তরাধিকারী · পর্যালোচনা বাকি" : "Inherited · review pending";
  if (value.startsWith("NON_EXECUTABLE")) return bn ? "কার্যকর নয়" : "Not executable";
  if (value === "FACT_GATED") return bn ? "তথ্য যাচাই সাপেক্ষ" : "Fact-gated";
  if (value.startsWith("EXECUTABLE") || value === "CURRENT_EXECUTABLE") {
    return bn ? "নথিভুক্ত কার্যকর" : "Recorded executable";
  }
  if (value === "FAIL_CLOSED" || value.startsWith("FAIL_CLOSED")) return bn ? "অবরুদ্ধ" : "Blocked";
  return value.replaceAll("_", " ");
}

export function RuleYearComparisonPanel() {
  const { i18n } = useTranslation();
  const bn = i18n.language.startsWith("bn");
  const tr = (en: string, bnText: string) => bn ? bnText : en;
  const [baseYear, setBaseYear] = useState("2026-27");
  const [targetYear, setTargetYear] = useState("2027-28");
  const [group, setGroup] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [details, setDetails] = useState<TableRow | null>(null);

  const available = snapshotComparisonAvailable(baseYear, targetYear);
  const matching = useMemo(
    () => compareSnapshotIdentities(baseYear, targetYear, group, search),
    [baseYear, targetYear, group, search],
  );
  const rows: TableRow[] = useMemo(() => matching
    .slice((page - 1) * perPage, page * perPage)
    .map((rule) => ({
      id: rule.id,
      rule_id: rule.id,
      group: bn ? rule.groupBn : rule.groupEn,
      base_year: rule.baseAssessmentYear,
      target_year: rule.targetAssessmentYear,
      base_execution: readableExecution(rule.baseExecution, bn),
      base_execution_code: rule.baseExecution,
      target_execution: readableExecution(rule.targetExecution, bn),
      target_execution_code: rule.targetExecution,
      comparison_state: tr("Legal comparison pending", "আইনি তুলনা বাকি"),
      comparison_state_code: rule.status,
      legal_reference: rule.legalSources.join("; ") || tr("Not recorded", "তথ্য নেই"),
      origin: rule.origin ?? tr("Not recorded", "তথ্য নেই"),
      evidence: tr("Identity only — legal and calculation diff NOT VERIFIED", "কেবল পরিচয় — আইন ও হিসাবের পার্থক্য যাচাইকৃত নয়"),
    })), [matching, page, perPage, bn]);

  const years = TAX_YEAR_SNAPSHOT.map((year) => ({ value: year.assessmentYear, label: year.assessmentYear }));
  const chooseBase = (value: string) => { setBaseYear(value); setPage(1); setDetails(null); };
  const chooseTarget = (value: string) => { setTargetYear(value); setPage(1); setDetails(null); };
  const chooseGroup = (value: string) => { setGroup(value); setPage(1); };
  const chooseSearch = (value: string) => { setSearch(value); setPage(1); };

  return (
    <section className="rules-engine__section" aria-labelledby="rule-year-comparison-heading">
      <h2 id="rule-year-comparison-heading" className="rules-engine__heading">
        {tr("Assessment-year rule comparison", "করবর্ষভিত্তিক বিধি তুলনা")}
      </h2>
      <p className="rules-engine__meta">
        {tr("Compare recorded rule identities and see historical evidence gaps. Legal changes are not inferred from inherited identifiers.", "নথিভুক্ত বিধির পরিচয় ও ঐতিহাসিক প্রমাণের ঘাটতি তুলনা করুন। উত্তরাধিকারী পরিচয় দেখে আইনি পরিবর্তন অনুমান করা হয় না।")}
      </p>
      <div className="rules-engine__filters">
        <AppSelectField id="rules-compare-base" compact label={tr("From assessment year", "যে করবর্ষ থেকে")} value={baseYear} onChange={chooseBase} options={years} sortOptions/>
        <AppSelectField id="rules-compare-target" compact label={tr("To assessment year", "যে করবর্ষ পর্যন্ত")} value={targetYear} onChange={chooseTarget} options={years} sortOptions/>
      </div>
      <p className="rules-engine__scope" role="status">
        {available
          ? tr("Recorded identities only. Source provisions, exact rates, formulas, commencement and taxpayer effects still require independent legal comparison.", "কেবল নথিভুক্ত পরিচয়। আইনের বিধান, সুনির্দিষ্ট হার, সূত্র, কার্যকারিতা ও করদাতার প্রভাব স্বাধীন যাচাই সাপেক্ষ।")
          : bn
            ? "নির্বাচিত করবর্ষের ঐতিহাসিক বিধি অসম্পূর্ণ অথবা একই বর্ষ নির্বাচিত। কোন বিধি অনুমান বা অনুলিপি করা হয়নি।"
            : snapshotCoverageReason(baseYear, targetYear)}
      </p>
      {available && (
        <>
          <div className="rules-engine__filters">
            <AppSearchField label={tr("Search rule ID or source", "বিধির আইডি বা উৎস খুঁজুন")} value={search} onChange={chooseSearch}/>
            <AppSelectField id="rules-compare-group" compact label={tr("Rule group", "বিধির গ্রুপ")} value={group} onChange={chooseGroup}
              searchableAfter={5} sortOptions options={[
                {value:"",label:tr("All groups", "সব গ্রুপ")},
                ...SQL_RULE_GROUPS.map((item) => ({value:item.id,label:bn ? item.bn : item.en})),
              ]}/>
          </div>
          <p className="rules-engine__meta" aria-live="polite">
            {matching.length} {tr("recorded identities", "নথিভুক্ত পরিচয়")} · {RULES_BASELINE} · {RULES_SNAPSHOT_DATE}
          </p>
          <ResponsiveTable
            aria-label={tr("Assessment-year identity comparison", "করবর্ষভিত্তিক বিধি পরিচয় তুলনা")}
            cols={[
              fc("rule_id", tr("Rule ID", "বিধি আইডি")),
              fc("group", tr("Administrative group", "প্রশাসনিক গ্রুপ")),
              fc("base_execution", tr("From-year record", "আগের বর্ষের রেকর্ড")),
              fc("target_execution", tr("To-year record", "পরের বর্ষের রেকর্ড")),
              fc("comparison_state", tr("Review state", "পর্যালোচনা অবস্থা")),
            ]}
            rows={rows}
            mobileCardMapping={{ primary:"rule_id", meta:["group", "target_execution", "comparison_state"] }}
            onRowClick={setDetails}
          />
          <div className="table-card__pagination">
            <Pagination page={page} total={matching.length} perPage={perPage} onPage={setPage}
              perPageOptions={[10,25,50]} onPerPageChange={(size) => { setPerPage(size); setPage(1); }}/>
          </div>
        </>
      )}
      <DynamicDetailsDrawer open={!!details} onClose={() => setDetails(null)}
        title={tr("Version comparison evidence", "সংস্করণ তুলনার প্রমাণ")} rowData={details} showActions={false}
        columns={[
          {key:"rule_id",label:tr("Canonical rule ID", "মূল বিধি আইডি"),groupLabel:tr("Rule identity", "বিধির পরিচয়")},
          {key:"group",label:tr("Administrative group", "প্রশাসনিক গ্রুপ"),groupLabel:tr("Rule identity", "বিধির পরিচয়")},
          {key:"base_year",label:tr("From assessment year", "পূর্ব করবর্ষ"),groupLabel:tr("Recorded year states", "নথিভুক্ত বর্ষের অবস্থা")},
          {key:"base_execution",label:tr("From-year record", "পূর্ব বর্ষের অবস্থা"),groupLabel:tr("Recorded year states", "নথিভুক্ত বর্ষের অবস্থা")},
          {key:"base_execution_code",label:tr("From-year code", "পূর্ব বর্ষের কোড"),groupLabel:tr("Recorded year states", "নথিভুক্ত বর্ষের অবস্থা")},
          {key:"target_year",label:tr("To assessment year", "পরের করবর্ষ"),groupLabel:tr("Recorded year states", "নথিভুক্ত বর্ষের অবস্থা")},
          {key:"target_execution",label:tr("To-year record", "পরের বর্ষের অবস্থা"),groupLabel:tr("Recorded year states", "নথিভুক্ত বর্ষের অবস্থা")},
          {key:"target_execution_code",label:tr("To-year code", "পরের বর্ষের কোড"),groupLabel:tr("Recorded year states", "নথিভুক্ত বর্ষের অবস্থা")},
          {key:"legal_reference",label:tr("Recorded legal references", "নথিভুক্ত আইনি রেফারেন্স"),groupLabel:tr("Source & review", "উৎস ও পর্যালোচনা")},
          {key:"comparison_state",label:tr("Review state", "পর্যালোচনা অবস্থা"),groupLabel:tr("Source & review", "উৎস ও পর্যালোচনা")},
          {key:"comparison_state_code",label:tr("Review code", "পর্যালোচনা কোড"),groupLabel:tr("Source & review", "উৎস ও পর্যালোচনা")},
          {key:"evidence",label:tr("Evidence boundary", "প্রমাণের সীমা"),groupLabel:tr("Source & review", "উৎস ও পর্যালোচনা")},
        ]}/>
    </section>
  );
}
