import type { FilterDef, PageCfg, TableRow } from "../../pages/modulePageUtils";

/** A filter is usable only when its underlying record field is actually present. */
export interface TableFilterBindings {
  filters: FilterDef[];
  fieldByFilter: Record<string, string>;
  dateField?: string;
}

const hasValue = (rows: TableRow[], field: string): boolean =>
  rows.some(row => row[field] !== undefined && row[field] !== null && row[field] !== "" && row[field] !== "—");

function findDateField(cfg: PageCfg, rows: TableRow[]): string | undefined {
  const columnKeys = cfg.cols.flatMap(col => col.type === "col"
    ? [col.col.key]
    : col.group.cols.map(c => c.key));
  const candidates = [cfg.filterDateField, cfg.mobileCardMapping?.date,
    ...columnKeys.filter(key => key === "date" || key.endsWith("_date") || key === "last_updated")];
  return candidates.find((key): key is string => !!key && hasValue(rows, key));
}

export function deriveTableFilterBindings(cfg: PageCfg, rows: TableRow[]): TableFilterBindings {
  // Register-4 has a separately reviewed, explicit field contract. Never alter
  // its approved filter options or how its assessment-year scope is applied.
  if (cfg.applyTableFilters) {
    const dateField = cfg.filterDateField ?? "date";
    const fieldByFilter = Object.fromEntries(cfg.filters.map(filter =>
      [filter.key, filter.key === "from" || filter.key === "to" ? dateField : filter.key]));
    return { filters: cfg.filters, fieldByFilter, dateField };
  }

  const dateField = findDateField(cfg, rows);
  const fieldByFilter: Record<string, string> = {};
  const filters = cfg.filters.filter(filter => {
    if (filter.key === "from" || filter.key === "to") {
      if (!dateField) return false;
      fieldByFilter[filter.key] = dateField;
      return true;
    }

    let key = filter.key;
    if (!hasValue(rows, key)) {
      // Legacy screens name status/method generically, while the row has a
      // single more specific status/method column. Bind only unambiguous keys.
      const suffix = key === "status" ? "_status" : key === "method" ? "_method" : "";
      const matches = suffix
        ? [...new Set(rows.flatMap(row => Object.keys(row)).filter(k => k.endsWith(suffix) && hasValue(rows, k)))]
        : [];
      if (matches.length !== 1) return false;
      key = matches[0];
    }
    fieldByFilter[filter.key] = key;
    return true;
  });

  return { filters, fieldByFilter, dateField };
}

export function matchesTableFilters(row: TableRow, applied: Record<string, string>, bindings: TableFilterBindings): boolean {
  for (const [key, value] of Object.entries(applied)) {
    if (!value || value.startsWith("All ") || value === "All") continue;
    const field = bindings.fieldByFilter[key];
    if (!field) continue;
    const actual = String(row[field] ?? "");
    if (key === "from" || key === "to") {
      // Both the form input and fixture/API date fields use ISO YYYY-MM-DD.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(actual) ||
        (key === "from" && actual < value) || (key === "to" && actual > value)) return false;
    } else if (actual !== value) {
      return false;
    }
  }
  return true;
}
