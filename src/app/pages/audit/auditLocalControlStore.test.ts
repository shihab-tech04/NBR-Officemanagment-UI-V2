// @vitest-environment jsdom
import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { ALL_TAXPAYER_ROWS } from "./auditData";
import { getSourceAuditControls, saveLocalAuditControl, getLocalAuditControlEvents,
  getLocalControlOptions } from "./auditLocalControlStore";
import { getAuditCandidates } from "./auditCandidateStore";
import { getAuditYearScope } from "./auditYearScope";

describe("Audit F0–F5 control review source and persistence", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { vi.restoreAllMocks();localStorage.clear(); });
  it("uses the flagged taxpayers, never unrelated control return identities", () => {
    const rows = getSourceAuditControls("2025-26");
    const ids = new Set(ALL_TAXPAYER_ROWS.map((row) => String(row.return_id)));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => ids.has(String(row.return_id)))).toBe(true);
    expect(rows.every((row) => String(row.id) === row.return_id + "|" + row.flag_id)).toBe(true);
    expect(new Set(rows.map((row) => row.flag_id))).toEqual(new Set(["F0","F1","F2","F3","F4","F5"]));
  });
  it("persists decisions and shows matching Audit Trail events", () => {
    const row = getSourceAuditControls("2025-26")[0];
    saveLocalAuditControl(String(row.id),"In Progress","Checked source values and opened a discrepancy review");
    expect(getSourceAuditControls("2025-26").find((item) => item.id === row.id)?.control_status).toBe("In Progress");
    saveLocalAuditControl(String(row.id),"Resolved","Reconciled return and statement values for this control");
    expect(getSourceAuditControls("2025-26").find((item) => item.id === row.id)?.control_status).toBe("Resolved");
    const events = getLocalAuditControlEvents("2025-26");
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.return_id === row.return_id)).toBe(true);
    expect(getAuditYearScope("2025-26",getAuditCandidates()).trailRows.some((event) =>
      String(event.action).includes("Control") && event.assessment_year === "2025-26")).toBe(true);
  });
  it("prevents invalid, repeated, unrelated and note-free decisions", () => {
    const row = getSourceAuditControls("2025-26")[0];
    expect(getLocalControlOptions("Pending")).not.toContain("Resolved");
    expect(() => saveLocalAuditControl(String(row.id),"Resolved","Review ready for closure"))
      .toThrow("Invalid");
    expect(() => saveLocalAuditControl(String(row.id),"In Progress","short")).toThrow("10–500");
    expect(() => saveLocalAuditControl("UNKNOWN|F1","In Progress","Review of invalid return record"))
      .toThrow("does not belong");
    saveLocalAuditControl(String(row.id),"In Progress","Begin reviewing the flagged control value");
    expect(() => saveLocalAuditControl(String(row.id),"In Progress","Repeated review should not save"))
      .toThrow("Invalid");
  });
  it("does not leak one assessment year's control review into another", () => {
    const row = getSourceAuditControls("2025-26")[0];
    saveLocalAuditControl(String(row.id),"Under Review","Checking the source document against return values");
    expect(getLocalAuditControlEvents("2024-25")).toHaveLength(0);
    expect(getSourceAuditControls("2024-25")).toHaveLength(0);
  });
  it("rolls back a failed write without claiming persistence", () => {
    const row = getSourceAuditControls("2025-26")[0];
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype,"setItem").mockImplementation(function(key:string,value:string) {
      if (key === "nbr-audit-local-control-reviews-v1") throw Error("storage quota");
      return original.call(this,key,value);
    });
    expect(() => saveLocalAuditControl(String(row.id),"In Progress",
      "Source values are still under verification")).toThrow("could not be saved");
    expect(getSourceAuditControls("2025-26").find((item) => item.id === row.id)?.control_status).toBe("Pending");
  });
});
