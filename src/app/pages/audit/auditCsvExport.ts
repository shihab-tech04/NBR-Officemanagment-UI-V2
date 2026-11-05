import type { ColDef, TableRow } from "../modulePageUtils";

/** Export only the currently visible register columns and all matching rows. */
export function buildAuditCsv(columns: ColDef[], rows: TableRow[]): string {
  const flat = columns.flatMap((col) =>
    col.type === "col" ? [col.col] : col.group.cols,
  );
  const csvCell = (value: unknown, key = "") => {
    const raw = value === null || value === undefined ? "" :
      Array.isArray(value) ? value.map(String).join("; ") :
      typeof value === "object" ? JSON.stringify(value) : String(value);
    let text = raw.replace(/\u0000/g, "").replace(/\r\n?/g, "\n");
    // Preserve identifiers that start with zero when Excel opens the CSV.
    if ((key === "tin" || key.endsWith("_id")) && /^0\d+$/.test(text)) text = "'" + text;
    // Neutralize spreadsheet formulas, including leading whitespace bypasses.
    if (/^[\s]*[=+@-]/.test(text) && !/^-[0-9]+(?:\.[0-9]+)?$/.test(text.trim())) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const header = flat.map((col) => csvCell(col.label)).join(",");
  const lines = rows.map((row) => flat.map((col) => csvCell(row[col.key], col.key)).join(","));
  return "\uFEFF" + [header, ...lines].join("\r\n") + "\r\n";
}

export function downloadAuditCsv(title: string, columns: ColDef[], rows: TableRow[]): void {
  if (rows.length === 0) return;
  const filename = "audit-" + (title.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0,70) || "records") + ".csv";
  const blob = new Blob([buildAuditCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
