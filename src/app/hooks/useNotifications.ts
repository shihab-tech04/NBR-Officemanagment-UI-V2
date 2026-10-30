import { useCallback, startTransition } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router";
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
              // Leave it unread so another click or the next refresh retries the receipt.
            });
        }
      } else {
        markDemoNoticeViewed(notification.id);
        dispatch(markNotificationRead(notification.id));
      }
      startTransition(() => navigate(notificationTargetPath(notification)));
    },
    [dispatch, navigate]
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
    }));
  }, [dispatch, notifications]);

  return {
    notifications,
    unreadCount,
    handleNotificationClick,
    handleMarkAllRead,
  };
}
