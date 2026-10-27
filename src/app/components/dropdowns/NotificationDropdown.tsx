import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BellDot, BadgeCheck, CheckCircle, UserCheck, FilePen, Receipt,
  UserCog, Shield, Info, X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  Notification,
  NotificationType,
  NotificationPriority,
} from "../../store/notificationsSlice";
import { useUIState } from "../../hooks/useUI";
import { useOverlayScrollLock } from "../../hooks/useOverlayScrollLock";

type LucideIcon = React.ComponentType<{
  size?: number; strokeWidth?: number; className?: string;
}>;

interface NotificationDropdownProps {
  notifications: Notification[];
  onClose: () => void;
  onNotificationClick: (notification: Notification) => void;
  onMarkAllRead: () => void;
  onViewAllPayments?: () => void;
  forceBottomSheet?: boolean;
}

function getNotificationIcon(type: NotificationType): LucideIcon {
  switch (type) {
    case "approval": return BadgeCheck;
    case "status": return CheckCircle;
    case "assignment": return UserCheck;
    case "correction": return FilePen;
    case "payment": return Receipt;
    case "user-role": return UserCog;
    case "security": return Shield;
    case "system": return Info;
  }
}

export function NotificationDropdown({
  notifications, onClose, onNotificationClick, onMarkAllRead, onViewAllPayments, forceBottomSheet = false,
}: NotificationDropdownProps) {
  const { t: translate } = useTranslation("notifications");
  const { t: translateCommon } = useTranslation("common");
  const { isDesktop } = useUIState();
  const isMobile = forceBottomSheet || !isDesktop;
  const unreadCount = notifications.filter(n => !n.isRead).length;
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useOverlayScrollLock(isMobile);

  useEffect(() => {
    if (!isMobile) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const buttons = Array.from(sheetRef.current.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      if (!buttons.length) return;
      if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault();
        buttons[buttons.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
        event.preventDefault();
        buttons[0].focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isMobile]);

  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === "all") return true;
    if (activeFilter === "unread") return !n.isRead;
    if (activeFilter === "approvals") return n.type === "approval";
    if (activeFilter === "assigned") return n.type === "assignment";
    if (activeFilter === "security") return n.type === "security";
    return true;
  });

  const filters = [
    { id: "all", label: translate("filters.all") },
    { id: "unread", label: translate("filters.unread") },
    { id: "approvals", label: translate("filters.approvals") },
    { id: "assigned", label: translate("filters.assigned") },
    { id: "security", label: translate("filters.security") },
  ];

  const dropdownContent = (
    <div
      ref={sheetRef}
      className={isMobile ? "notification-dropdown notification-dropdown--bottom-sheet" : "notification-dropdown dropdown-enter"}
      role={isMobile ? "dialog" : undefined}
      aria-modal={isMobile ? true : undefined}
      aria-labelledby={isMobile ? "office-notification-sheet-title" : undefined}
    >
      {/* Header */}
      <div className="notification-dropdown__header">
        <div className="notification-dropdown__header-left">
          <h3 id="office-notification-sheet-title" className="notification-dropdown__title">{translate("title")}</h3>
          {unreadCount > 0 && (
            <span className="notification-dropdown__unread-badge">
              {unreadCount} {translate("new")}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={onMarkAllRead} className="notification-dropdown__mark-read">
            {translate("markAllAsRead")}
          </button>
        )}
        {isMobile && (
          <button
            ref={closeRef}
            onClick={onClose}
            className="mobile-modal-close notification-dropdown__close"
            aria-label={translateCommon("accessibility.closeNotifications")}
          >
            <X size={20} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="notification-dropdown__filters">
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setActiveFilter(filter.id)}
            className={`notification-dropdown__filter-chip${activeFilter === filter.id ? " notification-dropdown__filter-chip--active" : ""}`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="notification-dropdown__list">
        {filteredNotifications.length === 0 ? (
          <div className="notification-dropdown__empty">
            <div className="notification-dropdown__empty-icon">
              <BellDot size={20} strokeWidth={1.75} />
            </div>
            <h4 className="notification-dropdown__empty-title">{translate("empty.title")}</h4>
            <p className="notification-dropdown__empty-text">{translate("allCaughtUp")}</p>
          </div>
        ) : (
          filteredNotifications.map((notification) => {
            const Icon = getNotificationIcon(notification.type);
            return (
              <button
                key={notification.id}
                onClick={() => onNotificationClick(notification)}
                className={`notification-dropdown__item${notification.isRead ? "" : " notification-dropdown__item--unread"}`}
              >
                <div className="notification-dropdown__item-icon">
                  <Icon size={16} strokeWidth={1.75} />
                </div>
                <div className="notification-dropdown__item-content">
                  <div className="notification-dropdown__item-header">
                    <h4 className={`notification-dropdown__item-title${notification.isRead ? "" : " notification-dropdown__item-title--unread"}`}>
                      {notification.title}
                    </h4>
                    {!notification.isRead && (
                      <span className="notification-dropdown__item-unread-dot" aria-hidden="true" />
                    )}
                  </div>
                  <p className="notification-dropdown__item-message">{notification.message}</p>
                  <div className="notification-dropdown__item-meta">
                    <span>{notification.module}</span>
                    <span aria-hidden="true">·</span>
                    <span>{notification.time}</span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      {onViewAllPayments && notifications.some(n => n.type === "payment") && (
        <div className="notification-dropdown__footer">
          <button type="button" onClick={onViewAllPayments} className="notification-dropdown__see-all">
            {translate("viewAllPaymentRecords")}
          </button>
        </div>
      )}
    </div>
  );

  // On mobile, render in portal with backdrop; on desktop, render inline
  if (isMobile && typeof document !== "undefined") {
    return createPortal(
      <>
        <div
          className="mobile-modal-backdrop notification-dropdown__backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
        {dropdownContent}
      </>,
      document.body
    );
  }

  return dropdownContent;
}

// Re-export types from the canonical source for backwards compat
export type { Notification, NotificationType, NotificationPriority } from "../../store/notificationsSlice";
