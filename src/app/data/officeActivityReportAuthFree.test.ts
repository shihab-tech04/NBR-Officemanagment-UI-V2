import { describe, expect, it } from "vitest";
import { REPORT_CFGS } from "./modulePageConfigs";

describe("Office prototype activity report initializes without authentication telemetry", () => {
  it("constructs every demo row without the deleted login-duration variables", () => {
    const report = REPORT_CFGS["user-activity-report"];
    expect(report).toBeDefined();
    expect(report.rows).toHaveLength(16);
    expect(report.rows.every(row => typeof row.last_activity_time === "string")).toBe(true);
  });

  it("does not expose fictional sign-in, password or device telemetry", () => {
    const report = REPORT_CFGS["user-activity-report"];
    const exposed = JSON.stringify({
      columns: report.cols,
      drawer: report.drawerCols,
      rows: report.rows,
    });
    for (const removed of [
      "last_login", "last_pass_change", "login_location", "login_ip",
      "login_status", "session_duration", "failed_login_attempts",
      "password_change_count", "device_browser",
    ]) {
      expect(exposed).not.toContain(removed);
    }
  });
});
