import { describe, expect, it } from "vitest";
import reducer, { markNotificationRead, markAllNotificationsRead, syncMirroredPaymentNotices } from "../notificationsSlice";
import type { StoryPayment } from "../../pages/payments/story1OfficeApi";
import { notificationTargetPath } from "../../hooks/useNotifications";

const paymentId = "33333333-3333-4333-8333-333333333333";
const first = { id: 91, paymentId, type: "NEW_SIMULATED_PAYMENT", createdAt: "2026-10-25T04:00:00Z" };
const payment: StoryPayment = {
  id: paymentId, service: "TAX_WITH_RETURN", amountMinor: 125050, status: "SIMULATED_SUCCESS",
  createdAt: "2026-10-25T04:00:00Z"
};
const sync = (notices: typeof first[], payments: StoryPayment[] = [payment], language: "en"|"bn" = "en") =>
  syncMirroredPaymentNotices({notices,payments,language});

describe("Office SQL-backed payment bell", () => {
  it("does not treat hardcoded sample payments as SQL notifications", () => {
    const state = reducer(undefined, { type: "@@init" });
    expect(state.items.find(item => item.type === "payment")).toBeUndefined();
  });
  it("shows exactly the persisted amount once without claiming funds moved", () => {
    const state = reducer(undefined, sync([first, first]));
    const rows = state.items.filter(item => item.type === "payment");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "sql-payment-91", isRead: false,
      targetPaymentId: paymentId,
      destination: { main: "payments", sub: "transactions" } });
    expect(notificationTargetPath(rows[0])).toBe(`/payments/transactions/record/${paymentId}`);
    expect(rows[0].message).toContain("৳1,250.50");
    expect(rows[0].message).toContain("No government settlement is confirmed");
    expect(rows[0].message).not.toContain("Tax credit posted");
  });
  it("fails closed to the transactions list for an invalid payment deep-link ID", () => {
    const notice = reducer(undefined, sync([first])).items.find(item => item.type === "payment")!;
    expect(notificationTargetPath({ ...notice, targetPaymentId: "not-a-payment-id" }))
      .toBe("/payments/transactions");
  });
  it("preserves a viewed notice on refresh/language change and retains the actual amount", () => {
    const state = reducer(undefined, sync([first]));
    const viewed = reducer(state, markNotificationRead("sql-payment-91"));
    const updated = reducer(viewed, sync([first], [payment], "bn"));
    const notice = updated.items.find(item => item.id === "sql-payment-91");
    expect(notice).toMatchObject({ isRead: true, module: "পেমেন্টস" });
    expect(notice?.message).toContain("৳1,250.50");
  });
  it("fails closed on missing transaction, negative, fractional, or unsafe minor-unit amounts", () => {
    const invalid: StoryPayment[] = [
      {...payment, id: "77777777-7777-4777-8777-777777777777"},
      {...payment, amountMinor:-100},
      {...payment, amountMinor:0},
      {...payment, amountMinor:125.5},
      {...payment, amountMinor:Number.MAX_SAFE_INTEGER+1},
      {...payment, status:"PENDING"}
    ];
    for(const row of invalid) {
      const state = reducer(undefined, sync([first], [row]));
      expect(state.items.some(item=>item.type==="payment")).toBe(false);
    }
    expect(reducer(undefined, sync([first], [])).items.some(item=>item.type==="payment")).toBe(false);
  });
  it("filters fake settled events, malformed payment IDs and dates", () => {
    const events = [
      { ...first, id: 92, type: "PAYMENT_SETTLED" },
      { ...first, id: 93, paymentId: "not-an-uuid" },
      { ...first, id: 94, createdAt: "not-a-date" }
    ];
    const state = reducer(undefined, sync(events));
    expect(state.items.some(item => item.type === "payment")).toBe(false);
  });
  it("does not resurrect old unread events during a delayed SQL response", () => {
    const original = reducer(undefined, sync([first]));
    const viewed = reducer(original, markAllNotificationsRead());
    const late = reducer(viewed, sync([{...first,id:95,createdAt:"2026-10-24T02:00:00Z"},first]));
    expect(late.items.filter(item => item.type === "payment" && !item.isRead)).toHaveLength(0);
  });
});
