import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Plus, Filter, Download, Printer, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { handleExportDisabled } from "../../utils/exportDisabled";
import { AppSearchField } from "../forms/AppSearchField";
import { useTranslation } from "react-i18next";
import { CollapsibleKpiSection } from "../cards/CollapsibleKpiSection";
import { FilterPanel } from "../filters/FilterPanel";
import { MobileFilterOverlay } from "../filters/MobileFilterOverlay";
import { MobileSearchFilter } from "../shared/MobileSearchFilter";
import { AppliedFilterChips } from "../filters/AppliedFilterChips";
import { ResponsiveTable } from "../tables/ResponsiveTable";
import { Pagination } from "../shared/Pagination";
import { DynamicDetailsDrawer } from "../drawers/DynamicDetailsDrawer";
import { AppModal } from "../modals/AppModal";
import { EntryForm, type FormField, type EntryFormValue } from "../forms/EntryForm";
import type { PageCfg, TableRow } from "../../pages/modulePageUtils";
import { type AttachmentItem, getAttachmentPreviewKind, formatFileSize } from "../attachments/attachmentTypes";
import { ZONES, CIRCLES, AY_OPTS } from "../../pages/modulePageUtils";
import { useUIState } from "../../hooks/useUI";

const PER = 10;

interface GeneratedTablePageProps {
  cfg: PageCfg;
  drawerFields?: { label: string; key: string }[];
  wrapTitle?: boolean;
}

// ── Row creation helpers ──────────────────────────────────────────────────────

function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function getNextNumericId(rows: TableRow[]): string {
  const nums = rows
    .map(r => Number(r.id))
    .filter(n => !isNaN(n) && n > 0);
  return String(nums.length > 0 ? Math.max(...nums) + 1 : 1001);
}

function getNextCode(rows: TableRow[], key: string, prefix: string): string {
  const existing = rows
    .map(r => String(r[key] ?? ""))
    .filter(v => v.startsWith(prefix))
    .map(v => parseInt(v.replace(prefix, ""), 10))
    .filter(n => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 9000;
  return `${prefix}${next}`;
}

function getFileSummary(files: File[]): string {
  return files.length === 0 ? "0 files" : `${files.length} file${files.length > 1 ? "s" : ""}`;
}

function getFileNames(files: File[]): string {
  return files.map(f => f.name).join(", ");
}

function createAttachmentItems(files: File[]): AttachmentItem[] {
  return files.map((file, i) => {
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
    return {
      id: `att-${Date.now()}-${i}`,
      name: file.name,
      size: file.size,
      sizeLabel: formatFileSize(file.size),
      type: file.type || "application/octet-stream",
      extension: ext,
      previewKind: getAttachmentPreviewKind(file.name, file.type),
      objectUrl: URL.createObjectURL(file),
      uploadedAt: new Date().toISOString(),
    };
  });
}

function revokeRowAttachmentUrls(rows: TableRow[]): void {
  for (const row of rows) {
    for (const val of Object.values(row)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === "object" && "objectUrl" in item && item.objectUrl) {
            URL.revokeObjectURL(item.objectUrl as string);
          }
        }
      }
    }
  }
}

function createPsrEntryRow(
  values: Record<string, EntryFormValue>,
  fields: FormField[],
  existingRows: TableRow[]
): TableRow {
  const get = (key: string): string => {
    const f = fields.find(f => f.key === key);
    if (!f) return "";
    const idx = fields.indexOf(f);
    const id = f.key ?? `entry-field-${idx}`;
    const v = values[id];
    return typeof v === "string" ? v : "";
  };
  const getFiles = (key: string): File[] => {
    const f = fields.find(f => f.key === key);
    if (!f) return [];
    const idx = fields.indexOf(f);
    const id = f.key ?? `entry-field-${idx}`;
    const v = values[id];
    return Array.isArray(v) ? v : [];
  };

  const files = getFiles("attachments");
  const psrNoVal = get("psr_no").trim() || getNextCode(existingRows, "psr_no", "PSR-");

  return {
    id: getNextNumericId(existingRows),
    tin: get("tin"),
    name: get("taxpayer_name"),
    circle: get("circle"),
    psr_no: psrNoVal,
    submitted_by: get("submitted_by"),
    submission_date: get("submission_date") || getTodayISO(),
    tax_amount: get("tax_amount") ? `৳${get("tax_amount")}` : "৳0",
    approval_status: "Pending",
    attachment_count: getFileSummary(files),
    attachment_names: getFileNames(files),
    attachments: createAttachmentItems(files),
    remarks: get("remarks"),
    ay: get("ay"),
    zone: get("zone"),
  };
}

