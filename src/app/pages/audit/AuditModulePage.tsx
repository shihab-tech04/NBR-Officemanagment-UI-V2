import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Activity, BadgeCheck, ChevronRight, Download, FileSearch, Filter, Info, Printer, Scale, ShieldAlert,
  Timer, Workflow,
} from "lucide-react";
import { StatCard } from "../../components/cards/StatCard";
import { StatusBadge } from "../../components/badges/StatusBadge";
import { DashSection } from "../../components/dashboard/DashSection";
import { ResponsiveTable } from "../../components/tables/ResponsiveTable";
import { DynamicDetailsDrawer } from "../../components/drawers/DynamicDetailsDrawer";
import { AppSearchField } from "../../components/forms/AppSearchField";
import { AppSelectField } from "../../components/forms/AppSelectField";
import { FilterPanel } from "../../components/filters/FilterPanel";
import { MobileFilterOverlay } from "../../components/filters/MobileFilterOverlay";
import { AppliedFilterChips } from "../../components/filters/AppliedFilterChips";
import { MobileSearchFilter } from "../../components/shared/MobileSearchFilter";
import { Pagination } from "../../components/shared/Pagination";
import { useUIState } from "../../hooks/useUI";
import { handleExportDisabled } from "../../utils/exportDisabled";
import type { ColDef, FilterDef, TableRow } from "../modulePageUtils";
import { fc } from "../modulePageUtils";
import {
  ALL_TAXPAYER_ROWS, AUDIT_TRAIL_ROWS, CONTROL_ROWS,
  RECONCILIATION_ROWS, RISK_CASE_ROWS, RISK_DISTRIBUTION_ROWS,
  RULE_ROWS, SECOND_REVIEW_ROWS,
} from "./auditData";
import { AuditExplainerDrawer } from "./AuditExplainerDrawer";

const AUDIT_DROPDOWN_SEARCH_THRESHOLD = 5;
import { resolveAuditExplanation, type AuditExplanation } from "./auditKnowledge";
import { AuditCandidatesPage } from "./AuditCandidatesPage";
import { AuditManualPage } from "./AuditManualPage";
import { getAuditCandidates } from "./auditCandidateStore";
import { VERIFIED_TAX_JURISDICTIONS, getVerifiedCirclesForZone } from "../../data/taxJurisdictions";

const PER_PAGE = 10;

type AuditTableConfig = {
  title: string;
  description: string;
  rows: TableRow[];
  columns: ColDef[];
  drawerColumns?: ColDef[];
  filters: FilterDef[];
  clickableKeys?: string[];
  mobileCardMapping?: {
    primary?: string;
    identifier?: string;
    meta?: string[];
    status?: string;
    date?: string;
  };
  readOnly?: boolean;
};

function flattenColumns(cols: ColDef[]) {
  return cols.flatMap((col) => col.type === "col"
    ? [{ key: col.col.key, label: col.col.label }]
    : col.group.cols.map((c) => ({ key: c.key, label: c.label, groupLabel: col.group.label }))
  );
}

