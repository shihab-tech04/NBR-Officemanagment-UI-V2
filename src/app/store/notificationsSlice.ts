import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { MOCK_NOTIFICATIONS } from "../data/mockData";
import type { Notification, NotificationType, NotificationPriority } from "../data/mockData";
import type { StoryNotice, StoryPayment } from "../pages/payments/story1OfficeApi";
import type { DemoNoticeReadState } from "../services/demoNotificationReadState";

// Re-export notification types for convenience
export type { Notification, NotificationType, NotificationPriority };

// ── State ─────────────────────────────────────────────────────────────────────
interface NotificationsState {
  items: Notification[];
  // Timestamp of the last mark-all-read action; closes races with delayed SQL fetches.
  readThroughMs: number | null;
  readStateMode: "demo" | "officer";
  readStateOfficerUid: string | null;
}

const initialState: NotificationsState = {
  // Payment notices must come from mirrored SQL, not the old fictional payment fixture.
  items: MOCK_NOTIFICATIONS.filter(notice => notice.type !== "payment"),
  readThroughMs: null,
  readStateMode: "demo",
  readStateOfficerUid: null,
};

// ── Slice ─────────────────────────────────────────────────────────────────────
const notificationsSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    markNotificationRead(state, action: PayloadAction<string>) {
      const item = state.items.find((n) => n.id === action.payload);
      if (item) item.isRead = true;
    },
    markAllNotificationsRead(state) {
      state.items.forEach((n) => { n.isRead = true; });
      state.readThroughMs = Date.now();
    },
    markOfficerNotificationRead(state, action: PayloadAction<{ id: string; officerUid: string }>) {
      if (state.readStateMode !== "officer" || state.readStateOfficerUid !== action.payload.officerUid) return;
      const item = state.items.find((n) => n.id === action.payload.id);
      if (item) item.isRead = true;
    },
    syncMirroredPaymentNotices(state, action: PayloadAction<{ notices: StoryNotice[]; payments: StoryPayment[]; language: "en" | "bn"; tabReadState?: DemoNoticeReadState; useOfficerReadState?: boolean; officerReadNoticeIds?: number[]; officerUid?: string | null }>) {
      // SQL creates exactly one notice per mirrored simulated payment. Never
      // infer an official settled payment, or create a notice from a UI click.
      const nextReadStateMode = action.payload.useOfficerReadState ? "officer" : "demo";
      const nextOfficerUid = action.payload.useOfficerReadState ? action.payload.officerUid ?? null : null;
      const canReusePreviousRead = state.readStateMode === nextReadStateMode &&
        (nextReadStateMode === "demo" || state.readStateOfficerUid === nextOfficerUid);
      const previousRead = canReusePreviousRead
        ? new Map(state.items.map(notice => [notice.id, notice.isRead]))
        : new Map<string, boolean>();
      state.readStateMode = nextReadStateMode;
      state.readStateOfficerUid = nextOfficerUid;
      const seen = new Set<string>();
      const bn = action.payload.language === "bn";
      const saved = action.payload.tabReadState;
      const savedIds = new Set(saved?.ids ?? []);
      const officerReadIds = new Set(action.payload.officerReadNoticeIds ?? []);
      const readThrough = Math.max(state.readThroughMs ?? 0, saved?.readThroughMs ?? 0);
      const mirrored: Notification[] = [];
      // A notice alone contains no amount. Resolve it only against an exact
      // matching stored SQL transaction; a missing/invalid amount fails closed.
      const paymentById = new Map(action.payload.payments.map(payment=>[payment.id,payment]));
      for (const event of action.payload.notices.slice(0, 100)) {
        if (event.type !== "NEW_SIMULATED_PAYMENT" || !Number.isSafeInteger(event.id) || event.id <= 0 ||
            !/^[0-9a-f-]{36}$/i.test(event.paymentId) || !Number.isFinite(Date.parse(event.createdAt))) continue;
        const id = `sql-payment-${event.id}`;
        const payment = paymentById.get(event.paymentId);
        if (!payment || payment.status !== "SIMULATED_SUCCESS" ||
            !Number.isSafeInteger(payment.amountMinor) || payment.amountMinor <= 0) continue;
        if (seen.has(id)) continue;
        const taka = Math.floor(payment.amountMinor / 100);
        const poisha = String(payment.amountMinor % 100).padStart(2,"0");
        const amount = `৳${new Intl.NumberFormat("en-BD").format(taka)}.${poisha}`;
        seen.add(id);
        mirrored.push({
          id, type: "payment", priority: "medium",
          title: bn ? "নতুন পেমেন্ট রেকর্ড" : "New payment record",
          message: bn ? `পেমেন্টের পরিমাণ ${amount}। TaxPay থেকে অফিসে সংরক্ষিত হয়েছে। সরকারি নিষ্পত্তি নিশ্চিত হয়নি।`
                      : `Payment amount ${amount} recorded in Office. No government settlement is confirmed.`,
          module: bn ? "পেমেন্টস" : "Payments",
          time: new Date(event.createdAt).toLocaleString(bn ? "bn-BD" : "en-GB"),
          isRead: action.payload.useOfficerReadState
            ? officerReadIds.has(event.id)
            : previousRead.get(id) ?? (savedIds.has(id) || (readThrough > 0 && Date.parse(event.createdAt) <= readThrough)),
          targetPaymentId: event.paymentId,
          targetNoticeId: event.id,
          destination: { main: "payments", sub: "transactions" },
        });
      }
      state.items = [...mirrored, ...state.items.filter(notice => notice.type !== "payment" && !notice.id.startsWith("sql-payment-"))];
    },
    setNotifications(state, action: PayloadAction<Notification[]>) {
      state.items = action.payload;
    },
  },
});

export const {
  markNotificationRead,
  markAllNotificationsRead,
  markOfficerNotificationRead,
  syncMirroredPaymentNotices,
  setNotifications,
} = notificationsSlice.actions;

export default notificationsSlice.reducer;
