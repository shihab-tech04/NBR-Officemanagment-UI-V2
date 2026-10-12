import { useMemo, useState } from "react";
import { Activity, CalendarCheck, CalendarDays, Download, Filter, Printer, Shield, Sigma } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatCard } from "../../components/cards/StatCard";
import { ResponsiveTable } from "../../components/tables/ResponsiveTable";
import { AppSearchField } from "../../components/forms/AppSearchField";
import { FilterPanel } from "../../components/filters/FilterPanel";
import { MobileFilterOverlay } from "../../components/filters/MobileFilterOverlay";
import { AppliedFilterChips } from "../../components/filters/AppliedFilterChips";
import { useSettings } from "../../hooks/useSettings";
import { useUIState } from "../../hooks/useUI";
import { handleExportDisabled } from "../../utils/exportDisabled";
import type { ColDef, FilterDef, MobileCardMapping } from "../modulePageUtils";

const CIRCLE_PSR_COLS: ColDef[] = [
  { type: "col", col: { key: "serial_no", label: "S/N", headerKey: "headers.serialNo", mono: true, truncate: "none" } },
  { type: "col", col: { key: "zone", label: "Zone", headerKey: "headers.zone", truncate: "none" } },
  { type: "col", col: { key: "total_psr", label: "Total PSR", headerKey: "headers.totalPsr", mono: true, truncate: "none" } },
  { type: "col", col: { key: "double_entry", label: "Double Entry", headerKey: "headers.doubleEntry", mono: true, truncate: "none" } },
  { type: "col", col: { key: "double_entry_percentage", label: "Double Entry Percentage (%)", headerKey: "headers.doubleEntryPercentage", mono: true, truncate: "none" } },
];

const CIRCLE_PSR_MOBILE_MAPPING: MobileCardMapping = {
  primary: "zone",
  identifier: "serial_no",
  meta: ["total_psr", "double_entry", "double_entry_percentage"],
};

const PSR_OVERVIEW_TOTALS = {
  totalPsrEntries: 174,
  totalDoubleEntry: 34,
};

const CIRCLE_PSR_DATA = [
  { serial_no: "1", zone: "Large Taxpayers Unit (Tax)", total_psr: "4", double_entry: "0", double_entry_percentage: "0.00" },
  { serial_no: "2", zone: "01, Dhaka", total_psr: "1", double_entry: "0", double_entry_percentage: "0.00" },
  { serial_no: "3", zone: "03, Dhaka", total_psr: "3", double_entry: "0", double_entry_percentage: "0.00" },
  { serial_no: "4", zone: "05, Dhaka", total_psr: "2", double_entry: "0", double_entry_percentage: "0.00" },
  { serial_no: "5", zone: "08, Dhaka", total_psr: "2", double_entry: "0", double_entry_percentage: "0.00" },
  { serial_no: "6", zone: "12, Dhaka", total_psr: "11", double_entry: "0", double_entry_percentage: "0.00" },
  { serial_no: "7", zone: "13, Dhaka", total_psr: "103", double_entry: "11", double_entry_percentage: "10.68" },
  { serial_no: "8", zone: "14, Dhaka", total_psr: "10", double_entry: "7", double_entry_percentage: "70.00" },
];

const PSR_STATUS_OPTIONS = [
  "All",
  "All Individual",
  "All Companies",
  "Any Other Company",
  "Association of Persons",
  "Bangladeshi without NID",
  "Bangladeshi without NID -> Minor / Dependent",
  "Co-Operative Society",
  "Corporation",
  "Cultural/Social/Sports organisation",
  "Foreign Company not registered with RJSC",
  "Foreigner (Non Bangladeshi)",
  "Foreigner (Non Bangladeshi) Minor / Dependent",
  "Foundation",
  "Gratuity Funds",
  "Growth Funds",
  "Hindu Undivided Family",
  "Individual -> Bangladeshi -> Having NID",
  "Individual -> Bangladeshi -> Minor/ Dependent",
  "Load Funds",
  "Local Authority",
  "Mutual Funds",
  "NGO",
  "Non Resident Bangladeshi without NID",
  "Non Resident Bangladeshi without NID -> Minor / Dependent",
  "Not Registered with RJSC",
  "Other Funds",
  "Pension Funds",
  "Political" + " Party",
  "Private Limited Company",
  "Provident Funds",
  "Public Limited Company",
  "Registered with RJSC",
  "Religious / Charitable Institution",
  "Special. Purpose Funds",
  "Super Annuation Funds",
  "Trust",
  "Trust Funds",
  "Welfare Funds",
];

