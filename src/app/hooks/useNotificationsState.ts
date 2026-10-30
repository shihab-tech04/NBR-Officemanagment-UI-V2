import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { getStoryNotices, getRecentStoryPayments } from "../pages/payments/story1OfficeApi";
import { readDemoNoticeState } from "../services/demoNotificationReadState";
import { getOfficeStoryNoticeReadState } from "../services/officeStoryNoticeReadState";
import { isSharedAuditMode } from "../pages/audit/auditSharedSql";
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
        if (!active) return;
        if (isSharedAuditMode()) {
          // A failed or role-denied read is shown as unverified/unread. The next
          // focus, online event, or periodic refresh retries against the officer's own rows.
          let officerReadNoticeIds: number[] = [];
          try {
            const states = await getOfficeStoryNoticeReadState(
              notices.slice(0, 100).map(notice => notice.id)
            );
            officerReadNoticeIds = states.filter(state => state.isRead).map(state => state.noticeId);
          } catch {
            // Do not fall back to tab storage or another officer's in-memory state.
          }
          if (active) dispatch(syncMirroredPaymentNotices({
            notices, payments, language, useOfficerReadState: true, officerReadNoticeIds,
          }));
          return;
        }
        dispatch(syncMirroredPaymentNotices({
          notices, payments, language, tabReadState: readDemoNoticeState(),
        }));
      } catch {
        // A failed event read cannot be interpreted as zero notices or payment success.
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
