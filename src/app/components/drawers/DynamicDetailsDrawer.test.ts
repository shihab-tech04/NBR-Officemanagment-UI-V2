import { describe, expect, it } from "vitest";
import type { TableRow } from "../../pages/modulePageUtils";
import { shouldShowDetailColumn } from "./DynamicDetailsDrawer";

describe("DynamicDetailsDrawer empty-value column policy", () => {
  const row = { challan_remarks: null } as unknown as TableRow;

  it("keeps an opted-in async remarks column visible while its value is empty", () => {
    expect(shouldShowDetailColumn(
      { key: "challan_remarks", includeWhenEmpty: true },
      row,
    )).toBe(true);
  });

  it("continues hiding ordinary empty-value columns", () => {
    expect(shouldShowDetailColumn({ key: "payment_channel" }, row)).toBe(false);
  });

  it("keeps action and attachment exclusions in force for opted-in columns", () => {
    expect(shouldShowDetailColumn(
      { key: "actions", includeWhenEmpty: true },
      row,
    )).toBe(false);
    expect(shouldShowDetailColumn(
      { key: "attachments", includeWhenEmpty: true },
      row,
    )).toBe(false);
  });
});