const PSR_FILTERS: FilterDef[] = [
  {
    key: "assessment_year",
    label: "Assessment Year",
    labelKey: "labels.assessmentYear",
    type: "select",
    options: ["2025-26", "2024-25", "2023-24", "2022-23", "2021-22"],
  },
  {
    key: "zone",
    label: "Zone",
    labelKey: "labels.zone",
    type: "select",
    options: ["All"],
  },
  {
    key: "status",
    label: "Status",
    labelKey: "labels.status",
    type: "select",
    options: PSR_STATUS_OPTIONS,
  },
];


function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function hasMeaningfulFilters(values: Record<string, string>) {
  return Object.values(values).some(value => value && !value.startsWith("All"));
}

function buildPsrRows(filters: Record<string, string>) {
  if (!hasMeaningfulFilters(filters)) return CIRCLE_PSR_DATA;

  const selectedZone =
    filters.zone && filters.zone !== "All"
      ? filters.zone
      : "";

  const sourceRows = selectedZone
    ? [{
        serial_no: "1",
        zone: selectedZone,
        total_psr: "1",
        double_entry: "0",
        double_entry_percentage: "0.00",
      }]
    : CIRCLE_PSR_DATA;

  const year = filters.assessment_year || "All Years";
  const status = filters.status || "All";

  return sourceRows.map((row, index) => {
    const seed = hashSeed([year, status, row.zone, String(index)].join("|"));
    const baseTotal = Number(row.total_psr || 1);
    const total = Math.max(1, Math.min(125, baseTotal + (seed % 9)));
    const doubleEntry = Math.min(
      total,
      status === "All"
        ? seed % Math.max(1, total + 1)
        : Math.max(1, (seed % Math.max(1, total)) + 1)
    );
    const percentage = ((doubleEntry / total) * 100).toFixed(2);

    return {
      ...row,
      serial_no: String(index + 1),
      total_psr: String(total),
      double_entry: String(doubleEntry),
      double_entry_percentage: percentage,
    };
  });
}