function uniqueValues(rows: TableRow[], field: string): string[] {
  return Array.from(new Set(
    rows.map(row => String(row[field] ?? "").trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
}

function AuditTablePage({ config }: { config: AuditTableConfig }) {
  const { isDesktop } = useUIState();
  const { t, i18n } = useTranslation("audit");
  const { t: translateCommon } = useTranslation("common");
  const location = useLocation();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<TableRow | null>(null);
  const [explanation, setExplanation] = useState<AuditExplanation | null>(null);
  const [showFilter, setShowFilter] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const query = params.get("q") ?? "";
    const nextFilters: Record<string, string> = {};
    ["", "2", "3"].forEach((suffix) => {
      const filterKey = params.get(`filterKey${suffix}`) ?? "";
      const filterValue = params.get(`filterValue${suffix}`) ?? "";
      const supportsFilter = !!filterKey && config.filters.some((filter) => filter.key === filterKey);
      if (supportsFilter && filterValue) nextFilters[filterKey] = filterValue;
    });
    setQ(query);
    setFilterValues(nextFilters);
    setAppliedFilters(nextFilters);
    setShowFilter(false);
    setPage(1);
  }, [location.search, config.title]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return config.rows.filter((row) => {
      const matchesSearch = !needle || Object.values(row).some((v) =>
        String(v ?? "").toLowerCase().includes(needle)
      );
      const matchesFilters = config.filters.every((filter) => {
        const selected = appliedFilters[filter.key];
        return !selected || String(row[filter.key] ?? "") === selected;
      });
      return matchesSearch && matchesFilters;
    });
  }, [config.rows, config.filters, appliedFilters, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
  const drawerCols = flattenColumns(config.drawerColumns ?? config.columns);
  const hasActiveFilters = Object.values(appliedFilters).some(Boolean);

  const handleCellExplain = (key: string, value: string, row: TableRow) => {
    const resolved = resolveAuditExplanation(key, value, row, i18n.resolvedLanguage);
    if (resolved) setExplanation(resolved);
  };

  const handleSearchChange = (value: string) => {
    setQ(value);
    setPage(1);
  };

  const handleFilterToggle = () => setShowFilter((open) => !open);
  const handleFilterChange = (key: string, value: string) =>
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  const handleFilterApply = () => {
    setAppliedFilters(Object.fromEntries(Object.entries(filterValues).filter(([, value]) => value)));
    setShowFilter(false);
    setPage(1);
  };
  const handleFilterReset = () => {
    setFilterValues({});
    setAppliedFilters({});
    setPage(1);
  };

  return (
    <div className="table-page">
      <div className="table-page__header">
        <div>
          <h1 className="table-page__title">{config.title}</h1>
          <p className="table-page__desc">{config.description}</p>
        </div>
        {config.readOnly && <StatusBadge value="Read only" />}
      </div>

      <MobileSearchFilter
        searchValue={q}
        onSearchChange={handleSearchChange}
        onFilterClick={handleFilterToggle}
        placeholder={translateCommon("common.searchPlaceholder")}
        hasActiveFilters={hasActiveFilters}
      />

      <div className="table-card">
        <div className="table-card__toolbar">
          <div className="table-card__title-group">
            <h2 className="table-card__title">{config.title}</h2>
            <span className="table-card__count" aria-live="polite" aria-atomic="true">
              {filtered.length} {translateCommon("common.records")}
            </span>
          </div>

          <div className="table-card__search-wrapper">
            <AppSearchField
              value={q}
              onChange={handleSearchChange}
              placeholder={translateCommon("common.searchPlaceholder")}
              label={translateCommon("common.searchPlaceholder")}
              size="compact"
            />
          </div>

          {config.filters.length > 0 && (
            <button
              type="button"
              onClick={handleFilterToggle}
              className={`table-card__toolbar-btn${showFilter ? " table-card__toolbar-btn--active" : ""}`}
            >
              <Filter size={13} aria-hidden="true" /> {translateCommon("actions.filter")}
            </button>
          )}

          <button
            type="button"
            className="table-card__toolbar-btn table-card__toolbar-btn--download"
            onClick={() => handleExportDisabled(translateCommon("actions.exportDisabled"))}
          >
            <Download size={13} aria-hidden="true" /> {translateCommon("actions.export")}
          </button>

          <button
            type="button"
            className="table-card__toolbar-btn table-card__toolbar-btn--print"
            onClick={() => window.print()}
          >
            <Printer size={13} aria-hidden="true" /> {translateCommon("actions.print")}
          </button>
        </div>

        {isDesktop && showFilter && config.filters.length > 0 && (
          <div className="table-card__filter-panel">
            <FilterPanel
              filters={config.filters}
              values={filterValues}
              onChange={handleFilterChange}
              onApply={handleFilterApply}
              onReset={handleFilterReset}
              sortSelectOptions
              searchableSelectsAfter={AUDIT_DROPDOWN_SEARCH_THRESHOLD}
            />
          </div>
        )}

        <AppliedFilterChips values={appliedFilters} onClear={handleFilterReset} inCard />

        <ResponsiveTable
          cols={config.columns}
          rows={pageRows}
          onRowClick={(row) => setDrawer(row)}
          noCard
          clickableKeys={config.clickableKeys}
          onCellClick={handleCellExplain}
          mobileCardMapping={config.mobileCardMapping}
          aria-label={config.title}
        />

        <div className="table-card__pagination">
          <Pagination
            total={filtered.length}
            page={safePage}
            perPage={PER_PAGE}
            onPage={setPage}
          />
        </div>
      </div>

      <DynamicDetailsDrawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={config.readOnly ? t("common.readOnlyDetails") : t("common.recordDetails")}
        columns={drawerCols}
        rowData={drawer}
        showActions={false}
      />

      <AuditExplainerDrawer explanation={explanation} onClose={() => setExplanation(null)} />

      {!isDesktop && config.filters.length > 0 && (
        <MobileFilterOverlay
          isOpen={showFilter}
          filters={config.filters}
          values={filterValues}
          onChange={handleFilterChange}
          onApply={handleFilterApply}
          onReset={handleFilterReset}
          onClose={handleFilterToggle}
          sortSelectOptions
          searchableSelectsAfter={AUDIT_DROPDOWN_SEARCH_THRESHOLD}
        />
      )}
    </div>
  );
}

function AuditOverviewPage() {
  const { t, i18n } = useTranslation("audit");
  const navigate = useNavigate();

  type ExploreMetric = "risk_level" | "signals" | "coverage_tier" | "data_quality" | "circle" | "audit_state" | "control_flags" | "assessment_year" | "return_version";
  type WorkloadMetric = "candidates" | "active" | "evidence" | "controls" | "secondReview" | "closed";
  type WorkloadSort = "circle" | "highest";

  const verifiedWorkloadZones = Object.keys(VERIFIED_TAX_JURISDICTIONS);
  const [groupMetric, setGroupMetric] = useState<ExploreMetric>("risk_level");
  const [filterMetric, setFilterMetric] = useState<ExploreMetric | null>(null);
  const [filterValue, setFilterValue] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDropActive, setFilterDropActive] = useState(false);
  const [highlightedValue, setHighlightedValue] = useState<string | null>(null);
  const [selectionCursor, setSelectionCursor] = useState<number | null>(null);
  const [workloadMetric, setWorkloadMetric] = useState<WorkloadMetric>("candidates");
  const [workloadZone, setWorkloadZone] = useState(verifiedWorkloadZones[0] ?? "");
  const [workloadSort, setWorkloadSort] = useState<WorkloadSort>("circle");
  const [circleQuery, setCircleQuery] = useState("");
  const [explanation, setExplanation] = useState<AuditExplanation | null>(null);

  const candidates = getAuditCandidates();
  const population = ALL_TAXPAYER_ROWS;

  // National-scale prototype baselines.
  // 4.0M+ is used as the screened-population floor; 72,341 is the published
  // automatic-audit selection baseline. All other large dashboard figures are
  // proportional projections from the representative prototype records.
  const NATIONAL_SCREENED_POPULATION = 4_000_000;
  const NATIONAL_AUDIT_CANDIDATES = 72_341;

  const formatDashboardNumber = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage === "bn" ? "bn-BD" : "en-US").format(Math.max(0, Math.round(value)));

  const formatDashboardCompact = (value: number) =>
    new Intl.NumberFormat(i18n.resolvedLanguage === "bn" ? "bn-BD" : "en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(Math.max(0, Math.round(value)));

  const projectCount = (sampleCount: number, sampleTotal: number, targetTotal: number) =>
    sampleTotal > 0 ? Math.round((sampleCount / sampleTotal) * targetTotal) : 0;

  function scaleDistribution<T extends { value: number }>(items: T[], targetTotal: number): T[] {
    const sampleTotal = items.reduce((sum, item) => sum + item.value, 0);
    if (!sampleTotal || items.length === 0) return items.map((item) => ({ ...item, value: 0 }));
    const projected = items.map((item) => ({
      ...item,
      value: Math.round((item.value / sampleTotal) * targetTotal),
    }));
    const projectedTotal = projected.reduce((sum, item) => sum + item.value, 0);
    const difference = targetTotal - projectedTotal;
    if (difference !== 0) {
      const largestIndex = projected.reduce(
        (best, item, index, list) => item.value > list[best].value ? index : best,
        0,
      );
      projected[largestIndex] = {
        ...projected[largestIndex],
        value: Math.max(0, projected[largestIndex].value + difference),
      };
    }
    return projected;
  }

  const activeCases = RISK_CASE_ROWS.filter((row) => String(row.case_status ?? "") !== "Closed");
  const closedCases = RISK_CASE_ROWS.filter((row) => String(row.case_status ?? "") === "Closed");
  const pendingEvidence = RISK_CASE_ROWS.filter((row) =>
    ["Pending", "Partial", "Not requested", "Evidence Pending"].includes(String(row.evidence_status ?? ""))
  );
  const openControls = CONTROL_ROWS.filter((row) => String(row.control_status ?? "") !== "Resolved");
  const verificationCases = RISK_CASE_ROWS.filter((row) =>
    ["Assigned", "Verifying", "Evidence Pending"].includes(String(row.case_status ?? ""))
  );
  const auditReviewCases = RISK_CASE_ROWS.filter((row) =>
    ["Ready for Review", "Second Review", "Rework Requested"].includes(String(row.case_status ?? ""))
  );

  const caseSampleTotal = Math.max(1, RISK_CASE_ROWS.length);
  const controlSampleTotal = Math.max(1, CONTROL_ROWS.length);
  const projectedActiveCases = projectCount(activeCases.length, caseSampleTotal, NATIONAL_AUDIT_CANDIDATES);
  const projectedPendingEvidence = projectCount(pendingEvidence.length, caseSampleTotal, NATIONAL_AUDIT_CANDIDATES);
  const projectedOpenControls = projectCount(openControls.length, controlSampleTotal, NATIONAL_AUDIT_CANDIDATES);
  const projectedSecondReview = projectCount(SECOND_REVIEW_ROWS.length, caseSampleTotal, NATIONAL_AUDIT_CANDIDATES);
  const projectedVerificationCases = projectCount(verificationCases.length, caseSampleTotal, NATIONAL_AUDIT_CANDIDATES);
  const projectedAuditReviewCases = projectCount(auditReviewCases.length, caseSampleTotal, NATIONAL_AUDIT_CANDIDATES);
  const projectedClosedCases = projectCount(closedCases.length, caseSampleTotal, NATIONAL_AUDIT_CANDIDATES);

  const latestZoneReconciliation = [...RECONCILIATION_ROWS]
    .filter((row) => String(row.scope ?? "") === "Zone summary")
    .sort((a, b) => String(b.reconciliation_date ?? "").localeCompare(String(a.reconciliation_date ?? "")))[0]
    ?? [...RECONCILIATION_ROWS]
      .sort((a, b) => String(b.reconciliation_date ?? "").localeCompare(String(a.reconciliation_date ?? "")))[0];

  const reconciliationMissing = Number(latestZoneReconciliation?.missing_case_count ?? 0);
  const reconciliationHighRisk = Number(latestZoneReconciliation?.high_risk_returns ?? 0);
  const reconciliationMatched = Number(latestZoneReconciliation?.matching_cases ?? 0);
  const reconciliationRate = reconciliationHighRisk > 0
    ? Math.round((reconciliationMatched / reconciliationHighRisk) * 100)
    : 100;
  const highRiskCandidateSample = candidates.filter((row) =>
    ["High", "Very High"].includes(String(row.risk_level ?? "")),
  ).length;
  const projectedHighRiskReturns = projectCount(
    highRiskCandidateSample,
    Math.max(1, candidates.length),
    NATIONAL_AUDIT_CANDIDATES,
  );
  const projectedReconciliationMatched = Math.round(projectedHighRiskReturns * (reconciliationRate / 100));
  const projectedReconciliationMissing = Math.max(0, projectedHighRiskReturns - projectedReconciliationMatched);

  const countBy = (rows: TableRow[], key: string) => {
    const counts = new Map<string, number>();
    rows.forEach((row) => {
      const value = String(row[key] ?? "—").trim() || "—";
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });
    return counts;
  };

  const riskOrder = ["Low", "Medium", "High", "Very High", "Not determined"];
  const coverageOrder = ["DT0", "DT1", "DT1+H", "DT2", "DT3"];
  const qualityOrder = ["Complete", "Incomplete", "Invalid"];
  const riskCounts = countBy(population, "risk_level");
  const riskItems = scaleDistribution(
    riskOrder.map((label) => ({ label, value: riskCounts.get(label) ?? 0 })),
    NATIONAL_SCREENED_POPULATION,
  );
  const qualityCountsSample = countBy(population, "data_quality");
  const qualityItems = scaleDistribution(
    qualityOrder.map((label) => ({ label, value: qualityCountsSample.get(label) ?? 0 })),
    NATIONAL_SCREENED_POPULATION,
  );
  const qualityCounts = new Map(qualityItems.map((item) => [item.label, item.value]));
  const completeQuality = qualityCounts.get("Complete") ?? 0;
  const completeQualityRate = NATIONAL_SCREENED_POPULATION
    ? Math.round((completeQuality / NATIONAL_SCREENED_POPULATION) * 100)
    : 0;

  const riskColorMap: Record<string, string> = {
    Low: "var(--color-success)",
    Medium: "var(--color-primary)",
    High: "var(--color-warning)",
    "Very High": "var(--color-error)",
    "Not determined": "var(--color-text-tertiary)",
  };

  let riskDonutOffset = 0;
  const riskDonutSegments = riskItems.map((item) => {
    const pct = NATIONAL_SCREENED_POPULATION ? (item.value / NATIONAL_SCREENED_POPULATION) * 100 : 0;
    const segment = { ...item, pct, offset: riskDonutOffset };
    riskDonutOffset += pct;
    return segment;
  });

  const getSignals = (row: TableRow) => String(row.signals ?? "").match(/R-[A-Z]\d+/g) ?? [];

  const exploreDefinitions: Record<ExploreMetric, { label: string; key: ExploreMetric }> = {
    risk_level: { label: t("overview.parameters.risk"), key: "risk_level" },
    signals: { label: t("overview.parameters.signal"), key: "signals" },
    coverage_tier: { label: t("overview.parameters.coverage"), key: "coverage_tier" },
    data_quality: { label: t("overview.parameters.quality"), key: "data_quality" },
    circle: { label: t("overview.parameters.circle"), key: "circle" },
    audit_state: { label: t("overview.parameters.auditState"), key: "audit_state" },
    control_flags: { label: t("overview.parameters.controlFlag"), key: "control_flags" },
    assessment_year: { label: t("overview.parameters.assessmentYear"), key: "assessment_year" },
    return_version: { label: t("overview.parameters.returnVersion"), key: "return_version" },
  };
  const exploreMetricOrder = Object.keys(exploreDefinitions) as ExploreMetric[];

  const metricValues = (metric: ExploreMetric, rows: TableRow[] = population) => {
    if (metric === "signals") {
      const counts = new Map<string, number>();
      rows.forEach((row) => getSignals(row).forEach((signal) => counts.set(signal, (counts.get(signal) ?? 0) + 1)));
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([label, value]) => ({ label, value }));
    }
    const counts = countBy(rows, metric);
    const preferred = metric === "risk_level"
      ? riskOrder
      : metric === "coverage_tier"
        ? coverageOrder
        : metric === "data_quality"
          ? qualityOrder
          : Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
    return preferred
      .map((label) => ({ label, value: counts.get(label) ?? 0 }))
      .filter((item) => item.value > 0);
  };

  const rowMatchesMetric = (row: TableRow, metric: ExploreMetric, value: string) => {
    if (metric === "signals") return getSignals(row).includes(value);
    return String(row[metric] ?? "") === value;
  };

  const filteredPopulation = filterMetric && filterValue !== "all"
    ? population.filter((row) => rowMatchesMetric(row, filterMetric, filterValue))
    : population;
  const projectedFilteredPopulation = projectCount(
    filteredPopulation.length,
    Math.max(1, population.length),
    NATIONAL_SCREENED_POPULATION,
  );
  const exploreItems = metricValues(groupMetric, filteredPopulation)
    .slice(0, 12)
    .map((item) => ({
      ...item,
      value: projectCount(item.value, Math.max(1, population.length), NATIONAL_SCREENED_POPULATION),
    }));
  const filterOptions = filterMetric ? metricValues(filterMetric).map((item) => item.label) : [];
  const maxExploreValue = Math.max(1, ...exploreItems.map((item) => item.value));
  const highlightedItem = exploreItems.find((item) => item.label === highlightedValue) ?? exploreItems[0] ?? null;

  const openOverviewExplanation = (
    metric: ExploreMetric,
    value: string,
    count: number,
    denominator = projectedFilteredPopulation,
  ) => {
    const dashboardRow: TableRow = {
      [metric]: value,
      ...(metric === "signals" ? { signals:value } : {}),
      ...(metric === "control_flags" ? { control_flags:value } : {}),
    };
    const resolved = resolveAuditExplanation(
      metric,
      value,
      dashboardRow,
      i18n.resolvedLanguage,
    );
    if (!resolved) return;

    const share = denominator > 0 ? Math.round((count / denominator) * 100) : 0;
    const filterContext = filterMetric && filterValue !== "all"
      ? `${exploreDefinitions[filterMetric].label}: ${filterValue}`
      : t("overview.explainer.allScreenedReturns");

    setExplanation({
      ...resolved,
      sections:[
        {
          title:t("overview.explainer.currentView"),
          items:[
            { label:t("overview.explainer.modeledReturns"), value:formatDashboardNumber(count) },
            { label:t("overview.explainer.shareOfView"), value:`${share}%` },
            { label:t("overview.explainer.filterContext"), value:filterContext },
          ],
        },
        ...resolved.sections,
      ],
    });
  };

  const explorerColor = (label: string) => {
    if (groupMetric === "risk_level") return riskColorMap[label] ?? "var(--color-primary)";
    if (groupMetric === "data_quality") {
      if (label === "Complete") return "var(--color-success)";
      if (label === "Invalid") return "var(--color-error)";
      return "var(--color-warning)";
    }
    return "var(--color-primary)";
  };

  const buildPopulationDrilldown = (metric?: ExploreMetric, value?: string) => {
    const params = new URLSearchParams();
    let filterIndex = 0;
    const addCondition = (conditionMetric: ExploreMetric, conditionValue: string) => {
      if (conditionMetric === "signals") {
        params.set("q", conditionValue);
        return;
      }
      filterIndex += 1;
      const suffix = filterIndex === 1 ? "" : String(filterIndex);
      params.set(`filterKey${suffix}`, conditionMetric);
      params.set(`filterValue${suffix}`, conditionValue);
    };
    if (filterMetric && filterValue !== "all") addCondition(filterMetric, filterValue);
    if (metric && value && !(metric === filterMetric && value === filterValue)) addCondition(metric, value);
    const query = params.toString();
    return query ? `/audit/all-taxpayers?${query}` : "/audit/all-taxpayers";
  };

  const trackBuckets: Record<string, { label: string; count: number; latest: string; routeValue: string }> = {
    risk: { label: t("initiate.tracks.risk.title"), count: 0, latest: "—", routeValue: "" },
    control: { label: t("initiate.tracks.control.title"), count: 0, latest: "—", routeValue: "" },
    population: { label: t("initiate.tracks.population.title"), count: 0, latest: "—", routeValue: "" },
    manual: { label: t("initiate.tracks.manual.title"), count: 0, latest: "—", routeValue: "" },
    existing: { label: t("overview.existingPlan"), count: 0, latest: "—", routeValue: "" },
  };

  candidates.forEach((candidate) => {
    const rawTrack = String(candidate.selection_track ?? "").toLowerCase();
    const bucket = rawTrack.includes("risk")
      ? "risk"
      : rawTrack.includes("control")
        ? "control"
        : rawTrack.includes("population") || rawTrack.includes("circle")
          ? "population"
          : rawTrack.includes("manual")
            ? "manual"
            : "existing";
    trackBuckets[bucket].count += 1;
    if (!trackBuckets[bucket].routeValue) {
      trackBuckets[bucket].routeValue = String(candidate.selection_track ?? "");
    }
    const selectedOn = String(candidate.selected_on ?? "");
    if (selectedOn && (trackBuckets[bucket].latest === "—" || selectedOn > trackBuckets[bucket].latest)) {
      trackBuckets[bucket].latest = selectedOn;
    }
  });
  const selectionItemsSample = Object.values(trackBuckets)
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
  const selectionCountProjection = scaleDistribution(
    selectionItemsSample.map((item) => ({ value: item.count })),
    NATIONAL_AUDIT_CANDIDATES,
  );
  const selectionItems = selectionItemsSample.map((item, index) => ({
    ...item,
    count: selectionCountProjection[index]?.value ?? 0,
  }));
  const maxSelectionCount = Math.max(1, ...selectionItems.map((item) => item.count));
  const selectionTotal = selectionItems.reduce((sum, item) => sum + item.count, 0);

  const selectionByDate = new Map<string, number>();
  const seenCandidateBatches = new Set<string>();
  candidates.forEach((candidate) => {
    const batchId = String(candidate.batch_id ?? candidate.selected_on ?? candidate.candidate_id ?? "");
    if (seenCandidateBatches.has(batchId)) return;
    seenCandidateBatches.add(batchId);
    const date = String(candidate.selected_on ?? "");
    if (!date) return;
    const batchCount = candidates.filter((row) => String(row.batch_id ?? row.selected_on ?? row.candidate_id ?? "") === batchId).length;
    selectionByDate.set(date, (selectionByDate.get(date) ?? 0) + batchCount);
  });

  const selectionTimelineSample = Array.from(selectionByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, selected]) => ({ date, value: selected }));
  const selectionTimelineProjected = scaleDistribution(selectionTimelineSample, NATIONAL_AUDIT_CANDIDATES);

  let runningCandidates = 0;
  const selectionTimeline = selectionTimelineProjected.map(({ date, value }) => {
    runningCandidates += value;
    return { date, selected: value, cumulative: runningCandidates };
  });

  const timelineIndex = selectionTimeline.length
    ? Math.min(selectionCursor ?? selectionTimeline.length - 1, selectionTimeline.length - 1)
    : 0;
  const activeTimelinePoint = selectionTimeline[timelineIndex] ?? { date: "—", selected: 0, cumulative: 0 };
  const timelineWidth = 720;
  const timelineHeight = 198;
  const timelinePad = { left: 44, right: 24, top: 24, bottom: 34 };
  const timelineInnerW = timelineWidth - timelinePad.left - timelinePad.right;
  const timelineInnerH = timelineHeight - timelinePad.top - timelinePad.bottom;
  const timelineMax = Math.max(1, ...selectionTimeline.map((point) => point.cumulative));
  const timelinePoints = selectionTimeline.map((point, index) => ({
    ...point,
    x: timelinePad.left + (timelineInnerW * index) / Math.max(1, selectionTimeline.length - 1),
    y: timelinePad.top + (1 - point.cumulative / timelineMax) * timelineInnerH,
  }));
  const timelinePath = timelinePoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const timelineArea = timelinePoints.length
    ? [
        `M ${timelinePoints[0].x} ${timelinePad.top + timelineInnerH}`,
        ...timelinePoints.map((point) => `L ${point.x} ${point.y}`),
        `L ${timelinePoints[timelinePoints.length - 1].x} ${timelinePad.top + timelineInnerH}`,
        "Z",
      ].join(" ")
    : "";
  const activeTimelineSvgPoint = timelinePoints[timelineIndex];
  const timelineSelectedMax = Math.max(1, ...selectionTimeline.map((point) => point.selected));
  const timelineBarWidth = Math.max(12, Math.min(34, timelineInnerW / Math.max(1, selectionTimeline.length) * 0.34));
  const openSelectionDate = (date: string) => {
    if (!date || date === "—") return;
    navigate(`/audit/audit-candidates?selectedOn=${encodeURIComponent(date)}`);
  };
  const openSelectionTrack = (selectionTrack: string) => {
    navigate(selectionTrack
      ? `/audit/audit-candidates?selectionTrack=${encodeURIComponent(selectionTrack)}`
      : "/audit/audit-candidates");
  };

  const queueItems = [
    { label: t("overview.queues.risk"), count: projectedActiveCases, detail: t("overview.queueWaiting.risk"), status: t("overview.queueStatus.inProgress"), tone: "warning", route: "/audit/risk-cases" },
    { label: t("overview.queues.control"), count: projectedOpenControls, detail: t("overview.queueWaiting.control"), status: t("overview.queueStatus.inProgress"), tone: "primary", route: "/audit/control-data-quality" },
    { label: t("overview.queues.secondReview"), count: projectedSecondReview, detail: t("overview.queueWaiting.secondReview"), status: t("overview.queueStatus.pendingReview"), tone: "primary", route: "/audit/second-review" },
    { label: t("overview.queues.reconciliation"), count: projectedReconciliationMissing, detail: t("overview.queueWaiting.reconciliation"), status: projectedReconciliationMissing ? t("overview.queueStatus.needsAttention") : t("overview.queueStatus.matched"), tone: projectedReconciliationMissing ? "error" : "success", route: "/audit/reconciliation" },
  ];

  const verifiedWorkloadCircles = getVerifiedCirclesForZone(workloadZone);
  const fallbackCircles = Array.from(new Set([
    ...population.map((row) => String(row.circle ?? "")),
    ...candidates.map((row) => String(row.circle ?? "")),
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const workloadCircles = verifiedWorkloadCircles.length ? verifiedWorkloadCircles : fallbackCircles;

  const normalizeWorkloadCircle = (value: unknown) => {
    const raw = String(value ?? "").trim();
    const legacy = raw.match(/^Circle-(\d{1,2})$/i);
    if (legacy && verifiedWorkloadCircles.length) {
      const mapped = verifiedWorkloadCircles[Number(legacy[1]) - 1];
      if (mapped) return mapped;
    }
    return raw;
  };

  const rowBelongsToWorkloadZone = (row: TableRow) => {
    const zone = String(row.zone ?? "").trim();
    return !workloadZone || !zone || zone === "—" || zone === workloadZone;
  };

  const countCircleRows = (rows: TableRow[], circle: string) =>
    rows.filter((row) => rowBelongsToWorkloadZone(row) && normalizeWorkloadCircle(row.circle) === circle).length;

  const circleItems = workloadCircles.map((circle) => ({
    circle,
    candidates: projectCount(countCircleRows(candidates, circle), Math.max(1, candidates.length), NATIONAL_AUDIT_CANDIDATES),
    active: projectCount(countCircleRows(activeCases, circle), caseSampleTotal, projectedActiveCases),
    evidence: projectCount(countCircleRows(pendingEvidence, circle), caseSampleTotal, projectedPendingEvidence),
    controls: projectCount(countCircleRows(openControls, circle), controlSampleTotal, projectedOpenControls),
    secondReview: projectCount(countCircleRows(SECOND_REVIEW_ROWS, circle), caseSampleTotal, projectedSecondReview),
    closed: projectCount(countCircleRows(closedCases, circle), caseSampleTotal, projectedClosedCases),
  }));

  const workloadLabels: Record<WorkloadMetric, string> = {
    candidates: t("overview.workloadMetric.candidates"),
    active: t("overview.workloadMetric.active"),
    evidence: t("overview.workloadMetric.evidence"),
    controls: t("overview.workloadMetric.controls"),
    secondReview: t("overview.workloadMetric.secondReview"),
    closed: t("overview.workloadMetric.closed"),
  };

  const circleQueryNeedle = circleQuery.trim().toLowerCase();
  const visibleCircleItems = [...circleItems]
    .filter((item) => !circleQueryNeedle || item.circle.toLowerCase().includes(circleQueryNeedle))
    .sort((a, b) => workloadSort === "highest"
      ? Number(b[workloadMetric] ?? 0) - Number(a[workloadMetric] ?? 0) || a.circle.localeCompare(b.circle)
      : workloadCircles.indexOf(a.circle) - workloadCircles.indexOf(b.circle));

  const workloadMax = Math.max(1, ...circleItems.map((item) => Number(item[workloadMetric] ?? 0)));
  const workloadTotal = circleItems.reduce((sum, item) => sum + Number(item[workloadMetric] ?? 0), 0);
  const busiestCircle = [...circleItems].sort((a, b) => Number(b[workloadMetric] ?? 0) - Number(a[workloadMetric] ?? 0))[0];
  const workloadAverage = circleItems.length ? Math.round((workloadTotal / circleItems.length) * 10) / 10 : 0;

  const sourceRowsForWorkloadMetric = () => {
    if (workloadMetric === "controls") return openControls;
    if (workloadMetric === "secondReview") return SECOND_REVIEW_ROWS;
    if (workloadMetric === "active" || workloadMetric === "closed" || workloadMetric === "evidence") return RISK_CASE_ROWS;
    return candidates;
  };

  const routeCircleValue = (circle: string) => {
    const sourceRows = sourceRowsForWorkloadMetric();
    if (sourceRows.some((row) => String(row.circle ?? "") === circle)) return circle;
    const verifiedIndex = verifiedWorkloadCircles.indexOf(circle);
    if (verifiedIndex >= 0) {
      const legacy = `Circle-${verifiedIndex + 1}`;
      if (sourceRows.some((row) => String(row.circle ?? "") === legacy)) return legacy;
    }
    return circle;
  };

  const workloadRoute = (circle: string) => {
    const routeCircle = routeCircleValue(circle);
    if (workloadMetric === "controls") return `/audit/control-data-quality?filterKey=circle&filterValue=${encodeURIComponent(routeCircle)}`;
    if (workloadMetric === "secondReview") return `/audit/second-review?filterKey=circle&filterValue=${encodeURIComponent(routeCircle)}`;
    if (workloadMetric === "active" || workloadMetric === "closed" || workloadMetric === "evidence") return `/audit/risk-cases?filterKey=circle&filterValue=${encodeURIComponent(routeCircle)}`;
    return `/audit/all-taxpayers?filterKey=circle&filterValue=${encodeURIComponent(routeCircle)}`;
  };

  const activeRuleRows = RULE_ROWS.filter((row) => String(row.mode ?? "") !== "Superseded");
  const liveRules = activeRuleRows.filter((row) => String(row.mode ?? "") === "Live").length;
  const stagedRules = activeRuleRows.filter((row) => String(row.mode ?? "") === "Staged").length;
  const shadowRules = activeRuleRows.filter((row) => String(row.mode ?? "") === "Shadow").length;
  const draftRules = activeRuleRows.filter((row) => String(row.mode ?? "") === "Draft").length;
  const pendingGovernance = activeRuleRows.filter((row) => String(row.governance_status ?? "").startsWith("Awaiting")).length;
  const sensitiveAccessEvents = AUDIT_TRAIL_ROWS.filter((row) => String(row.action ?? "").toLowerCase().includes("sensitive")).length;
  const recentEvents = [...AUDIT_TRAIL_ROWS].reverse().slice(0, 3);

  const operations = [
    { step: "01", title: t("overview.operations.screening"), value: NATIONAL_AUDIT_CANDIDATES, detail: t("overview.operations.screeningDetail"), route: "/audit/audit-candidates" },
    { step: "02", title: t("overview.operations.verification"), value: projectedVerificationCases, detail: t("overview.operations.verificationDetail"), route: "/audit/risk-cases" },
    { step: "03", title: t("overview.operations.audit"), value: projectedAuditReviewCases, detail: t("overview.operations.auditDetail"), route: "/audit/second-review" },
    { step: "04", title: t("overview.operations.finalDetermination"), value: projectedClosedCases, detail: t("overview.operations.finalDeterminationDetail"), route: "/audit/risk-cases?filterKey=case_status&filterValue=Closed" },
  ];

  const formatDashboardDate = (value: string) => {
    if (!value || value === "—") return "—";
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(i18n.resolvedLanguage === "bn" ? "bn-BD" : "en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  return (
    <div className="dashboard-page audit-overview-dashboard audit-overview-v5">
      <div className="audit-overview__page-header">
        <div>
          <h1 className="dashboard-page__title">{t("pages.overview.title")}</h1>
          <p className="dashboard-page__subtitle">{t("pages.overview.description")}</p>
        </div>
        <span className="audit-overview__scope-badge" title={t("overview.nationalScaleHelp")}>
          <Scale size={14} aria-hidden="true" />
          {t("overview.nationalScale")}
        </span>
      </div>

      <div className="dashboard-kpi-section audit-overview__kpis">
        <div className="dashboard-kpi-grid">
          <StatCard icon={Workflow} value={formatDashboardNumber(NATIONAL_AUDIT_CANDIDATES)} label={t("overview.auditCandidates")} subInfo={t("overview.officialSelectionBaseline")} tone="primary" onClick={() => navigate("/audit/audit-candidates")} />
          <StatCard icon={ShieldAlert} value={formatDashboardNumber(projectedActiveCases)} label={t("overview.activeAuditCases")} tone="warning" onClick={() => navigate("/audit/risk-cases")} />
          <StatCard icon={FileSearch} value={formatDashboardNumber(projectedPendingEvidence)} label={t("overview.evidenceToResolve")} tone="warning" onClick={() => navigate("/audit/risk-cases?q=Pending")} />
          <StatCard icon={Activity} value={formatDashboardNumber(projectedOpenControls)} label={t("overview.openControlItems")} tone="primary" onClick={() => navigate("/audit/control-data-quality")} />
          <StatCard icon={Timer} value={formatDashboardNumber(projectedSecondReview)} label={t("overview.secondReviewWorkload")} tone="primary" onClick={() => navigate("/audit/second-review")} />
          <StatCard icon={Scale} value={projectedHighRiskReturns ? `${formatDashboardNumber(projectedReconciliationMatched)}/${formatDashboardNumber(projectedHighRiskReturns)}` : "—"} label={t("overview.reconciliation")} tone={projectedReconciliationMissing ? "error" : "success"} compactValue onClick={() => navigate("/audit/reconciliation")} />
        </div>
      </div>

      <div className="dashboard-content-stack audit-overview__stack">
        <DashSection title={t("overview.auditFlow")} icon={Workflow}>
          <div className="audit-overview-v5__flow">
            {operations.map((item, index) => (
              <button type="button" className="audit-overview-v5__flow-stage" key={item.step} title={item.detail} onClick={() => navigate(item.route)}>
                <span>{item.step}</span>
                <div><strong>{item.title}</strong><small>{item.detail}</small></div>
                <b>{formatDashboardNumber(item.value)}</b>
                {index < operations.length - 1 && <ChevronRight size={16} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </DashSection>

        <DashSection title={t("overview.customAnalysis")} icon={Scale}>
          <div className="audit-overview-v5__analysis">
            <aside className="audit-overview-v5__risk">
              <div className="audit-overview-v5__panel-head">
                <div>
                  <strong>{t("overview.riskDistribution")}</strong>
                  <span title={`${formatDashboardNumber(NATIONAL_SCREENED_POPULATION)}+ ${t("overview.returnsShort")}`}>
                    {formatDashboardCompact(NATIONAL_SCREENED_POPULATION)}+ {t("overview.returnsShort")}
                  </span>
                </div>
                <button type="button" onClick={() => navigate("/audit/all-taxpayers")}>{t("overview.openTable")}</button>
              </div>

              <button type="button" className="audit-overview-v5__donut-button" onClick={() => navigate("/audit/all-taxpayers")}>
                <div className="audit-overview-v5__donut">
                  <svg viewBox="0 0 120 120" aria-hidden="true">
                    <circle className="audit-overview-v5__donut-track" cx="60" cy="60" r="48" />
                    {riskDonutSegments.map((segment) => (
                      <circle
                        key={segment.label}
                        className="audit-overview-v5__donut-segment"
                        cx="60"
                        cy="60"
                        r="48"
                        pathLength="100"
                        stroke={riskColorMap[segment.label]}
                        strokeDasharray={`${segment.pct} ${100 - segment.pct}`}
                        strokeDashoffset={-segment.offset}
                      />
                    ))}
                  </svg>
                  <div>
                    <strong title={`${formatDashboardNumber(NATIONAL_SCREENED_POPULATION)}+`}>
                      {formatDashboardCompact(NATIONAL_SCREENED_POPULATION)}+
                    </strong>
                    <span>{t("overview.screenedPopulation")}</span>
                  </div>
                </div>
              </button>

              <div className="audit-overview-v5__risk-list">
                {riskItems.map((item) => (
                  <div className="audit-overview-v5__concept-row" key={item.label}>
                    <button
                      type="button"
                      className="audit-overview-v5__concept-detail"
                      title={t("overview.explainer.openDetails")}
                      onClick={() => openOverviewExplanation("risk_level", item.label, item.value, NATIONAL_SCREENED_POPULATION)}
                    >
                      <i style={{ background:riskColorMap[item.label] }} />
                      <span>{item.label}</span>
                      <strong>{formatDashboardNumber(item.value)}</strong>
                      <small>{NATIONAL_SCREENED_POPULATION ? Math.round((item.value / NATIONAL_SCREENED_POPULATION) * 100) : 0}%</small>
                      <Info size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="audit-overview-v5__concept-records"
                      aria-label={`${t("overview.openRecords")} · ${item.label}`}
                      onClick={() => navigate(buildPopulationDrilldown("risk_level", item.label))}
                    >
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="audit-overview-v5__quality">
                <div className="audit-overview-v5__mini-title">{t("overview.dataQuality")}</div>
                {qualityOrder.map((label) => {
                  const value = qualityCounts.get(label) ?? 0;
                  return (
                    <div className="audit-overview-v5__quality-row" key={label}>
                      <button
                        type="button"
                        className="audit-overview-v5__quality-detail"
                        title={t("overview.explainer.openDetails")}
                        onClick={() => openOverviewExplanation("data_quality", label, value, NATIONAL_SCREENED_POPULATION)}
                      >
                        <span>{label}</span>
                        <strong>{formatDashboardNumber(value)}</strong>
                        <small>{NATIONAL_SCREENED_POPULATION ? Math.round((value / NATIONAL_SCREENED_POPULATION) * 100) : 0}%</small>
                        <Info size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="audit-overview-v5__concept-records"
                        aria-label={`${t("overview.openRecords")} · ${label}`}
                        onClick={() => navigate(buildPopulationDrilldown("data_quality", label))}
                      >
                        <ChevronRight size={13} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </aside>

            <div className="audit-overview-v5__workspace">
              <div className="audit-overview-v5__workspace-head">
                <div>
                  <strong>{t("overview.explorePopulation")}</strong>
                  <span>{t("overview.customAnalysisHint")}</span>
                </div>
                <button type="button" className="audit-overview-v5__open-table" onClick={() => navigate(buildPopulationDrilldown())}>
                  {t("overview.openTable")} <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>

              <div className="audit-overview-v5__parameters">
                {exploreMetricOrder.map((metric) => (
                  <button
                    type="button"
                    draggable
                    key={metric}
                    className={groupMetric === metric ? "is-active" : ""}
                    title={t("overview.dragParameterTitle")}
                    onClick={() => { setGroupMetric(metric); setHighlightedValue(null); }}
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", metric)}
                  >
                    {exploreDefinitions[metric].label}
                  </button>
                ))}
              </div>

              <div className="audit-overview-v6__analysis-controls">
                <span className="audit-overview-v6__view-by">
                  {t("overview.viewBy")} <strong>{exploreDefinitions[groupMetric].label}</strong>
                </span>
                {!filterOpen ? (
                  <button
                    type="button"
                    className={`audit-overview-v6__add-filter${filterDropActive ? " is-drag-over" : ""}`}
                    onClick={() => setFilterOpen(true)}
                    onDragEnter={(event) => { event.preventDefault(); setFilterDropActive(true); }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setFilterDropActive(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      const metric = event.dataTransfer.getData("text/plain") as ExploreMetric;
                      if (metric && exploreDefinitions[metric]) {
                        setFilterMetric(metric);
                        setFilterValue("all");
                        setFilterOpen(true);
                      }
                      setFilterDropActive(false);
                    }}
                  >
                    + {t("overview.addFilter")}
                  </button>
                ) : (
                  <div
                    className="audit-overview-v6__filter-controls"
                    onDragEnter={(event) => { event.preventDefault(); setFilterDropActive(true); }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setFilterDropActive(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      const metric = event.dataTransfer.getData("text/plain") as ExploreMetric;
                      if (metric && exploreDefinitions[metric]) {
                        setFilterMetric(metric);
                        setFilterValue("all");
                      }
                      setFilterDropActive(false);
                    }}
                  >
                    <div className="audit-overview-v6__filter-field">
                      <AppSelectField
                        id="audit-overview-filter-by"
                        label={t("overview.filterBy")}
                        value={filterMetric ?? ""}
                        onChange={(value) => {
                          const next = value as ExploreMetric;
                          setFilterMetric(next || null);
                          setFilterValue("all");
                          setHighlightedValue(null);
                        }}
                        options={[
                          { value: "", label: t("overview.chooseParameter") },
                          ...exploreMetricOrder.map((metric) => ({
                            value: metric,
                            label: exploreDefinitions[metric].label,
                          })),
                        ]}
                        compact
                        sortOptions
                        searchableAfter={AUDIT_DROPDOWN_SEARCH_THRESHOLD}
                      />
                    </div>
                    <div className="audit-overview-v6__filter-field">
                      <AppSelectField
                        id="audit-overview-filter-value"
                        label={t("overview.filterValue")}
                        value={filterValue}
                        disabled={!filterMetric}
                        onChange={(value) => {
                          setFilterValue(value);
                          setHighlightedValue(null);
                        }}
                        options={[
                          { value: "all", label: t("overview.allValues") },
                          ...filterOptions.map((value) => ({ value, label: value })),
                        ]}
                        compact
                        sortOptions
                        searchableAfter={AUDIT_DROPDOWN_SEARCH_THRESHOLD}
                      />
                    </div>
                    <button
                      type="button"
                      className="audit-overview-v6__clear-filter"
                      onClick={() => {
                        setFilterMetric(null);
                        setFilterValue("all");
                        setFilterOpen(false);
                        setHighlightedValue(null);
                      }}
                    >
                      {t("overview.clearFilter")}
                    </button>
                  </div>
                )}
              </div>

              <div className="audit-overview-v5__insight" aria-live="polite">
                <div>
                  <span>{exploreDefinitions[groupMetric].label}{filterMetric && filterValue !== "all" ? ` · ${filterValue}` : ""}</span>
                  <strong>{highlightedItem?.label ?? "—"}</strong>
                </div>
                <div>
                  <strong>{highlightedItem ? formatDashboardNumber(highlightedItem.value) : 0}</strong>
                  <span>{t("overview.returnsShort")}</span>
                </div>
                <div>
                  <strong>{highlightedItem && projectedFilteredPopulation ? Math.round((highlightedItem.value / projectedFilteredPopulation) * 100) : 0}%</strong>
                  <span>{t("overview.ofCurrentView")}</span>
                </div>
                {highlightedItem && (
                  <button type="button" onClick={() => navigate(buildPopulationDrilldown(groupMetric, highlightedItem.label))}>
                    {t("overview.openRecords")} <ChevronRight size={14} aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="audit-overview-v5__horizontal-chart" role="list" aria-label={exploreDefinitions[groupMetric].label}>
                {exploreItems.map((item) => (
                  <div
                    className={highlightedItem?.label === item.label
                      ? "audit-overview-v5__chart-row is-active"
                      : "audit-overview-v5__chart-row"}
                    role="listitem"
                    key={item.label}
                    onPointerEnter={() => setHighlightedValue(item.label)}
                  >
                    <button
                      type="button"
                      className="audit-overview-v5__chart-detail"
                      title={t("overview.explainer.openDetails")}
                      onFocus={() => setHighlightedValue(item.label)}
                      onClick={() => openOverviewExplanation(groupMetric, item.label, item.value)}
                    >
                      <span className="audit-overview-v5__bar-label">{item.label}</span>
                      <span className="audit-overview-v5__bar-track"><i style={{ width: `${Math.max(2, (item.value / maxExploreValue) * 100)}%`, background: explorerColor(item.label) }} /></span>
                      <strong>{formatDashboardNumber(item.value)}</strong>
                      <small>{projectedFilteredPopulation ? Math.round((item.value / projectedFilteredPopulation) * 100) : 0}%</small>
                      <Info size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="audit-overview-v5__concept-records"
                      aria-label={`${t("overview.openRecords")} · ${item.label}`}
                      onClick={() => navigate(buildPopulationDrilldown(groupMetric, item.label))}
                    >
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DashSection>

        <div className="dashboard-section-grid audit-overview-v2__analytics-grid">
          <DashSection title={t("overview.selectionActivity")} icon={FileSearch}>
            <div className="audit-overview-v7__selection">
              <div className="audit-overview-v7__selection-summary" aria-live="polite">
                <div>
                  <span>{t("overview.selectionDate")}</span>
                  <strong>{formatDashboardDate(activeTimelinePoint.date)}</strong>
                </div>
                <div>
                  <span>{t("overview.addedOnDate")}</span>
                  <strong>+{formatDashboardNumber(activeTimelinePoint.selected)}</strong>
                </div>
                <div>
                  <span>{t("overview.cumulativeCandidates")}</span>
                  <strong>{formatDashboardNumber(activeTimelinePoint.cumulative)}</strong>
                </div>
                <button type="button" onClick={() => openSelectionDate(activeTimelinePoint.date)}>
                  {t("overview.openCandidates")} <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>

              <div className="audit-overview-v7__timeline-meta">
                <strong>{t("overview.candidateGrowth")}</strong>
                <span>{t("overview.hoverTimelineHint")}</span>
                <div className="audit-overview-v7__timeline-legend" aria-label={t("overview.chartLegend")}>
                  <span><i className="is-added" />{t("overview.addedOnDate")}</span>
                  <span><i className="is-cumulative" />{t("overview.cumulativeCandidates")}</span>
                </div>
              </div>

              {timelinePoints.length > 0 && (
                <div className="audit-overview-v7__timeline-chart">
                  <svg
                    viewBox={`0 0 ${timelineWidth} ${timelineHeight}`}
                    role="img"
                    aria-label={t("overview.selectionActivity")}
                    onPointerMove={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const x = ((event.clientX - rect.left) / rect.width) * timelineWidth;
                      let nearestIndex = 0;
                      let nearestDistance = Number.POSITIVE_INFINITY;
                      timelinePoints.forEach((point, index) => {
                        const distance = Math.abs(point.x - x);
                        if (distance < nearestDistance) {
                          nearestDistance = distance;
                          nearestIndex = index;
                        }
                      });
                      setSelectionCursor(nearestIndex);
                    }}
                    onPointerLeave={() => setSelectionCursor(null)}
                  >
                    {[0.25, 0.5, 0.75, 1].map((ratio) => {
                      const y = timelinePad.top + timelineInnerH * (1 - ratio);
                      return <line key={ratio} className="audit-overview-v7__grid" x1={timelinePad.left} x2={timelineWidth - timelinePad.right} y1={y} y2={y} />;
                    })}
                    <line className="audit-overview-v7__baseline" x1={timelinePad.left} x2={timelineWidth - timelinePad.right} y1={timelinePad.top + timelineInnerH} y2={timelinePad.top + timelineInnerH} />
                    {timelinePoints.map((point, index) => {
                      const barHeight = Math.max(5, (point.selected / timelineSelectedMax) * (timelineInnerH * 0.42));
                      return (
                        <rect
                          key={`${point.date}-bar`}
                          className={index === timelineIndex ? "audit-overview-v7__added-bar is-active" : "audit-overview-v7__added-bar"}
                          x={point.x - timelineBarWidth / 2}
                          y={timelinePad.top + timelineInnerH - barHeight}
                          width={timelineBarWidth}
                          height={barHeight}
                          rx="4"
                        />
                      );
                    })}
                    <path className="audit-overview-v7__timeline-area" d={timelineArea} />
                    <path className="audit-overview-v7__timeline-line" d={timelinePath} />
                    {activeTimelineSvgPoint && <line className="audit-overview-v7__timeline-cursor" x1={activeTimelineSvgPoint.x} x2={activeTimelineSvgPoint.x} y1={timelinePad.top} y2={timelinePad.top + timelineInnerH} />}
                    {timelinePoints.map((point, index) => (
                      <g key={point.date} onClick={() => setSelectionCursor(index)} style={{ cursor: "pointer" }}>
                        <title>{`${formatDashboardDate(point.date)} · ${formatDashboardNumber(point.cumulative)} ${t("overview.candidatesShort")}`}</title>
                        <circle className={index === timelineIndex ? "audit-overview-v7__timeline-point is-active" : "audit-overview-v7__timeline-point"} cx={point.x} cy={point.y} r={index === timelineIndex ? 6 : 4.5} />
                        <text className="audit-overview-v7__timeline-value" x={point.x} y={Math.max(14, point.y - 12)} textAnchor="middle">{formatDashboardCompact(point.cumulative)}</text>
                        <text className="audit-overview-v7__timeline-label" x={point.x} y={timelineHeight - 10} textAnchor="middle">{formatDashboardDate(point.date).replace(/ \d{4}$/, "")}</text>
                      </g>
                    ))}
                  </svg>
                </div>
              )}

              <div className="audit-overview-v7__source-head">
                <div>
                  <strong>{t("overview.selectionSources")}</strong>
                  <span>{t("overview.selectionSourcesHint")}</span>
                </div>
                <span>{formatDashboardNumber(selectionTotal)} {t("overview.candidatesShort")}</span>
              </div>
              <div className="audit-overview-v7__source-list">
                {selectionItems.map((item) => {
                  const share = selectionTotal ? Math.round((item.count / selectionTotal) * 100) : 0;
                  return (
                    <button type="button" key={item.label} onClick={() => openSelectionTrack(item.routeValue)}>
                      <span className="audit-overview-v7__source-copy">
                        <strong>{item.label}</strong>
                        <small>{t("overview.latestSelection")} · {formatDashboardDate(item.latest)}</small>
                      </span>
                      <span className="audit-overview-v7__source-bar"><i style={{ width: `${(item.count / maxSelectionCount) * 100}%` }} /></span>
                      <strong>{formatDashboardNumber(item.count)}</strong>
                      <small>{share}%</small>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>
          </DashSection>

          <DashSection title={t("overview.circleWorkload")} icon={Activity}>
            <div className="audit-overview-v6__workload">
              <div className="audit-overview-v6__workload-top">
                <div className="audit-overview-v6__scope">
                  <span>{t("overview.workloadScope")}</span>
                  {verifiedWorkloadZones.length > 1 ? (
                    <div className="audit-overview-v6__scope-select">
                      <AppSelectField
                        id="audit-overview-workload-zone"
                        label=""
                        ariaLabel={t("overview.workloadScope")}
                        value={workloadZone}
                        onChange={(value) => {
                          setWorkloadZone(value);
                          setCircleQuery("");
                        }}
                        options={verifiedWorkloadZones}
                        compact
                        sortOptions
                        searchableAfter={AUDIT_DROPDOWN_SEARCH_THRESHOLD}
                      />
                    </div>
                  ) : (
                    <strong>{workloadZone || t("overview.allVerifiedCircles")}</strong>
                  )}
                  <small>{workloadCircles.length} {t("overview.circlesShort")}</small>
                </div>
                <div className="audit-overview-v2__metric-toggle audit-overview-v6__workload-tabs" role="group" aria-label={t("overview.circleWorkload")}>
                  {(Object.keys(workloadLabels) as WorkloadMetric[]).map((key) => (
                    <button type="button" key={key} className={workloadMetric === key ? "is-active" : ""} aria-pressed={workloadMetric === key} onClick={() => setWorkloadMetric(key)}>{workloadLabels[key]}</button>
                  ))}
                </div>
              </div>

              <div className="audit-overview-v6__workload-summary">
                <div><span>{t("overview.currentMetric")}</span><strong>{formatDashboardNumber(workloadTotal)}</strong><small>{workloadLabels[workloadMetric]}</small></div>
                <div><span>{t("overview.busiestCircle")}</span><strong>{busiestCircle?.circle ?? "—"}</strong><small>{busiestCircle ? Number(busiestCircle[workloadMetric] ?? 0) : 0} {workloadLabels[workloadMetric].toLowerCase()}</small></div>
                <div><span>{t("overview.averagePerCircle")}</span><strong>{formatDashboardNumber(workloadAverage)}</strong><small>{workloadLabels[workloadMetric]}</small></div>
              </div>

              <div className="audit-overview-v6__workload-tools">
                <AppSearchField
                  value={circleQuery}
                  onChange={setCircleQuery}
                  label={t("overview.searchCircles")}
                  placeholder={t("overview.searchCircles")}
                  size="compact"
                />
                <div className="audit-overview-v6__sort-toggle" role="group" aria-label={t("overview.sortCircles")}>
                  <button type="button" className={workloadSort === "circle" ? "is-active" : ""} onClick={() => setWorkloadSort("circle")}>{t("overview.circleOrder")}</button>
                  <button type="button" className={workloadSort === "highest" ? "is-active" : ""} onClick={() => setWorkloadSort("highest")}>{t("overview.highestFirst")}</button>
                </div>
              </div>

              <div className="audit-overview-v6__workload-chart">
                {visibleCircleItems.map((item) => {
                  const value = Number(item[workloadMetric] ?? 0);
                  const detail = `${item.candidates} ${workloadLabels.candidates} · ${item.active} ${workloadLabels.active} · ${item.evidence} ${workloadLabels.evidence} · ${item.controls} ${workloadLabels.controls} · ${item.secondReview} ${workloadLabels.secondReview} · ${item.closed} ${workloadLabels.closed}`;
                  return (
                    <button type="button" className={`audit-overview-v6__workload-row${value === 0 ? " is-zero" : ""}`} key={item.circle} title={detail} onClick={() => navigate(workloadRoute(item.circle))}>
                      <strong>{item.circle}</strong>
                      <span><i style={{ width: `${value === 0 ? 0 : Math.max(3, (value / workloadMax) * 100)}%` }} /></span>
                      <em>{formatDashboardNumber(value)}</em>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  );
                })}
                {visibleCircleItems.length === 0 && <p className="audit-overview-v6__no-circles">{t("overview.noCircleMatch")}</p>}
              </div>
            </div>
          </DashSection>
        </div>

        <div className="dashboard-section-grid">
          <DashSection title={t("overview.queueHealth")} icon={Activity}>
            <div className="audit-overview__queue-list">
              {queueItems.map((item) => (
                <button type="button" className="audit-overview__queue-row" key={item.label} onClick={() => navigate(item.route)}>
                  <span className={`audit-overview__queue-count audit-overview__queue-count--${item.tone}`}>{formatDashboardNumber(item.count)}</span>
                  <span className="audit-overview__queue-copy"><strong>{item.label}</strong><span>{item.detail}</span></span>
                  <span className={`audit-overview__queue-status audit-overview__queue-status--${item.tone}`}>{item.status}</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
          </DashSection>

          <DashSection title={t("overview.systemAssurance")} icon={BadgeCheck}>
            <div className="audit-overview__assurance">
              <button type="button" onClick={() => navigate("/audit/all-taxpayers?filterKey=data_quality&filterValue=Complete")}><span>{t("overview.dataQuality")}</span><strong title={`${formatDashboardNumber(completeQuality)}/${formatDashboardNumber(NATIONAL_SCREENED_POPULATION)}+`}>{formatDashboardCompact(completeQuality)}/{formatDashboardCompact(NATIONAL_SCREENED_POPULATION)}+</strong><small>{t("overview.qualityComplete", { rate: completeQualityRate })}</small></button>
              <button type="button" onClick={() => navigate("/audit/rules-governance")}><span>{t("overview.ruleGovernance")}</span><strong>{liveRules} {t("overview.live")}</strong><small>{t("overview.ruleMix", { staged: stagedRules, shadow: shadowRules, draft: draftRules, pending: pendingGovernance })}</small></button>
              <button type="button" onClick={() => navigate("/audit/audit-trail")}><span>{t("overview.auditTrailHealth")}</span><strong>{AUDIT_TRAIL_ROWS.length}</strong><small>{t("overview.auditTrailSummary", { sensitive: sensitiveAccessEvents })}</small></button>
            </div>
          </DashSection>
        </div>

        <DashSection title={t("overview.recentActivity")} icon={Timer}>
          <div className="audit-overview__activity-list">
            {recentEvents.map((event) => (
              <button type="button" className="audit-overview-v4__activity-row" key={String(event.id)} onClick={() => navigate("/audit/audit-trail")}>
                <span className="audit-overview__activity-marker" aria-hidden="true" />
                <div><strong>{String(event.action ?? "—")}</strong><span>{String(event.actor_role ?? "—")}</span></div>
                <time>{String(event.timestamp_utc ?? "—")}</time>
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            ))}
            <button type="button" className="audit-overview__section-link" onClick={() => navigate("/audit/audit-trail")}>{t("overview.viewAuditTrail")}<ChevronRight size={15} aria-hidden="true" /></button>
          </div>
        </DashSection>
      </div>

      <AuditExplainerDrawer
        explanation={explanation}
        onClose={() => setExplanation(null)}
      />
    </div>
  );
}

export function AuditModulePage() {
  const { subNav = "audit-overview" } = useParams<{ subNav: string }>();
  const { t } = useTranslation("audit");

  const opts = (values: string[]) => values;

  const taxpayerConfig: AuditTableConfig = {
    title: t("pages.allTaxpayers.title"),
    description: t("pages.allTaxpayers.description"),
    rows: ALL_TAXPAYER_ROWS,
    columns: [
      fc("taxpayer_name", t("columns.taxpayer")),
      fc("tin", t("columns.tin"), { mono:true }),
      fc("circle", t("columns.circle")),
      fc("assessment_year", t("columns.assessmentYear")),
      { type:"col", col:{ key:"data_quality", label:t("columns.dataQuality"), badge:true } },
      fc("coverage_tier", t("columns.coverageTier")),
      fc("signals", t("columns.signals"), { truncate:"normal" }),
      fc("risk_level", t("columns.riskLevel")),
      fc("control_flags", t("columns.controlFlags")),
      { type:"col", col:{ key:"audit_state", label:t("columns.auditState"), badge:true } },
    ],
    drawerColumns: [
      fc("taxpayer_name", t("columns.taxpayer")), fc("tin", t("columns.tin")), fc("return_id", t("columns.returnId")),
      fc("assessment_year", t("columns.assessmentYear")), fc("return_version", t("columns.returnVersion")),
      fc("circle", t("columns.circle")), { type:"col", col:{ key:"data_quality", label:t("columns.dataQuality"), badge:true } },
      fc("coverage_tier", t("columns.coverageTier")), fc("available_data", t("columns.availableData")),
      fc("signals", t("columns.signals")), fc("risk_level", t("columns.riskLevel")),
      fc("control_flags", t("columns.controlFlags")), { type:"col", col:{ key:"audit_state", label:t("columns.auditState"), badge:true } },
      fc("reason_code", t("columns.reason")),
    ],
    filters: [
      { key:"circle", label:t("filters.circle"), type:"select", options:opts(uniqueValues(ALL_TAXPAYER_ROWS,"circle")) },
      { key:"assessment_year", label:t("filters.assessmentYear"), type:"select", options:opts(uniqueValues(ALL_TAXPAYER_ROWS,"assessment_year")) },
      { key:"data_quality", label:t("filters.dataQuality"), type:"select", options:opts(uniqueValues(ALL_TAXPAYER_ROWS,"data_quality")) },
      { key:"coverage_tier", label:t("filters.coverageTier"), type:"select", options:opts(uniqueValues(ALL_TAXPAYER_ROWS,"coverage_tier")) },
      { key:"risk_level", label:t("filters.riskLevel"), type:"select", options:opts(uniqueValues(ALL_TAXPAYER_ROWS,"risk_level")) },
      { key:"audit_state", label:t("filters.auditState"), type:"select", options:opts(uniqueValues(ALL_TAXPAYER_ROWS,"audit_state")) },
      { key:"control_flags", label:t("columns.controlFlags"), type:"select", options:opts(uniqueValues(ALL_TAXPAYER_ROWS,"control_flags")) },
      { key:"return_version", label:t("columns.returnVersion"), type:"select", options:opts(uniqueValues(ALL_TAXPAYER_ROWS,"return_version")) },
    ],
    clickableKeys:["circle","assessment_year","data_quality","coverage_tier","signals","risk_level","control_flags","audit_state","return_version"],
    mobileCardMapping:{ primary:"taxpayer_name", identifier:"tin", meta:["circle","coverage_tier","risk_level","control_flags"], status:"audit_state" },
  };

  const riskConfig: AuditTableConfig = {
    title: t("pages.riskCases.title"),
    description: t("pages.riskCases.description"),
    rows: RISK_CASE_ROWS,
    columns: [
      fc("case_id", t("columns.caseId"), { mono:true }),
      fc("return_id", t("columns.returnId"), { mono:true }),
      fc("tin", t("columns.tin"), { mono:true }),
      fc("circle", t("columns.circle")),
      fc("coverage_tier", t("columns.coverageTier")),
      fc("risk_level", t("columns.riskLevel")),
      { type:"col", col:{ key:"case_status", label:t("columns.status"), badge:true } },
      fc("sla", t("columns.sla")),
    ],
    drawerColumns: [
      fc("case_id", t("columns.caseId")), fc("return_id", t("columns.returnId")), fc("tin", t("columns.tin")),
      fc("assessment_year", t("columns.assessmentYear")), fc("return_version", t("columns.returnVersion")),
      fc("circle", t("columns.circle")), fc("coverage_tier", t("columns.coverageTier")), fc("risk_level", t("columns.riskLevel")),
      fc("signals", t("columns.signals")), fc("verification_summary", t("columns.verification")),
      { type:"col", col:{ key:"evidence_status", label:t("columns.evidenceStatus"), badge:true } },
      fc("evidence_refs", t("columns.evidenceRefs")), { type:"col", col:{ key:"finding_status", label:t("columns.findingStatus"), badge:true } },
      fc("reason_code", t("columns.reason")), fc("sla", t("columns.sla")),
      { type:"col", col:{ key:"case_status", label:t("columns.status"), badge:true } }, fc("assigned_to", t("columns.assignedTo")),
    ],
    filters: [
      { key:"circle", label:t("filters.circle"), type:"select", options:opts(uniqueValues(RISK_CASE_ROWS,"circle")) },
      { key:"risk_level", label:t("filters.riskLevel"), type:"select", options:opts(["Low","Medium","High","Very High"]) },
      { key:"coverage_tier", label:t("filters.coverageTier"), type:"select", options:opts(["DT0","DT1","DT1+H","DT2","DT3"]) },
      { key:"case_status", label:t("filters.status"), type:"select", options:opts(["Assigned","Verifying","Evidence Pending","Ready for Review","Second Review","Rework Requested","Closed"]) },
    ],
    clickableKeys:["circle","coverage_tier","risk_level","case_status","sla"],
    mobileCardMapping:{ primary:"case_id", identifier:"return_id", meta:["circle","risk_level","coverage_tier"], status:"case_status" },
  };

  const controlConfig: AuditTableConfig = {
    title:t("pages.control.title"),
    description:t("pages.control.description"),
    rows:CONTROL_ROWS,
    columns:[
      fc("return_id",t("columns.returnId"),{mono:true}), fc("tin",t("columns.tin"),{mono:true}),
      fc("circle",t("columns.circle")), fc("flag_id",t("columns.flagId"),{mono:true}), fc("coverage_tier",t("columns.coverageTier")),
      fc("check",t("columns.check"),{truncate:"long"}), {type:"col",col:{key:"control_status",label:t("columns.status"),badge:true}},
    ],
    drawerColumns:[
      fc("return_id",t("columns.returnId")),fc("tin",t("columns.tin")),fc("assessment_year",t("columns.assessmentYear")),
      fc("circle",t("columns.circle")),fc("coverage_tier",t("columns.coverageTier")),fc("flag_id",t("columns.flagId")),
      fc("check",t("columns.check")),fc("source",t("columns.source")),fc("dependency",t("columns.dependency")),
      fc("queue",t("columns.queue")),{type:"col",col:{key:"control_status",label:t("columns.status"),badge:true}},
    ],
    filters:[
      { key:"circle", label:t("filters.circle"), type:"select", options:opts(uniqueValues(CONTROL_ROWS,"circle")) },
      { key:"flag_id", label:t("filters.controlFlag"), type:"select", options:opts(["F0","F1","F2","F3","F4","F5"]) },
      { key:"control_status", label:t("filters.status"), type:"select", options:opts(["Pending","In Progress","Pending Review","Resolved","Under Review"]) },
    ],
    clickableKeys:["circle","flag_id","coverage_tier","control_status"],
    mobileCardMapping:{primary:"flag_id",identifier:"return_id",meta:["circle","coverage_tier","queue"],status:"control_status"},
  };

  const reviewConfig: AuditTableConfig = {
    title:t("pages.secondReview.title"),
    description:t("pages.secondReview.description"),
    rows:SECOND_REVIEW_ROWS,
    columns:[
      fc("case_id",t("columns.caseId"),{mono:true}),fc("return_id",t("columns.returnId"),{mono:true}),
      fc("circle",t("columns.circle")),fc("risk_level",t("columns.riskLevel")),fc("primary_signal",t("columns.primarySignal")),
      fc("evidence_refs",t("columns.evidenceRefs")),{type:"col",col:{key:"review_status",label:t("columns.status"),badge:true}},
    ],
    drawerColumns:[
      fc("case_id",t("columns.caseId")),fc("return_id",t("columns.returnId")),fc("tin",t("columns.tin")),fc("circle",t("columns.circle")),
      fc("risk_level",t("columns.riskLevel")),fc("primary_signal",t("columns.primarySignal")),
      fc("verification_basis",t("columns.verificationBasis")),fc("evidence_refs",t("columns.evidenceRefs")),
      fc("finding_summary",t("columns.findingSummary")),fc("submitted_by",t("columns.submittedBy")),
      {type:"col",col:{key:"review_status",label:t("columns.status"),badge:true}},fc("permitted_actions",t("columns.permittedActions")),
    ],
    filters:[
      { key:"circle", label:t("filters.circle"), type:"select", options:opts(uniqueValues(SECOND_REVIEW_ROWS,"circle")) },
      { key:"risk_level", label:t("filters.riskLevel"), type:"select", options:opts(["High","Very High"]) },
      { key:"review_status", label:t("filters.status"), type:"select", options:opts(["Ready for Review","Second Review","Rework Requested"]) },
    ],
    clickableKeys:["circle","risk_level","primary_signal","review_status"],
    mobileCardMapping:{primary:"case_id",identifier:"return_id",meta:["circle","risk_level","primary_signal"],status:"review_status"},
  };

  const rulesConfig: AuditTableConfig = {
    title:t("pages.rules.title"),
    description:t("pages.rules.description"),
    rows:RULE_ROWS,
    columns:[
      fc("rule_id",t("columns.ruleId"),{mono:true}),fc("version",t("columns.version"),{mono:true}),
      fc("rule_family",t("columns.ruleFamily")), {type:"col",col:{key:"dry_run_status",label:t("columns.dryRun"),badge:true}},
      {type:"col",col:{key:"governance_status",label:t("columns.governanceStatus"),badge:true}},
      {type:"col",col:{key:"mode",label:t("columns.mode"),badge:true}},fc("rollout_scope",t("columns.rolloutScope")),
    ],
    drawerColumns:[
      fc("rule_id",t("columns.ruleId")),fc("version",t("columns.version")),fc("rule_family",t("columns.ruleFamily")),
      fc("author_role",t("columns.authorRole")),fc("plain_language_condition",t("columns.plainLanguageCondition")),
      {type:"col",col:{key:"dry_run_status",label:t("columns.dryRun"),badge:true}},
      {type:"col",col:{key:"governance_status",label:t("columns.governanceStatus"),badge:true}},
      {type:"col",col:{key:"mode",label:t("columns.mode"),badge:true}},fc("rollout_scope",t("columns.rolloutScope")),
      fc("version_note",t("columns.versionNote")),
    ],
    filters:[
      { key:"governance_status", label:t("filters.governanceStatus"), type:"select", options:opts(["Awaiting Endorsement","Awaiting Approval","Approved","Superseded"]) },
      { key:"mode", label:t("filters.mode"), type:"select", options:opts(["Draft","Shadow","Staged","Live","Superseded"]) },
    ],
    clickableKeys:["rule_id","version","dry_run_status","governance_status","mode"],
    mobileCardMapping:{primary:"rule_id",identifier:"version",meta:["rule_family","rollout_scope"],status:"mode"},
  };

  const reconciliationConfig: AuditTableConfig = {
    title:t("pages.reconciliation.title"),
    description:t("pages.reconciliation.description"),
    rows:RECONCILIATION_ROWS,
    columns:[
      fc("reconciliation_date",t("columns.date")),fc("scope",t("columns.scope")),
      fc("high_risk_returns",t("columns.highRiskReturns"),{mono:true}),fc("matching_cases",t("columns.matchingCases"),{mono:true}),
      fc("missing_case_count",t("columns.missingCases"),{mono:true}),
      {type:"col",col:{key:"reconciliation_status",label:t("columns.status"),badge:true}},
    ],
    drawerColumns:[
      fc("reconciliation_date",t("columns.date")),fc("scope",t("columns.scope")),
      fc("high_risk_returns",t("columns.highRiskReturns")),fc("matching_cases",t("columns.matchingCases")),
      fc("missing_case_count",t("columns.missingCases")),
      {type:"col",col:{key:"reconciliation_status",label:t("columns.status"),badge:true}},
      fc("supervisor_view",t("columns.supervisorView")),
    ],
    filters:[
      { key:"reconciliation_status", label:t("filters.status"), type:"select", options:opts(["Matched","Missing Case","Under Review"]) },
      { key:"supervisor_view", label:t("filters.viewer"), type:"select", options:opts(["Range Officer","Commissioner"]) },
    ],
    clickableKeys:["scope","reconciliation_status"],
    mobileCardMapping:{primary:"scope",identifier:"reconciliation_date",meta:["high_risk_returns","missing_case_count"],status:"reconciliation_status",date:"reconciliation_date"},
  };

  const trailConfig: AuditTableConfig = {
    title:t("pages.trail.title"),
    description:t("pages.trail.description"),
    rows:AUDIT_TRAIL_ROWS,
    columns:[
      fc("timestamp_utc",t("columns.timestampUtc")),fc("event_id",t("columns.eventId"),{mono:true}),
      fc("return_id",t("columns.returnId"),{mono:true}),fc("actor_role",t("columns.actorRole")),
      fc("action",t("columns.action"),{truncate:"long"}),fc("return_version",t("columns.returnVersion")),
    ],
    drawerColumns:[
      fc("event_id",t("columns.eventId")),fc("timestamp_utc",t("columns.timestampUtc")),fc("return_id",t("columns.returnId")),
      fc("return_version",t("columns.returnVersion")),fc("actor_id",t("columns.actorId")),fc("actor_role",t("columns.actorRole")),
      fc("action",t("columns.action")),fc("data_state",t("columns.dataState")),fc("assessment",t("columns.assessment")),
      fc("human_record",t("columns.humanRecord")),fc("access_record",t("columns.accessRecord")),
      fc("classification_version",t("columns.classificationVersion")),fc("rule_config_version",t("columns.ruleConfigVersion")),
    ],
    filters:[
      { key:"actor_role", label:t("filters.role"), type:"select", options:opts(["DCT","Range Officer"]) },
      { key:"return_id", label:t("filters.return"), type:"select", options:opts(["RET-2026-10539"]) },
    ],
    clickableKeys:["return_version"],
    mobileCardMapping:{primary:"action",identifier:"event_id",meta:["actor_role","return_id"],date:"timestamp_utc"},
    readOnly:true,
  };

  switch (subNav) {
    case "audit-overview": return <AuditOverviewPage />;
    case "initiate-audit": return <AuditCandidatesPage initialInitiateOpen />;
    case "audit-candidates": return <AuditCandidatesPage />;
    case "all-taxpayers": return <AuditTablePage config={taxpayerConfig} />;
    case "risk-cases": return <AuditTablePage config={riskConfig} />;
    case "control-data-quality": return <AuditTablePage config={controlConfig} />;
    case "second-review": return <AuditTablePage config={reviewConfig} />;
    case "rules-governance": return <AuditTablePage config={rulesConfig} />;
    case "reconciliation": return <AuditTablePage config={reconciliationConfig} />;
    case "audit-trail": return <AuditTablePage config={trailConfig} />;
    case "audit-manual": return <AuditManualPage />;
    default: return <AuditOverviewPage />;
  }
}
