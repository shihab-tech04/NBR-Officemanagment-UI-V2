import { describe, expect, it } from "vitest";
import type { ColDef, TableRow } from "../modulePageUtils";
import { buildAuditCsv } from "./auditCsvExport";

const cols: ColDef[] = [
  { type: "col", col: { key: "tin", label: "TIN" } },
  { type: "col", col: { key: "taxpayer_name", label: "Taxpayer" } },
  { type: "col", col: { key: "risk_level", label: "Risk" } },
];

describe("Audit CSV — visible filtered register", () => {
  it("exports exactly visible columns in displayed order and no hidden metadata", () => {
    const rows = [{ tin: "0012345678", taxpayer_name: "Example", risk_level: "Low", secret_metadata: "HIDDEN" }] as TableRow[];
    const csv = buildAuditCsv(cols, rows);
    expect(csv.startsWith("\uFEFF\"TIN\",\"Taxpayer\",\"Risk\"\r\n")).toBe(true);
    expect(csv).not.toContain("HIDDEN");
    expect(csv).toContain("\"'0012345678\"");
  });
  it("quotes commas, double quotes and line breaks", () => {
    const csv = buildAuditCsv(cols, [{ tin: "123", taxpayer_name: 'A, "B"\nC', risk_level: "High" }] as TableRow[]);
    expect(csv).toContain('\"A, \"\"B\"\"\nC\"');
  });
  it("neutralizes spreadsheet formulas in text fields without losing a negative numeric amount", () => {
    const csv = buildAuditCsv(cols, [{ tin: "9", taxpayer_name: "  =1+2", risk_level: "-100" }] as TableRow[]);
    expect(csv).toContain('\"\'  =1+2\"');
    expect(csv).toContain('\"-100\"');
    expect(buildAuditCsv(cols, [{ tin: "9", taxpayer_name: "@cmd", risk_level: "Low" }] as TableRow[])).toContain('\"\'@cmd\"');
  });
  it("keeps groups in their existing column order", () => {
    const grouped: ColDef[] = [{ type: "group", group: { label: "Totals", cols: [{ key: "a", label: "A" }, { key: "b", label: "B" }] } }];
    expect(buildAuditCsv(grouped, [{ a: "1", b: "2" }] as TableRow[])).toContain('\"A\",\"B\"\r\n\"1\",\"2\"');
  });
  it("exports an empty selection as headers only without inventing records", () => {
    const csv = buildAuditCsv(cols, []);
    expect(csv).toBe("\uFEFF\"TIN\",\"Taxpayer\",\"Risk\"\r\n");
  });
});