export function PSRDashboardPage() {
  const { assessmentYear: ay } = useSettings();
  const { isDesktop } = useUIState();
  const { t: translate } = useTranslation("dashboard");
  const { t: translateCommon } = useTranslation("common");

  const [search, setSearch] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [filterEditing, setFilterEditing] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});

  const scopedRows = useMemo(
    () => buildPsrRows(appliedFilters),
    [appliedFilters]
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return scopedRows;
    return scopedRows.filter(row =>
      Object.values(row).some(value => String(value).toLowerCase().includes(query))
    );
  }, [search, scopedRows]);

  const filteredPsrSummary = useMemo(() => {
    if (!hasMeaningfulFilters(appliedFilters)) {
      return PSR_OVERVIEW_TOTALS;
    }

    return {
      totalPsrEntries: scopedRows.reduce((sum, row) => sum + Number(row.total_psr || 0), 0),
      totalDoubleEntry: scopedRows.reduce((sum, row) => sum + Number(row.double_entry || 0), 0),
    };
  }, [appliedFilters, scopedRows]);

  const hasAppliedFilters = hasMeaningfulFilters(appliedFilters);

  const handleFilterChange = (key: string, value: string) => {
    setFilterValues(prev => ({ ...prev, [key]: value }));
  };

  const openFilters = () => {
    if (hasAppliedFilters) {
      setFilterValues({ ...appliedFilters });
      setFilterEditing(true);
      setShowFilter(true);
      return;
    }
    setFilterEditing(false);
    setShowFilter(open => !open);
  };

  const handleApplyFilters = () => {
    setAppliedFilters(filterValues);
    setFilterEditing(false);
    setShowFilter(false);
    setSearch("");
  };

  const handleCancelFilters = () => {
    setFilterValues({ ...appliedFilters });
    setFilterEditing(false);
    setShowFilter(false);
  };

  const handleResetFilters = () => {
    setFilterValues({});
    setAppliedFilters({});
    setFilterEditing(false);
    setShowFilter(false);
    setSearch("");
  };

  const kpiCards = [
    {
      label: translate("psr.kpis.totalPsrEntries"),
      value: String(filteredPsrSummary.totalPsrEntries),
      icon: Shield,
      tone: "primary" as const,
    },
    {
      label: translate("psr.kpis.totalDoubleEntry"),
      value: String(filteredPsrSummary.totalDoubleEntry),
      icon: Activity,
      tone: "success" as const,
    },
  ];

  // Separate request-summary dataset. Intentionally independent of the
  // original PSR table filters (assessment year / zone / status).
  const requestSummaryCards = [
    { label: translate("psr.requestSummary.today"), value: "5", icon: CalendarCheck, tone: "primary" as const },
    { label: translate("psr.requestSummary.thisMonth"), value: "5", icon: CalendarDays, tone: "success" as const },
    { label: translate("psr.requestSummary.totalToDate"), value: "72", icon: Sigma, tone: "neutral" as const },
  ];

  return (
    <div className="dashboard-page">
      <div className="dashboard-page__header">
        <h1 className="dashboard-page__title">{translate("psr.title")}</h1>
        <p className="dashboard-page__subtitle">{translate("psr.subtitle")}</p>
      </div>

      <div className="combine-dashboard__group-label">
        <h2 className="dash-section__title-text">
          {translate("psr.sections.requestSummary")}
        </h2>
      </div>

      <div className="dashboard-kpi-grid">
        {requestSummaryCards.map((card, i) => (
          <StatCard key={i} icon={card.icon} value={card.value} label={card.label} tone={card.tone} />
        ))}
      </div>

      <div className="border-t border-[var(--color-border)] mb-4" aria-hidden="true" />

      <div className="combine-dashboard__metric-group">
        <div className="combine-dashboard__group-label flex items-center gap-2">
          <h2 className="dash-section__title-text">
            {translate("psr.sections.overview")}
          </h2>
          <div className="table-page__actions ml-auto">
            <button
              type="button"
              onClick={openFilters}
              className={`table-card__toolbar-btn${showFilter ? " table-card__toolbar-btn--active" : ""}`}
              aria-expanded={showFilter}
            >
              <Filter size={13} aria-hidden="true" />
              {hasAppliedFilters
                ? translateCommon("actions.changeFilters")
                : translateCommon("actions.filter")}
            </button>

            <button
              type="button"
              className="table-card__toolbar-btn table-card__toolbar-btn--download"
              onClick={() => handleExportDisabled(translateCommon("actions.exportDisabled"))}
            >
              <Download size={13} aria-hidden="true" />
              {translateCommon("actions.export")}
            </button>

            <button
              type="button"
              className="table-card__toolbar-btn table-card__toolbar-btn--print"
              onClick={() => window.print()}
            >
              <Printer size={13} aria-hidden="true" />
              {translateCommon("actions.print")}
            </button>
          </div>
        </div>

        {isDesktop && (
          <div
            className={`dashboard-filter-reveal${showFilter ? " dashboard-filter-reveal--open" : ""}`}
            aria-hidden={!showFilter}
          >
            <div className="dashboard-filter-reveal__inner">
              <div className="card">
                <FilterPanel
                  filters={PSR_FILTERS}
                  values={filterValues}
                  onChange={handleFilterChange}
                  onApply={handleApplyFilters}
                  onReset={filterEditing ? handleCancelFilters : handleResetFilters}
                  resetLabel={filterEditing ? translateCommon("actions.cancel") : undefined}
                  cardLayout
                />
              </div>
            </div>
          </div>
        )}

        <AppliedFilterChips
          values={appliedFilters}
          onClear={handleResetFilters}
          cardView
        />

        <div className="dashboard-kpi-grid dashboard-kpi-grid--1row">
          {kpiCards.map((card, i) => (
            <StatCard key={i} icon={card.icon} value={card.value} label={card.label} tone={card.tone} />
          ))}
        </div>
      </div>

      <div className="dashboard-content-stack">
        <div className="table-card">
          <div className="table-card__toolbar">
            <div className="table-card__title-group">
              <h2 className="table-card__title">{translate("psr.sections.circlewisePsrStatus")}</h2>
              <span className="table-card__count" aria-live="polite" aria-atomic="true">
                {filteredRows.length} {translateCommon("common.records")}
              </span>
              <span className="dash-section__badge">
                {translateCommon("common.ayAbbrev")} {appliedFilters.assessment_year || ay}
              </span>
            </div>

            <div className="table-card__search-wrapper">
              <AppSearchField
                value={search}
                onChange={setSearch}
                placeholder={translateCommon("common.searchPlaceholder")}
                label={translateCommon("common.searchPlaceholder")}
                size="compact"
              />
            </div>

          </div>


          <ResponsiveTable
            cols={CIRCLE_PSR_COLS}
            rows={filteredRows}
            mobileCardMapping={CIRCLE_PSR_MOBILE_MAPPING}
            noCard
          />
        </div>
      </div>

      {!isDesktop && (
        <MobileFilterOverlay
          isOpen={showFilter}
          filters={PSR_FILTERS}
          values={filterValues}
          onChange={handleFilterChange}
          onApply={handleApplyFilters}
          onReset={filterEditing ? handleCancelFilters : handleResetFilters}
          resetLabel={filterEditing ? translateCommon("actions.cancel") : undefined}
          onClose={filterEditing ? handleCancelFilters : () => setShowFilter(false)}
        />
      )}
    </div>
  );
}
