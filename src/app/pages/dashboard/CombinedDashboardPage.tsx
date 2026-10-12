import { useCallback, useMemo, useState } from "react";
import { Activity, ArrowLeft, BadgeCheck, Clock, ClipboardList, Download, Filter, Printer } from "lucide-react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { StatCard } from "../../components/cards/StatCard";
import { ResponsiveTable } from "../../components/tables/ResponsiveTable";
import { AppSearchField } from "../../components/forms/AppSearchField";
import { FilterPanel } from "../../components/filters/FilterPanel";
import { MobileFilterOverlay } from "../../components/filters/MobileFilterOverlay";
import { AppliedFilterChips } from "../../components/filters/AppliedFilterChips";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import { useSettings } from "../../hooks/useSettings";
import { useUIState } from "../../hooks/useUI";
import { handleExportDisabled } from "../../utils/exportDisabled";
import type { ColDef, FilterDef, MobileCardMapping, TableRow } from "../modulePageUtils";

const ZONE_ROWS: TableRow[] = [
  { serial_no: "1", zone: "Taxes Zone 8, Dhaka", not_initialized: "1", initialized: "0", double_entry_complete: "0", co_ongoing: "0", approved: "0", total_psr: "1" },
  { serial_no: "2", zone: "Taxes zone-13, Dhaka", not_initialized: "2", initialized: "2", double_entry_complete: "0", co_ongoing: "0", approved: "0", total_psr: "4" },
  { serial_no: "3", zone: "Taxes Zone, Gazipur", not_initialized: "3", initialized: "2", double_entry_complete: "0", co_ongoing: "1", approved: "1", total_psr: "7" },
  { serial_no: "4", zone: "Large Taxpayers Unit (Tax)", not_initialized: "1", initialized: "0", double_entry_complete: "0", co_ongoing: "0", approved: "0", total_psr: "1" },
  { serial_no: "5", zone: "Taxes Zone, Rajshahi", not_initialized: "2", initialized: "0", double_entry_complete: "0", co_ongoing: "0", approved: "0", total_psr: "2" },
  { serial_no: "6", zone: "Taxes Zone, Jashore", not_initialized: "2", initialized: "1", double_entry_complete: "0", co_ongoing: "1", approved: "0", total_psr: "4" },
  { serial_no: "7", zone: "Taxes Zone, Kushtia", not_initialized: "1", initialized: "0", double_entry_complete: "0", co_ongoing: "0", approved: "0", total_psr: "1" },
  { serial_no: "8", zone: "Taxes Zone, Faridpur", not_initialized: "1", initialized: "0", double_entry_complete: "0", co_ongoing: "0", approved: "0", total_psr: "1" },
];

const CIRCLE_ROWS_BY_ZONE: Record<string, TableRow[]> = {
  "Taxes Zone 8, Dhaka": [
    { serial_no: "1", circle: "Circle-176", not_initialized: "1", initialized: "0", double_entry_complete: "0", co_ongoing: "0", approved: "0", total_psr: "1" },
  ],
};

const USER_ROWS_BY_CIRCLE: Record<string, TableRow[]> = {
  "Circle-176": [
    { serial_no: "1", user_id: "user1@176Dhaka", name: "Jahid Hasan", draft_entry: "0", saved_entry: "0", entry_complete: "0", co_ongoing: "0", approved_entry: "0", designation: "ডাটা এন্ট্রি অপারেটর", status_code: "Active" },
    { serial_no: "2", user_id: "user2@176Dhaka", name: "Shohel Rana", draft_entry: "0", saved_entry: "0", entry_complete: "0", co_ongoing: "0", approved_entry: "0", designation: "ডাটা এন্ট্রি অপারেটর", status_code: "Active" },
  ],
};