function createPsrBulkRows(
  values: Record<string, EntryFormValue>,
  fields: FormField[],
  existingRows: TableRow[]
): TableRow[] {
  const get = (key: string): string => {
    const f = fields.find(f => f.key === key);
    if (!f) return "";
    const idx = fields.indexOf(f);
    const id = f.key ?? `entry-field-${idx}`;
    const v = values[id];
    return typeof v === "string" ? v : "";
  };
  const getFiles = (key: string): File[] => {
    const f = fields.find(f => f.key === key);
    if (!f) return [];
    const idx = fields.indexOf(f);
    const id = f.key ?? `entry-field-${idx}`;
    const v = values[id];
    return Array.isArray(v) ? v : [];
  };

  const files = getFiles("attachments");
  const ay = get("assessment_year");
  const circle = get("circle");
  const zone = get("zone");
  const remarks = get("remarks");
  const today = getTodayISO();
  let baseId = Number(getNextNumericId(existingRows));

  return files.map((file, i) => {
    const psrNo = getNextCode([...existingRows, ...Array(i).fill({ psr_no: `PSR-${9000 + baseId + i - 1}` })], "psr_no", "PSR-");
    return {
      id: String(baseId + i),
      tin: `TIN-BULK-${baseId + i}`,
      name: "Bulk Uploaded Taxpayer",
      circle,
      psr_no: psrNo,
      submitted_by: "Bulk Upload",
      submission_date: today,
      tax_amount: "৳0",
      approval_status: "Pending",
      source_file: file.name,
      attachment_count: "1 file",
      attachment_names: file.name,
      attachments: createAttachmentItems([file]),
      remarks,
      ay,
      zone,
    };
  });
}

function createGenericRow(
  values: Record<string, EntryFormValue>,
  fields: FormField[],
  existingRows: TableRow[]
): TableRow {
  const row: TableRow = { id: getNextNumericId(existingRows) };
  fields.forEach((f, i) => {
    const key = f.key ?? f.label.toLowerCase().replace(/\s+/g, "_");
    const id = f.key ?? `entry-field-${i}`;
    const v = values[id];
    if (f.type === "file") {
      const files = Array.isArray(v) ? v : [];
      row[`${key}_count`] = getFileSummary(files);
      row[`${key}_names`] = getFileNames(files);
      row[key] = createAttachmentItems(files);
    } else {
      row[key] = typeof v === "string" ? v : "";
    }
  });
  return row;
}

// ── PSR form field builders ───────────────────────────────────────────────────

