import { describe, expect, it } from "vitest";
import { deriveTableFilterBindings, matchesTableFilters } from "../app/components/pages/tableFilters";
import { BASE_FILTERS, onlineRetRows, taxRegRows, auditRows, type PageCfg, type FilterDef, type TableRow } from "../app/pages/modulePageUtils";

function config(rows: TableRow[], filters: FilterDef[], dateKey: string, extra: Partial<PageCfg> = {}): PageCfg {
  return {
    title: "Table", desc: "", rows, filters, actions: [],
    cols: Object.keys(rows[0] ?? {}).map(key => ({ type: "col" as const, col: { key, label: key } })),
    mobileCardMapping: { date: dateKey }, ...extra,
  };
}

describe("shared Office table filtering", () => {
  it("makes online-return circle, year, and date filters effective without pretending absent zone data exists", () => {
    const cfg = config(onlineRetRows, BASE_FILTERS, "submission_date");
    const bindings = deriveTableFilterBindings(cfg, cfg.rows);
    expect(bindings.filters.map(f => f.key)).toEqual(["circle", "ay", "from", "to"]);
    expect(bindings.dateField).toBe("submission_date");
    const matches = cfg.rows.filter(row => matchesTableFilters(row, {
      circle: "Circle-1", ay: "2024-25", from: "2026-01-01", to: "2026-01-31",
    }, bindings));
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every(row => row.ay === "2024-25" && String(row.submission_date).startsWith("2026-01"))).toBe(true);
    expect(matches.length).toBeLessThan(cfg.rows.length);
  });

  it("binds Tax Registry's Status control to the actual active_status field", () => {
    const filters: FilterDef[] = [
      { key: "status", label: "Status", type: "select", options: ["All Status", "Active", "Inactive"] },
      { key: "zone", label: "Zone", type: "select" },
      { key: "from", label: "From", type: "date" },
    ];
    const cfg = config(taxRegRows, filters, "registration_date");
    const bindings = deriveTableFilterBindings(cfg, cfg.rows);
    expect(bindings.fieldByFilter.status).toBe("active_status");
    expect(bindings.fieldByFilter.zone).toBe("zone");
    expect(cfg.rows.filter(r => matchesTableFilters(r, { status: "Active" }, bindings))).toHaveLength(20);
    expect(cfg.rows.filter(r => matchesTableFilters(r, { status: "All Status" }, bindings))).toHaveLength(40);
  });

  it("binds Audit Selection's Method and Status to their actual columns", () => {
    const filters: FilterDef[] = [
      { key: "method", label: "Method", type: "select" },
      { key: "status", label: "Status", type: "select" },
    ];
    const cfg = config(auditRows, filters, "selected_date");
    const bindings = deriveTableFilterBindings(cfg, cfg.rows);
    expect(bindings.fieldByFilter).toEqual({ method: "selection_method", status: "audit_status" });
    const matches = cfg.rows.filter(r => matchesTableFilters(r, { method: "Random", status: "In Progress" }, bindings));
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.every(r => r.selection_method === "Random" && r.audit_status === "In Progress")).toBe(true);
  });

  it("rejects malformed/missing record dates when the user applies a date range", () => {
    const rows: TableRow[] = [
      { id: "1", submission_date: "2026-01-15" },
      { id: "2", submission_date: "not a date" },
      { id: "3", submission_date: "" },
    ];
    const cfg = config(rows, [{ key: "from", label: "From", type: "date" }], "submission_date");
    const bindings = deriveTableFilterBindings(cfg, rows);
    expect(rows.filter(r => matchesTableFilters(r, { from: "2026-01-01" }, bindings))).toEqual([rows[0]]);
  });

  it("preserves Register-4's explicit reviewed filter contract", () => {
    const filters: FilterDef[] = [
      { key: "circle", label: "Circle", type: "select" },
      { key: "from", label: "From", type: "date" },
    ];
    const cfg = config([{ id: "1", circle: "Circle-375", assessment_date: "2026-04-01" }], filters, "assessment_date", {
      applyTableFilters: true, filterDateField: "assessment_date",
    });
    const bindings = deriveTableFilterBindings(cfg, cfg.rows);
    expect(bindings.filters).toBe(filters);
    expect(bindings.dateField).toBe("assessment_date");
    expect(matchesTableFilters(cfg.rows[0], { circle: "Circle-375", from: "2026-04-01" }, bindings)).toBe(true);
  });
});