const AGGREGATE_COLS: ColDef[] = [
  { type: "col", col: { key: "serial_no", label: "S/N", headerKey: "headers.serialNo", mono: true, truncate: "none" } },
  { type: "col", col: { key: "zone", label: "Zone", headerKey: "headers.zone", truncate: "none" } },
  { type: "col", col: { key: "not_initialized", label: "Not Initialized", headerKey: "headers.notInitialized", mono: true, truncate: "none" } },
  { type: "col", col: { key: "initialized", label: "Initialized", headerKey: "headers.initialized", mono: true, truncate: "none" } },
  { type: "col", col: { key: "double_entry_complete", label: "Double Entry Complete", headerKey: "headers.doubleEntryComplete", mono: true, truncate: "none" } },
  { type: "col", col: { key: "co_ongoing", label: "CO Ongoing", headerKey: "headers.coOngoing", mono: true, truncate: "none" } },
  { type: "col", col: { key: "approved", label: "Approved", headerKey: "headers.approved", mono: true, truncate: "none" } },
  { type: "col", col: { key: "total_psr", label: "Total PSR", headerKey: "headers.totalPsr", mono: true, truncate: "none" } },
];

const CIRCLE_COLS: ColDef[] = AGGREGATE_COLS.map(def => {
  if (def.type === "col" && def.col.key === "zone") {
    return { type: "col", col: { ...def.col, key: "circle", label: "Circle", headerKey: "headers.circle" } };
  }
  return def;
});

const USER_COLS: ColDef[] = [
  { type: "col", col: { key: "serial_no", label: "S/N", headerKey: "headers.serialNo", mono: true, truncate: "none" } },
  { type: "col", col: { key: "user_id", label: "User ID", headerKey: "headers.userId", truncate: "none" } },
  { type: "col", col: { key: "name", label: "Name", headerKey: "headers.name", truncate: "none" } },
  { type: "col", col: { key: "draft_entry", label: "Draft Entry", headerKey: "headers.draftEntry", mono: true, truncate: "none" } },
  { type: "col", col: { key: "saved_entry", label: "Saved Entry", headerKey: "headers.savedEntry", mono: true, truncate: "none" } },
  { type: "col", col: { key: "entry_complete", label: "Entry Complete", headerKey: "headers.entryComplete", mono: true, truncate: "none" } },
  { type: "col", col: { key: "co_ongoing", label: "CO Ongoing", headerKey: "headers.coOngoing", mono: true, truncate: "none" } },
  { type: "col", col: { key: "approved_entry", label: "Approved Entry", headerKey: "headers.approvedEntry", mono: true, truncate: "none" } },
  { type: "col", col: { key: "designation", label: "Designation", headerKey: "headers.designation", truncate: "none" } },
  { type: "col", col: { key: "status", label: "Status", headerKey: "headers.status", badge: true, truncate: "none" } },
];

const ZONE_MOBILE_MAPPING: MobileCardMapping = {
  primary: "zone",
  identifier: "serial_no",
  meta: ["not_initialized", "initialized", "co_ongoing", "approved", "total_psr"],
};

const CIRCLE_MOBILE_MAPPING: MobileCardMapping = {
  primary: "circle",
  identifier: "serial_no",
  meta: ["not_initialized", "initialized", "co_ongoing", "approved", "total_psr"],
};

const USER_MOBILE_MAPPING: MobileCardMapping = {
  primary: "name",
  identifier: "user_id",
  meta: ["draft_entry", "saved_entry", "entry_complete", "co_ongoing", "approved_entry", "designation"],
  status: "status",
};

function numeric(row: TableRow, key: string) {
  return Number(row[key] ?? 0);
}

function aggregateSummary(rows: TableRow[]) {
  return {
    notInitialized: rows.reduce((sum, row) => sum + numeric(row, "not_initialized"), 0),
    initialized: rows.reduce((sum, row) => sum + numeric(row, "initialized"), 0),
    pending: rows.reduce((sum, row) => sum + numeric(row, "co_ongoing"), 0),
    approved: rows.reduce((sum, row) => sum + numeric(row, "approved"), 0),
  };
}

function rowMatchesAggregateStatus(row: TableRow, status?: string) {
  if (!status || status.startsWith("All")) return true;
  if (status === "Not Initialized") return numeric(row, "not_initialized") > 0;
  if (status === "Initialized") return numeric(row, "initialized") > 0;
  if (status === "Double Entry Complete") return numeric(row, "double_entry_complete") > 0;
  if (status === "CO Ongoing" || status === "Pending") return numeric(row, "co_ongoing") > 0;
  if (status === "Approved") return numeric(row, "approved") > 0;
  return true;
}


function dashboardHashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function hasMeaningfulDashboardFilters(values: Record<string, string>) {
  return Object.values(values).some(value => value && !value.startsWith("All"));
}

