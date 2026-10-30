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
      if (notification.type === "payment") markDemoNoticeViewed(notification.id);
      dispatch(markNotificationRead(notification.id));
      startTransition(() => navigate(notificationTargetPath(notification)));
    },
    [dispatch, navigate]
  );

  const handleMarkAllRead = useCallback(() => {
    markAllDemoNoticesViewed(notifications.filter(n => n.type === "payment").map(n => n.id));
    dispatch(markAllNotificationsRead());
  }, [dispatch, notifications]);

  return {
    notifications,
    unreadCount,
    handleNotificationClick,
    handleMarkAllRead,
  };
}
