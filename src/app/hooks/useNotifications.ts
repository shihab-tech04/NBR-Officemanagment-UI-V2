import { useCallback, startTransition } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { AppDispatch } from "../store/store";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "../store/notificationsSlice";
import { useNotificationsState } from "./useNotificationsState";
import type { Notification } from "../store/notificationsSlice";
import { markDemoNoticeViewed, markAllDemoNoticesViewed } from "../services/demoNotificationReadState";
import { setOfficeStoryNoticeRead } from "../services/officeStoryNoticeReadState";
import { isSharedAuditMode } from "../pages/audit/auditSharedSql";

// Re-export for backwards compat
export type { Notification };

const paymentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route a mirrored payment notice to its exact SQL-backed detail record. */
export function notificationTargetPath(notification: Notification): string {
  const paymentId = notification.type === "payment" ? notification.targetPaymentId : undefined;
  if (paymentId && paymentIdPattern.test(paymentId)) {
    return `/payments/transactions/record/${encodeURIComponent(paymentId)}`;
  }
  const { main, sub, third } = notification.destination;
  return third ? `/${main}/${sub}/${third}` : sub ? `/${main}/${sub}` : `/${main}`;
}

export function useNotifications(
  _onNavigate?: (destination: { main: string; sub?: string; third?: string }) => void
) {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { t } = useTranslation("notifications");
  const { notifications, unreadCount } = useNotificationsState();

  const handleNotificationClick = useCallback(
    (notification: Notification) => {
      if (notification.type !== "payment") {
        dispatch(markNotificationRead(notification.id));
      } else if (isSharedAuditMode()) {
        if (Number.isSafeInteger(notification.targetNoticeId) && notification.targetNoticeId! > 0) {
          void setOfficeStoryNoticeRead(notification.targetNoticeId!, true)
            .then(() => dispatch(markNotificationRead(notification.id)))
            .catch(() => {
              toast.error(t("readStateSaveFailed"));
            });
        } else {
          toast.error(t("readStateSaveFailed"));
        }
      } else {
        markDemoNoticeViewed(notification.id);
        dispatch(markNotificationRead(notification.id));
      }
      startTransition(() => navigate(notificationTargetPath(notification)));
    },
    [dispatch, navigate, t]
  );

  const handleMarkAllRead = useCallback(() => {
    if (!isSharedAuditMode()) {
      markAllDemoNoticesViewed(notifications.filter(n => n.type === "payment").map(n => n.id));
      dispatch(markAllNotificationsRead());
      return;
    }

    const paymentNotices = notifications.filter(n => n.type === "payment");
    const otherNotifications = notifications.filter(n => n.type !== "payment");
    for (const notification of otherNotifications) {
      dispatch(markNotificationRead(notification.id));
    }
    const receiptable = paymentNotices.filter(
      notification => Number.isSafeInteger(notification.targetNoticeId) && notification.targetNoticeId! > 0
    );
    void Promise.allSettled(receiptable.map(async notification => {
      await setOfficeStoryNoticeRead(notification.targetNoticeId!, true);
      dispatch(markNotificationRead(notification.id));
    })).then(results => {
      if (receiptable.length !== paymentNotices.length || results.some(result => result.status === "rejected")) {
        toast.error(t("readStateSaveFailed"));
      }
    });
  }, [dispatch, notifications, t]);

  return {
    notifications,
    unreadCount,
    handleNotificationClick,
    handleMarkAllRead,
  };
}