function buildDoubleEntryZoneRows(filters: Record<string, string>): TableRow[] {
  if (!hasMeaningfulDashboardFilters(filters)) return ZONE_ROWS;

  const selectedZone =
    filters.tax_zone && !filters.tax_zone.startsWith("All")
      ? filters.tax_zone
      : "";

  const sourceRows = selectedZone
    ? ZONE_ROWS.filter(row => row.zone === selectedZone)
    : ZONE_ROWS;

  const year = filters.assessment_year || "All Years";
  const status = filters.status || "All Status";

  return sourceRows.map((row, index) => {
    const seed = dashboardHashSeed([year, status, String(row.zone), String(index)].join("|"));
    let notInitialized = 1 + (seed % 3);
    let initialized = (seed >>> 3) % 4;
    let complete = (seed >>> 6) % 3;
    let ongoing = (seed >>> 9) % 3;
    let approved = (seed >>> 12) % 3;

    if (status === "Not Initialized") notInitialized = Math.max(1, notInitialized);
    if (status === "Initialized") initialized = Math.max(1, initialized);
    if (status === "Double Entry Complete") complete = Math.max(1, complete);
    if (status === "CO Ongoing") ongoing = Math.max(1, ongoing);
    if (status === "Approved") approved = Math.max(1, approved);

    const total = notInitialized + initialized + complete + ongoing + approved;

    return {
      ...row,
      serial_no: String(index + 1),
      not_initialized: String(notInitialized),
      initialized: String(initialized),
      double_entry_complete: String(complete),
      co_ongoing: String(ongoing),
      approved: String(approved),
      total_psr: String(total),
    };
  });
}

function buildCircleRows(zone: string): TableRow[] {
  const existing = CIRCLE_ROWS_BY_ZONE[zone];
  if (existing?.length) return existing;

  return Array.from({ length: 3 }, (_, index) => {
    const seed = dashboardHashSeed(zone + "|" + String(index));
    const notInitialized = 1 + (seed % 3);
    const initialized = (seed >>> 3) % 3;
    const complete = (seed >>> 6) % 2;
    const ongoing = (seed >>> 8) % 2;
    const approved = (seed >>> 10) % 2;
    return {
      serial_no: String(index + 1),
      circle: "Circle-" + String((seed % 180) + 1).padStart(3, "0"),
      not_initialized: String(notInitialized),
      initialized: String(initialized),
      double_entry_complete: String(complete),
      co_ongoing: String(ongoing),
      approved: String(approved),
      total_psr: String(notInitialized + initialized + complete + ongoing + approved),
    };
  });
}

function buildUserRows(circle: string, zone: string): TableRow[] {
  const existing = USER_ROWS_BY_CIRCLE[circle];
  if (existing?.length) {
    return existing.map(row => ({
      ...row,
      status: String(row.status_code ?? ""),
    }));
  }

  const names = ["Jahid Hasan", "Shohel Rana", "Nasrin Akter", "Fatema Begum"];
  return names.map((name, index) => {
    const seed = dashboardHashSeed([zone, circle, name].join("|"));
    return {
      serial_no: String(index + 1),
      user_id: "user" + String(index + 1) + "@" + circle.replace(/[^0-9A-Za-z]/g, ""),
      name,
      draft_entry: String(seed % 4),
      saved_entry: String((seed >>> 3) % 4),
      entry_complete: String((seed >>> 6) % 4),
      co_ongoing: String((seed >>> 9) % 3),
      approved_entry: String((seed >>> 11) % 3),
      designation: "ডাটা এন্ট্রি অপারেটর",
      status_code: index === 3 ? "Inactive" : "Active",
      status: index === 3 ? "Inactive" : "Active",
    };
  });
}

