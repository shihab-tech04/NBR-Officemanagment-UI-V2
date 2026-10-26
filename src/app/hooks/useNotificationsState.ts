import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { getStoryNotices, getRecentStoryPayments } from "../pages/payments/story1OfficeApi";
import type { RootState, AppDispatch } from "../store/store";
import {
  markNotificationRead,
  markAllNotificationsRead,
  syncMirroredPaymentNotices,
} from "../store/notificationsSlice";
import type { Notification } from "../store/notificationsSlice";

export function useNotificationsState() {
  const dispatch = useDispatch<AppDispatch>();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith("bn") ? "bn" : "en";
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const [notices, payments] = await Promise.all([getStoryNotices(), getRecentStoryPayments()]);
        if (active) dispatch(syncMirroredPaymentNotices({ notices, payments, language }));
      } catch {
        // A failed read cannot be interpreted as zero notices or as payment success.
        // Retain the last verified event snapshot until the next successful fetch.
      }
    };
    void refresh();
    // Browser timers are throttled in background tabs. Refresh on return to the
    // Office instead of requiring a full reload or a fresh payment submission.
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const onFocus = () => void refresh();
    const onOnline = () => void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 7000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [dispatch, language]);
  const items = useSelector((state: RootState) => state.notifications.items);
  const unreadCount = items.filter((n) => !n.isRead).length;

  return {
    notifications: items as Notification[],
    unreadCount,
    markRead: (id: string) => dispatch(markNotificationRead(id)),
    markAllRead: () => dispatch(markAllNotificationsRead()),
  };
}