function buildPsrEntryFields(tf: (k: string, opts?: Record<string, string>) => string): FormField[] {
  return [
    { key: "tin",             label: tf("fields.tin"),            type: "text",     required: true },
    { key: "taxpayer_name",   label: tf("fields.taxpayerName"),   type: "text",     required: true },
    { key: "ay",              label: tf("fields.assessmentYear"), type: "select",   required: true, options: AY_OPTS },
    { key: "circle",          label: tf("fields.circle"),         type: "select",   required: true, options: CIRCLES },
    { key: "zone",            label: tf("fields.zone"),           type: "select",   required: true, options: ZONES },
    { key: "psr_no",          label: tf("fields.psrNo"),          type: "text", helper: tf("fields.psrNoHelper") },
    { key: "submitted_by",    label: tf("fields.submittedBy"),    type: "text",     required: true },
    { key: "submission_date", label: tf("fields.submissionDate"), type: "date",     required: true, defaultValue: getTodayISO() },
    { key: "tax_amount",      label: tf("fields.taxAmount"),      type: "number",   required: true },
    { key: "attachments",     label: tf("fields.attachments"),    type: "file",     maxFiles: 5, maxSizeMB: 2, accept: [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"], span: true },
    { key: "remarks",         label: tf("fields.remarks"),        type: "textarea", span: true },
  ];
}

function buildPsrBulkEntryFields(tf: (k: string, opts?: Record<string, string>) => string): FormField[] {
  return [
    { key: "assessment_year", label: tf("fields.assessmentYear"), type: "select",  required: true, options: AY_OPTS },
    { key: "circle",          label: tf("fields.circle"),         type: "select",  required: true, options: CIRCLES },
    { key: "zone",            label: tf("fields.zone"),           type: "select",  required: true, options: ZONES },
    { key: "attachments",     label: tf("fields.attachments"),    type: "file",     required: true, maxFiles: 5, maxSizeMB: 2, accept: [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"], span: true, helper: tf("fileUpload.bulkHelper") },
    { key: "remarks",         label: tf("fields.remarks"),        type: "textarea", span: true },
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function GeneratedTablePage({ cfg, drawerFields, wrapTitle }: GeneratedTablePageProps) {
  const { isDesktop } = useUIState();
  const { t: translateCommon } = useTranslation("common");
  const { t: translateActions } = useTranslation("actions");
  const { t: translateDrawers } = useTranslation("drawers");
  const { t: translatePages } = useTranslation("pages");
  const { t: translateForms } = useTranslation("forms");

  const resolvedTitle = cfg.titleKey ? translatePages(cfg.titleKey) || cfg.title : cfg.title;
  const resolvedDesc  = cfg.descKey  ? translatePages(cfg.descKey)  || cfg.desc  : cfg.desc;
  const storageKey    = `kpi-collapsed:${cfg.titleKey ?? cfg.title}`;

  const [kpiOpen, setKpiOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(storageKey) !== "false"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, String(kpiOpen)); } catch { /* ignore */ }
  }, [kpiOpen, storageKey]);

  // ── Local row state ──────────────────────────────────────────────────────
  const [rows, setRows] = useState<TableRow[]>(() => cfg.rows);
  useEffect(() => { setRows(cfg.rows); }, [cfg.rows]);

  // Revoke object URLs on unmount to avoid memory leaks
  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  useEffect(() => () => { revokeRowAttachmentUrls(rowsRef.current); }, []);

  const [page, setPage]     = useState(1);
  const [perPage, setPerPage] = useState(PER);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"ascending" | "descending">("ascending");
  const [q, setQ]           = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const [fVals, setFVals]   = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<TableRow | null>(null);
  const [modal, setModal]   = useState<string | null>(null);
  const [inlineOpen,setInlineOpen]=useState(false);
  const [inlineValues,setInlineValues]=useState<Record<string,string>>({});
  const updateInlineValues=useCallback((patch:Record<string,string>)=>setInlineValues(previous=>({...previous,...patch})),[]);
  const cancelInlineEntry=useCallback(()=>{setInlineOpen(false);setInlineValues({});},[]);

  useEffect(() => {
    if (cfg.assessmentYearScope) setPage(1);
  }, [cfg.assessmentYearScope?.year]);

  // Only opted-in pages derive selectable circles from their own displayed
  // records; unrelated page filters keep their previous definitions.
  const effectiveFilters = useMemo(() => cfg.applyTableFilters
    ? cfg.filters.map(filter => {
        if (filter.key !== "circle" || filter.type !== "select") return filter;
        const actual = rows.map(r => String(r.circle ?? "")).filter(v => v && v !== "—");
        return { ...filter, options: [...new Set([...(filter.options ?? []), ...actual])] };
      })
    : cfg.filters, [cfg.filters, cfg.applyTableFilters, rows]);

  const sourceForDrawer = cfg.drawerCols ?? cfg.cols;
  const drawerColumns = useMemo(() => sourceForDrawer.flatMap(col => {
    if (col.type === "col") {
      return [{ key: col.col.key, label: col.col.label, labelKey: col.col.headerKey }];
    }
    return col.group.cols.map(subCol => ({
      key: subCol.key, label: subCol.label,
      labelKey: subCol.headerKey,
      groupLabel: col.group.label, groupLabelKey: col.group.groupKey,
    }));
  }), [sourceForDrawer]);

  const filtered = useMemo(() => rows.filter(row => {
    if (cfg.assessmentYearScope && String(row[cfg.assessmentYearScope.field] ?? "") !== cfg.assessmentYearScope.year) {
      return false;
    }
    if (q && !Object.values(row).some(v => String(v ?? "").toLocaleLowerCase().includes(q.toLocaleLowerCase()))) {
      return false;
    }
    if (!cfg.applyTableFilters) return true;
    for (const [key, value] of Object.entries(applied)) {
      if (!value || value.startsWith("All ")) continue;
      if (key === "from" || key === "to") {
        const rowDate = String(row[cfg.filterDateField ?? "date"] ?? "");
        if (!rowDate || rowDate === "—" || (key === "from" && rowDate < value) || (key === "to" && rowDate > value)) {
          return false;
        }
      } else if (String(row[key] ?? "") !== value) {
        return false;
      }
    }
    return true;
  }), [rows, q, applied, cfg.assessmentYearScope?.field, cfg.assessmentYearScope?.year, cfg.applyTableFilters, cfg.filterDateField]);

  const sortedRows = useMemo(() => {
    if (!cfg.enableSort || !sortKey) return filtered;
    const comparator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    return [...filtered].sort((left, right) => {
      const a = String(left[sortKey] ?? "");
      const b = String(right[sortKey] ?? "");
      const aMissing = !a || a === "—";
      const bMissing = !b || b === "—";
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      const result = comparator.compare(a, b);
      return sortDirection === "ascending" ? result : -result;
    });
  }, [filtered, cfg.enableSort, sortKey, sortDirection]);
  const pageRows = useMemo(() => sortedRows.slice((page - 1) * perPage, page * perPage), [sortedRows, page, perPage]);
  const visibleKpis = cfg.buildVisibleKpis?.(filtered) ?? cfg.kpis;
  const handleSortColumn = useCallback((key: string) => {
    setSortDirection(prev => sortKey === key && prev === "ascending" ? "descending" : "ascending");
    setSortKey(key);
    setPage(1);
  }, [sortKey]);

  const handleSearchChange = useCallback((value: string) => { setQ(value); setPage(1); }, []);
  const handleFilterToggle = useCallback(() => setShowFilter(s => !s), []);
  const handleFilterChange = useCallback((k: string, v: string) => setFVals(p => ({ ...p, [k]: v })), []);
  const handleFilterApply  = useCallback(() => {
    if (cfg.applyTableFilters && fVals.from && fVals.to && fVals.from > fVals.to) {
      toast.error(translatePages("register4.invalidDateRange", { defaultValue: "Start date must be on or before end date" }));
      return;
    }
    setApplied(fVals); setShowFilter(false); setPage(1);
  }, [fVals, cfg.applyTableFilters, translatePages]);
  const handleFilterReset  = useCallback(() => { setFVals({}); setApplied({}); }, []);
  const handleRowClick     = useCallback((row: TableRow) => setDrawer(row), []);
  const handleDrawerClose  = useCallback(() => setDrawer(null), []);

  // ── Submit handlers ───────────────────────────────────────────────────────
  const handleEntrySubmit = useCallback((values: Record<string, EntryFormValue>) => {
    const newRow = cfg.createEntryRow
      ? cfg.createEntryRow(values, rows)
      : createGenericRow(values,
      [
        { key: "tin",             label: translateForms("fields.tin"),            type: "text" },
        { key: "taxpayer_name",   label: translateForms("fields.taxpayerName"),   type: "text" },
        { key: "ay",              label: translateForms("fields.assessmentYear"), type: "select" },
        { key: "circle",          label: translateForms("fields.circle"),         type: "select" },
        { key: "zone",            label: translateForms("fields.zone"),           type: "select" },
        { key: "amount",          label: translateForms("fields.amountBdt"),      type: "number" },
        { key: "date",            label: translateForms("fields.date"),           type: "date" },
        { key: "remarks",         label: translateForms("fields.remarks"),        type: "textarea" },
      ],
      rows
    );
    setRows(prev => [newRow, ...prev]);
    setPage(1);
    setModal(null);
    toast.success(cfg.createEntryRow
      ? translatePages("register4.localDraftAdded", { defaultValue: "Local draft added (not saved to the server)" })
      : translateActions("entryCreated", { defaultValue: "Entry created successfully" }));
  }, [rows, translateForms, translateActions, translatePages, cfg.createEntryRow]);

  const saveInlineEntry=useCallback(()=>{
    handleEntrySubmit(inlineValues);
    setInlineValues({});setInlineOpen(false);
  },[handleEntrySubmit,inlineValues]);
  const handleExtraBtnSubmit = useCallback((btn: NonNullable<PageCfg["extraBtns"]>[number], fields: FormField[]) =>
    (values: Record<string, EntryFormValue>) => {
      if (btn.formKind === "psr-bulk-entry") {
        const newRows = createPsrBulkRows(values, fields, rows);
        if (newRows.length === 0) return;
        setRows(prev => [...newRows, ...prev]);
        setPage(1);
        setModal(null);
        toast.success(translateActions("entriesCreated", { count: String(newRows.length), defaultValue: `${newRows.length} entries created successfully` }));
      } else if (btn.formKind === "psr-entry") {
        const newRow = createPsrEntryRow(values, fields, rows);
        setRows(prev => [newRow, ...prev]);
        setPage(1);
        setModal(null);
        toast.success(translateActions("entryCreated", { defaultValue: "Entry created successfully" }));
      } else {
        const newRow = createGenericRow(values, fields, rows);
        setRows(prev => [newRow, ...prev]);
        setPage(1);
        setModal(null);
        toast.success(translateActions("entryCreated", { defaultValue: "Entry created successfully" }));
      }
    }, [rows, translateActions]);

  return (
    <div className="table-page">
      {/* Page Header */}
      {!wrapTitle && (
        <div className="table-page__header">
          <div>
            <h1 className="table-page__title">{resolvedTitle}</h1>
            <p className="table-page__desc">{resolvedDesc}</p>
          </div>
          <div className="table-page__actions">
            {cfg.entryBtn && (
              <button onClick={() => setModal("entry")} className="table-card__toolbar-btn table-card__toolbar-btn--primary">
                <Plus size={13} aria-hidden="true" /> {cfg.entryBtn}
              </button>
            )}
            {cfg.inlineEntryBtn && cfg.inlineEntryComponent && (
              <button type="button" onClick={()=>{if(!inlineOpen){setInlineValues(cfg.inlineInitialValues?.(rows) ?? {});setPage(1);setInlineOpen(true);}}}
                disabled={inlineOpen} className="table-card__toolbar-btn" aria-label={cfg.inlineEntryBtn}>
                <Plus size={13} aria-hidden="true"/>{cfg.inlineEntryBtn}
              </button>
            )}
            {cfg.extraBtns?.map((b) => {
              const Icon = b.icon;
              return (
                <button key={b.id} onClick={() => setModal(`extra:${b.id}`)} className="table-card__toolbar-btn table-card__toolbar-btn--primary">
                  <Icon size={13} aria-hidden="true" /> {b.label}
                </button>
              );
            })}
            {visibleKpis && (
              <button
                onClick={() => setKpiOpen(o => !o)}
                className="table-page__kpi-toggle"
                aria-expanded={kpiOpen}
                aria-controls="kpi-section-panel"
                aria-label={kpiOpen ? translateActions("hideSummary") : translateActions("showSummary")}
              >
                {kpiOpen
                  ? <><ChevronUp size={13} strokeWidth={2} aria-hidden="true" />{translateActions("hideSummary")}</>
                  : <><ChevronDown size={13} strokeWidth={2} aria-hidden="true" />{translateActions("showSummary")}</>
                }
              </button>
            )}
          </div>
        </div>
      )}

      {visibleKpis && <CollapsibleKpiSection kpis={visibleKpis} open={kpiOpen} />}

      <MobileSearchFilter
        searchValue={q}
        onSearchChange={handleSearchChange}
        onFilterClick={handleFilterToggle}
        placeholder={translateCommon("common.searchPlaceholder")}
        hasActiveFilters={Object.keys(applied).length > 0}
      />

      <div className="table-card">
        <div className="table-card__toolbar">
          <div className="table-card__title-group">
            <h2 className="table-card__title">{resolvedTitle}</h2>
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
          <button onClick={handleFilterToggle} className={`table-card__toolbar-btn${showFilter ? " table-card__toolbar-btn--active" : ""}`}>
            <Filter size={13} aria-hidden="true" /> {translateCommon("actions.filter")}
          </button>
          <button className="table-card__toolbar-btn table-card__toolbar-btn--download" onClick={() => cfg.onExportRows ? cfg.onExportRows(sortedRows) : handleExportDisabled(translateCommon("actions.exportDisabled"))}>
            <Download size={13} aria-hidden="true" /> {translateCommon("actions.export")}
          </button>
          <button className="table-card__toolbar-btn table-card__toolbar-btn--print" onClick={() => window.print()}>
            <Printer size={13} aria-hidden="true" /> {translateCommon("actions.print")}
          </button>
        </div>

        {isDesktop && showFilter && (
          <div className="table-card__filter-panel">
            <FilterPanel filters={effectiveFilters} values={fVals} onChange={handleFilterChange} onApply={handleFilterApply} onReset={handleFilterReset} />
          </div>
        )}

        <AppliedFilterChips values={applied} onClear={() => setApplied({})} inCard />

        <ResponsiveTable
          cols={cfg.cols}
          rows={pageRows}
          actions={cfg.actions}
          onRowClick={handleRowClick}
          onActionClick={(_actionId, row) => handleRowClick(row)}
          mobileCardMapping={cfg.mobileCardMapping}
          noCard
          sortKey={cfg.enableSort ? sortKey ?? undefined : undefined}
          sortDirection={cfg.enableSort ? sortDirection : undefined}
          onSortColumn={cfg.enableSort ? handleSortColumn : undefined}
          inlineRow={inlineOpen && cfg.inlineEntryComponent ? (
            <cfg.inlineEntryComponent mode="table" assessmentYear={cfg.assessmentYearScope?.year ?? ""}
              values={inlineValues} onChange={updateInlineValues}
              onSave={saveInlineEntry} onCancel={cancelInlineEntry}/>
          ) : undefined}
          inlineMobileRow={inlineOpen && cfg.inlineEntryComponent ? (
            <cfg.inlineEntryComponent mode="mobile" assessmentYear={cfg.assessmentYearScope?.year ?? ""}
              values={inlineValues} onChange={updateInlineValues}
              onSave={saveInlineEntry} onCancel={cancelInlineEntry}/>
          ) : undefined}
        />

        <div className="table-card__pagination">
          <Pagination page={page} total={filtered.length} perPage={perPage} onPage={setPage}
            perPageOptions={cfg.pageSizeOptions}
            onPerPageChange={cfg.pageSizeOptions ? (n) => { setPerPage(n); setPage(1); } : undefined}
          />
        </div>
      </div>

      <DynamicDetailsDrawer
        open={drawer !== null}
        onClose={handleDrawerClose}
        title={translateDrawers("recordDetails.title")}
        columns={drawerColumns}
        rowData={drawer}
        showActions={true}
      />

      {/* Entry modal */}
      {cfg.entryBtn && (cfg.entryModalComponent ? (
        <cfg.entryModalComponent
          open={modal === "entry"}
          onClose={() => setModal(null)}
          onSubmit={handleEntrySubmit}
        />
      ) : (
        <AppModal open={modal === "entry"} title={cfg.entryBtn ?? resolvedTitle} onClose={() => setModal(null)}>
          <EntryForm
            onClose={() => setModal(null)}
            onSubmit={handleEntrySubmit}
            submitLabel={cfg.entrySubmitLabel}
            fields={cfg.entryFields ?? [
              { key: "tin",           label: translateForms("fields.tin"),            type: "text" },
              { key: "taxpayer_name", label: translateForms("fields.taxpayerName"),   type: "text" },
              { key: "ay",            label: translateForms("fields.assessmentYear"), type: "select", options: AY_OPTS },
              { key: "circle",        label: translateForms("fields.circle"),         type: "select", options: CIRCLES },
              { key: "zone",          label: translateForms("fields.zone"),           type: "select", options: ZONES },
              { key: "amount",        label: translateForms("fields.amountBdt"),      type: "number" },
              { key: "date",          label: translateForms("fields.date"),           type: "date" },
              { key: "remarks",       label: translateForms("fields.remarks"),        type: "textarea", span: true },
            ]}
          />
        </AppModal>
      ))}

      {/* Extra btn modals — each gets its own form fields based on formKind */}
      {cfg.extraBtns?.map(b => {
        const fields: FormField[] = b.formKind === "psr-entry"
          ? buildPsrEntryFields(translateForms)
          : b.formKind === "psr-bulk-entry"
            ? buildPsrBulkEntryFields(translateForms)
            : [
                { key: "ay",          label: translateForms("fields.assessmentYear"), type: "select",   options: AY_OPTS },
                { key: "circle",      label: translateForms("fields.circle"),         type: "select",   options: CIRCLES },
                { key: "attachments", label: translateForms("fields.fileUpload"),     type: "file",     span: true, maxFiles: 5, maxSizeMB: 2, accept: [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx"], helper: translateForms("fileUpload.helper") },
                { key: "remarks",     label: translateForms("fields.remarks"),        type: "textarea", span: true },
              ];

        return (
          <AppModal key={b.id} open={modal === `extra:${b.id}`} title={b.label} onClose={() => setModal(null)}>
            <EntryForm
              onClose={() => setModal(null)}
              onSubmit={handleExtraBtnSubmit(b, fields)}
              fields={fields}
            />
          </AppModal>
        );
      })}

      {!isDesktop && (
        <MobileFilterOverlay
          isOpen={showFilter}
          filters={effectiveFilters}
          values={fVals}
          onChange={handleFilterChange}
          onApply={handleFilterApply}
          onReset={handleFilterReset}
          onClose={handleFilterToggle}
        />
      )}
    </div>
  );
}

export { GeneratedTablePage as GenPage };
