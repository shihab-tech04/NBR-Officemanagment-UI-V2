import { describe, expect, it } from "vitest";
import reducer, { markNotificationRead, markAllNotificationsRead, syncMirroredPaymentNotices } from "../notificationsSlice";

const paymentId = "33333333-3333-4333-8333-333333333333";
const first = { id: 91, paymentId, type: "NEW_SIMULATED_PAYMENT", createdAt: "2026-10-25T04:00:00Z" };

describe("Office SQL-backed payment bell", () => {
  it("never treats the old hardcoded payment fixture as a real notification", () => {
    const state = reducer(undefined, { type: "@@init" });
    expect(state.items.find(item => item.type === "payment")).toBeUndefined();
  });
  it("shows a mirrored SQL event exactly once with the Payments destination", () => {
    const state = reducer(undefined, syncMirroredPaymentNotices({ notices: [first, first], language: "en" }));
    const rows = state.items.filter(item => item.type === "payment");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "sql-payment-91", isRead: false, destination: { main: "payments", sub: "transactions" } });
    expect(rows[0].message).toContain("No government settlement is confirmed");
    expect(rows[0].message).not.toContain("Tax credit posted");
  });
  it("preserves a read event when the feed refreshes or the language changes", () => {
    const state = reducer(undefined, syncMirroredPaymentNotices({ notices: [first], language: "en" }));
    const viewed = reducer(state, markNotificationRead("sql-payment-91"));
    const updated = reducer(viewed, syncMirroredPaymentNotices({ notices: [first], language: "bn" }));
    expect(updated.items.find(item => item.id === "sql-payment-91")).toMatchObject({ isRead: true, module: "পেমেন্টস" });
  });
  it("rejects invented statuses, malformed payment IDs and invalid dates", () => {
    const events = [
      { ...first, id: 92, type: "PAYMENT_SETTLED" },
      { ...first, id: 93, paymentId: "not-an-uuid" },
      { ...first, id: 94, createdAt: "not-a-date" }
    ];
    const state = reducer(undefined, syncMirroredPaymentNotices({ notices: events, language: "en" }));
    expect(state.items.some(item => item.type === "payment")).toBe(false);
  });
  it("does not reintroduce old unread events when a delayed SQL response follows mark-all-read", () => {
    const original = reducer(undefined, syncMirroredPaymentNotices({ notices: [first], language: "en" }));
    const viewed = reducer(original, markAllNotificationsRead());
    const late = reducer(viewed, syncMirroredPaymentNotices({
      notices: [{ ...first, id: 95, createdAt: "2026-10-24T02:00:00Z" }, first], language: "en"
    }));
    expect(late.items.filter(item => item.type === "payment" && !item.isRead)).toHaveLength(0);
  });

});
