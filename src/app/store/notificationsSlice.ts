import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { MOCK_NOTIFICATIONS } from "../data/mockData";
import type { Notification, NotificationType, NotificationPriority } from "../data/mockData";
import type { StoryNotice } from "../pages/payments/story1OfficeApi";

// Re-export notification types for convenience
export type { Notification, NotificationType, NotificationPriority };

// ── State ─────────────────────────────────────────────────────────────────────
interface NotificationsState {
  items: Notification[];
  // Timestamp of the last mark-all-read action; closes races with delayed SQL fetches.
  readThroughMs: number | null;
}

const initialState: NotificationsState = {
  // Payment notices must come from mirrored SQL, not the old fictional payment fixture.
  items: MOCK_NOTIFICATIONS.filter(notice => notice.type !== "payment"),
  readThroughMs: null,
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
    syncMirroredPaymentNotices(state, action: PayloadAction<{ notices: StoryNotice[]; language: "en" | "bn" }>) {
      // SQL creates exactly one notice per mirrored simulated payment. Never
      // infer an official settled payment, or create a notice from a UI click.
      const previousRead = new Map(state.items.map(notice => [notice.id, notice.isRead]));
      const seen = new Set<string>();
      const bn = action.payload.language === "bn";
      const mirrored: Notification[] = [];
      for (const event of action.payload.notices.slice(0, 100)) {
        if (event.type !== "NEW_SIMULATED_PAYMENT" || !Number.isSafeInteger(event.id) || event.id <= 0 ||
            !/^[0-9a-f-]{36}$/i.test(event.paymentId) || !Number.isFinite(Date.parse(event.createdAt))) continue;
        const id = `sql-payment-${event.id}`;
        if (seen.has(id)) continue;
        seen.add(id);
        mirrored.push({
          id, type: "payment", priority: "medium",
          title: bn ? "নতুন পেমেন্ট রেকর্ড" : "New payment record",
          message: bn ? "TaxPay থেকে পেমেন্ট সিমুলেশনের তথ্য অফিসে সংরক্ষিত হয়েছে। কোনো সরকারি অর্থ পরিশোধ নিশ্চিত হয়নি।"
                      : "TaxPay payment simulation recorded in Office. No government settlement is confirmed.",
          module: bn ? "পেমেন্টস" : "Payments",
          time: new Date(event.createdAt).toLocaleString(bn ? "bn-BD" : "en-GB"),
          isRead: previousRead.get(id) ?? (state.readThroughMs !== null && Date.parse(event.createdAt) <= state.readThroughMs),
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
  syncMirroredPaymentNotices,
  setNotifications,
} = notificationsSlice.actions;

export default notificationsSlice.reducer;