export function CombinedDashboardPage() {
  const { assessmentYear } = useSettings();
  const { isDesktop } = useUIState();
  const { t: translate } = useTranslation("dashboard");
  const { t: translateCommon } = useTranslation("common");
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedZone = searchParams.get("zone") || "";
  const selectedCircle = searchParams.get("circle") || "";
  const level = selectedCircle ? "user" : selectedZone ? "circle" : "zone";

  const [search, setSearch] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [filterEditing, setFilterEditing] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});

  const filters = useMemo<FilterDef[]>(() => [
    {
      key: "assessment_year",
      label: "Assessment Year",
      labelKey: "labels.assessmentYear",
      type: "select",
      options: ["2025-26", "2024-25", "2023-24", "2022-23", "2021-22"],
    },
    {
      key: "tax_zone",
      label: "Zone",
      labelKey: "labels.zone",
      type: "select",
      options: ["All Zones", ...ZONE_ROWS.map(row => String(row.zone))],
      optionKeys: { "All Zones": "options.allZones" },
    },
    {
      key: "status",
      label: "Status",
      labelKey: "labels.status",
      type: "select",
      options: ["All Status", "Not Initialized", "Initialized", "Double Entry Complete", "CO Ongoing", "Approved"],
      optionKeys: {
        "All Status": "options.allStatus",
        "Not Initialized": "options.notInitialized",
        "Initialized": "options.initialized",
        "Double Entry Complete": "options.doubleEntryComplete",
        "CO Ongoing": "options.coOngoing",
        "Approved": "options.approved",
      },
    },
  ], []);

  const sourceRows = useMemo<TableRow[]>(() => {
    if (level === "user") return buildUserRows(selectedCircle, selectedZone);
    if (level === "circle") return buildCircleRows(selectedZone);
    return buildDoubleEntryZoneRows(appliedFilters);
  }, [appliedFilters, level, selectedCircle, selectedZone]);

  const scopeRows = useMemo(() => {
    if (level !== "zone") return sourceRows;

    const statusFilter = appliedFilters.status;
    return sourceRows.filter(row => rowMatchesAggregateStatus(row, statusFilter));
  }, [sourceRows, appliedFilters.status, level]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return scopeRows;
    return scopeRows.filter(row =>
      Object.values(row).some(value => String(value ?? "").toLowerCase().includes(query))
    );
  }, [scopeRows, search]);

  const summary = useMemo(() => {
    if (level === "user") {
      const circleRow = buildCircleRows(selectedZone).find(row => row.circle === selectedCircle);
      return circleRow
        ? aggregateSummary([circleRow])
        : { notInitialized: 0, initialized: 0, pending: 0, approved: 0 };
    }

    return aggregateSummary(scopeRows);
  }, [level, scopeRows, selectedCircle, selectedZone]);

  const kpiCards = [
    { label: translate("combined.kpis.notInitialized"), value: String(summary.notInitialized), icon: ClipboardList, tone: "primary" as const },
    { label: translate("combined.kpis.initialized"), value: String(summary.initialized), icon: Activity, tone: "success" as const },
    { label: translate("combined.kpis.pending"), value: String(summary.pending), icon: Clock, tone: "warning" as const },
    { label: translate("combined.kpis.totalApproved"), value: String(summary.approved), icon: BadgeCheck, tone: "neutral" as const },
  ];

  const hasAppliedFilters = hasMeaningfulDashboardFilters(appliedFilters);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilterValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const openFilters = useCallback(() => {
    if (hasAppliedFilters) {
      setFilterValues({ ...appliedFilters });
      setFilterEditing(true);
      setShowFilter(true);
      return;
    }
    setFilterEditing(false);
    setShowFilter(open => !open);
  }, [appliedFilters, hasAppliedFilters]);

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters(filterValues);
    setFilterEditing(false);
    setShowFilter(false);
    setSearch("");
  }, [filterValues]);

  const handleCancelFilters = useCallback(() => {
    setFilterValues({ ...appliedFilters });
    setFilterEditing(false);
    setShowFilter(false);
  }, [appliedFilters]);

  const handleResetFilters = useCallback(() => {
    setFilterValues({});
    setAppliedFilters({});
    setFilterEditing(false);
    setShowFilter(false);
    setSearch("");
  }, []);

  const resetNestedState = useCallback(() => {
    setSearch("");
    setFilterValues({});
    setAppliedFilters({});
    setFilterEditing(false);
    setShowFilter(false);
  }, []);

  const handleCellClick = useCallback((key: string, value: string) => {
    if (key === "zone") {
      setSearchParams({ zone: value });
      resetNestedState();
      return;
    }

    if (key === "circle" && selectedZone) {
      setSearchParams({ zone: selectedZone, circle: value });
      resetNestedState();
    }
  }, [resetNestedState, selectedZone, setSearchParams]);

  const handleRowClick = useCallback((row: TableRow) => {
    if (level === "zone") {
      const zone = String(row.zone ?? "");
      if (zone) handleCellClick("zone", zone);
      return;
    }

    if (level === "circle") {
      const circle = String(row.circle ?? "");
      if (circle) handleCellClick("circle", circle);
    }
  }, [handleCellClick, level]);

  const handleBack = useCallback(() => {
    if (level === "user" && selectedZone) {
      setSearchParams({ zone: selectedZone });
    } else {
      setSearchParams({});
    }
    resetNestedState();
  }, [level, resetNestedState, selectedZone, setSearchParams]);

  const cols = level === "user" ? USER_COLS : level === "circle" ? CIRCLE_COLS : AGGREGATE_COLS;
  const clickableKeys = level === "zone" ? ["zone"] : level === "circle" ? ["circle"] : undefined;
  const mobileCardMapping = level === "user" ? USER_MOBILE_MAPPING : level === "circle" ? CIRCLE_MOBILE_MAPPING : ZONE_MOBILE_MAPPING;

  const sectionTitle =
    level === "user"
      ? translate("combined.sections.userwiseStatus")
      : level === "circle"
        ? translate("combined.sections.circlewiseStatus")
        : translate("combined.sections.zonewiseStatus");

  const subtitle =
    level === "user"
      ? translate("combined.circleSubtitle", { circle: selectedCircle, zone: selectedZone })
      : level === "circle"
        ? translate("combined.zoneSubtitle", { zone: selectedZone })
        : translate("combined.subtitle");

  return (
    <div className="dashboard-page">
      <div className="dashboard-page__header">
        <h1 className="dashboard-page__title">{translate("combined.title")}</h1>
        <p className="dashboard-page__subtitle">{subtitle}</p>
      </div>

      <div className="combine-dashboard__metric-group">
        <div className="combine-dashboard__group-label flex items-center gap-2">
          <h2 className="dash-section__title-text">
            {translate("combined.sections.overview")}
          </h2>

          <div className="table-page__actions ml-auto">
            {level === "zone" && (
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
            )}

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

        {level === "zone" && isDesktop && (
          <div
            className={`dashboard-filter-reveal${showFilter ? " dashboard-filter-reveal--open" : ""}`}
            aria-hidden={!showFilter}
          >
            <div className="dashboard-filter-reveal__inner">
              <div className="card">
                <FilterPanel
                  filters={filters}
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

        {level === "zone" && (
          <AppliedFilterChips
            values={appliedFilters}
            onClear={handleResetFilters}
            cardView
          />
        )}

        <div className="dashboard-kpi-grid dashboard-kpi-grid--1row">
          {kpiCards.map((card, index) => (
            <StatCard
              key={index}
              icon={card.icon}
              value={card.value}
              label={card.label}
              tone={card.tone}
            />
          ))}
        </div>
      </div>

      <div className="dashboard-content-stack">
        <div className="table-card">
          <div className="table-card__toolbar">
            <div className="table-card__title-group">
              {level !== "zone" && (
                <SecondaryButton
                  size="sm"
                  icon={ArrowLeft}
                  onClick={handleBack}
                >
                  {level === "user"
                    ? translate("combined.actions.backToCircles")
                    : translate("combined.actions.backToZones")}
                </SecondaryButton>
              )}
              <h2 className="table-card__title">{sectionTitle}</h2>
              <span className="table-card__count" aria-live="polite" aria-atomic="true">
                {filteredRows.length} {translateCommon("common.records")}
              </span>
              <span className="dash-section__badge">
                {translateCommon("common.ayAbbrev")} {level === "zone" && appliedFilters.assessment_year ? appliedFilters.assessment_year : assessmentYear}
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

          <div className={`double-entry-table double-entry-table--${level}`}>
            <ResponsiveTable
              cols={cols}
              rows={filteredRows}
              mobileCardMapping={mobileCardMapping}
              clickableKeys={clickableKeys}
              onCellClick={handleCellClick}
              onRowClick={level === "user" ? undefined : handleRowClick}
              noCard
            />
          </div>
        </div>
      </div>

      {level === "zone" && !isDesktop && (
        <MobileFilterOverlay
          isOpen={showFilter}
          filters={filters}
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
