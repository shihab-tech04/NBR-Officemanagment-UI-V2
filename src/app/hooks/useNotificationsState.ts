import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { getStoryNotices, getRecentStoryPayments } from "../pages/payments/story1OfficeApi";
import { getVerifiedOfficerStoryNotices } from "../services/officeStoryNoticePages";
import { readDemoNoticeState } from "../services/demoNotificationReadState";

import { getAuditSqlClient, isSharedAuditMode } from "../pages/audit/auditSharedSql";
import type { RootState, AppDispatch } from "../store/store";
import {
  markNotificationRead,
  markAllNotificationsRead,
  clearOfficerNoticeReadState,
  syncMirroredPaymentNotices,
  syncVerifiedOfficerCursorNotices,
} from "../store/notificationsSlice";
import type { Notification } from "../store/notificationsSlice";

export function useNotificationsState() {
  const dispatch = useDispatch<AppDispatch>();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith("bn") ? "bn" : "en";
  useEffect(() => {
    let active = true;
    let generation = 0;
    const refresh = async () => {
      const attempt = ++generation;
      try {
        if (isSharedAuditMode()) {
          // Only server-validated officer role/read receipts can authorize bell items.
          // Never fetch the old public 100-event list as an authenticated fallback.
          const feed = await getVerifiedOfficerStoryNotices();
          if (active && attempt === generation)
            dispatch(syncVerifiedOfficerCursorNotices({ ...feed, language }));
          return;
        }
        const [notices,payments] = await Promise.all([getStoryNotices(),getRecentStoryPayments()]);
        if (active && attempt === generation)
          dispatch(syncMirroredPaymentNotices({
            notices, payments, language, tabReadState: readDemoNoticeState(),
          }));
      } catch {
        // Keep last verified snapshot on network errors. On sign-out/account switch,
        // clearOfficerNoticeReadState removes old private rows immediately.
      }
    };
    void refresh();
    let authSubscription: { unsubscribe: () => void } | null = null;
    if (isSharedAuditMode()) {
      try {
        authSubscription = getAuditSqlClient().auth.onAuthStateChange(event => {
          if (!active || !["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
          generation++;
          dispatch(clearOfficerNoticeReadState());
          window.setTimeout(() => { if (active) void refresh(); }, 0);
        }).data.subscription;
      } catch {
        // The next visibility, focus, online, or timer refresh retries the authenticated read.
      }
    }
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
      generation++;
      authSubscription?.unsubscribe();
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
