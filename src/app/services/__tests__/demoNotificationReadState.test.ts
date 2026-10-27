import { describe, expect, it } from "vitest";
import { markAllDemoNoticesViewed, markDemoNoticeViewed, readDemoNoticeState } from "../demoNotificationReadState";

function browserTab() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); }
  };
}
describe("session-only public Office demo payment notices", () => {
  it("keeps the selected event read after a simulated reload in the same tab", () => {
    const firstTab = browserTab();
    markDemoNoticeViewed("sql-payment-410", firstTab);
    expect(readDemoNoticeState(firstTab)).toMatchObject({ ids: ["sql-payment-410"], readThroughMs: null });
    expect(readDemoNoticeState(browserTab()).ids).toEqual([]);
  });
  it("marks older SQL demo events viewed without hiding later ones", () => {
    const firstTab = browserTab();
    markAllDemoNoticesViewed(["sql-payment-410", "sql-payment-411", "private-123"], 1793090000000, firstTab);
    expect(readDemoNoticeState(firstTab)).toEqual({
      ids: ["sql-payment-410", "sql-payment-411"], readThroughMs: 1793090000000
    });
  });
  it("rejects unverified IDs, invalid JSON, or oversized snapshots", () => {
    const tab = browserTab();
    markDemoNoticeViewed("office-private-123", tab);
    markDemoNoticeViewed("sql-payment-0", tab);
    expect(readDemoNoticeState(tab).ids).toEqual([]);
    tab.setItem("office-demo-notice-read-v1", '{"ids":["sql-payment-22","evil"],"readThroughMs":-1}');
    expect(readDemoNoticeState(tab)).toEqual({ ids:["sql-payment-22"],readThroughMs:null });
    tab.setItem("office-demo-notice-read-v1", "z".repeat(20001));
    expect(readDemoNoticeState(tab).ids).toEqual([]);
  });
  it("caps the public session cache to recent 100 event identifiers", () => {
    const tab = browserTab();
    markAllDemoNoticesViewed(Array.from({length: 140}, (_, i) => "sql-payment-" + (i+1)), 100, tab);
    expect(readDemoNoticeState(tab).ids).toHaveLength(100);
    expect(readDemoNoticeState(tab).ids[0]).toBe("sql-payment-41");
  });
});
