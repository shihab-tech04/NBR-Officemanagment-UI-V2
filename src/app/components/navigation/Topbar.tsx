import { useRef, useState, useEffect, useMemo, startTransition } from "react";
import { Menu, ChevronDown, Bell, CircleHelp } from "lucide-react";
import { SearchField } from "../shared/SearchField";
import { AppSelectField } from "../forms/AppSelectField";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { useLocation, useNavigate } from "react-router";
import type { AppDispatch } from "../../store/store";
import { useSettings } from "../../hooks/useSettings";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useNotificationsState } from "../../hooks/useNotificationsState";
import { useUIState } from "../../hooks/useUI";
import { setAssessmentYear } from "../../store/settingsSlice";
import { ASSESSMENT_YEARS } from "../../data/navigation";
import { findNavigationDestinations } from "../../utils/navigationSearch";
import { AppearanceIconButton } from "../appearance/AppearanceIconButton";
import { AppearanceSettingsPanel } from "../appearance/AppearanceSettingsPanel";
import { NotificationDropdown } from "../dropdowns/NotificationDropdown";
import { UserProfileDropdown } from "../dropdowns/UserProfileDropdown";
import { useHelp } from "../../context/HelpContext";

interface TopbarProps {
  onMenuToggle: () => void;
  onSignOut: () => void;
}

export function Topbar({ onMenuToggle, onSignOut }: TopbarProps) {
  const { t: translate } = useTranslation("common");
  const { t: translateNav } = useTranslation("navigation");
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const isPaymentSampleRoute = useLocation().pathname.startsWith("/payments");

  const { assessmentYear } = useSettings();
  const currentUser = useCurrentUser();
  const { notifications, unreadCount, markRead, markAllRead } = useNotificationsState();
  const { isDesktop } = useUIState();

  const { openHelp } = useHelp();
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [appearancePanelOpen, setAppearancePanelOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [navigationQuery, setNavigationQuery] = useState("");
  const [navigationSearchOpen, setNavigationSearchOpen] = useState(false);
  const destinations = useMemo(() => findNavigationDestinations(navigationQuery, translateNav), [navigationQuery, translateNav]);

  const notificationRef = useRef<HTMLDivElement>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const navigationSearchRef = useRef<HTMLDivElement>(null);

  const openDestination = (path: string) => {
    startTransition(() => navigate(path));
    setNavigationQuery("");
    setNavigationSearchOpen(false);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationPanelOpen(false);
      }
      if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
        setAppearancePanelOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
      if (navigationSearchRef.current && !navigationSearchRef.current.contains(event.target as Node)) {
        setNavigationSearchOpen(false);
      }
    }
    if (notificationPanelOpen || appearancePanelOpen || profileDropdownOpen || navigationSearchOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [notificationPanelOpen, appearancePanelOpen, profileDropdownOpen, navigationSearchOpen]);

  return (
    <header className="topbar">
      {/* Left: menu toggle, search, assessment year */}
      <div className="topbar__left">
        <button
          onClick={onMenuToggle}
          className="topbar__icon-button"
          aria-label={translate("accessibility.toggleNavigation")}
        >
          <Menu size={18} strokeWidth={1.75} className="topbar__icon-button-icon" />
        </button>

        <div className="topbar__search-container" ref={navigationSearchRef}
          onKeyDown={event => {
            if ((event.target as HTMLElement).tagName !== 'INPUT') return;
            if (event.key === 'Escape') { setNavigationQuery(''); setNavigationSearchOpen(false); }
            if (event.key === 'Enter' && destinations.length > 0) openDestination(destinations[0].path);
          }}>
          <SearchField
            label={translate("common.searchReportsCasesTaxpayers")}
            placeholder={translate("common.searchReportsCasesTaxpayers")}
            className="topbar__search-field"
            value={navigationQuery}
            onChange={value => { setNavigationQuery(value); setNavigationSearchOpen(Boolean(value.trim())); }}
            onFocus={() => setNavigationSearchOpen(Boolean(navigationQuery.trim()))}
          />
          {navigationSearchOpen && navigationQuery.trim() && <div className="topbar__search-results" role="region" aria-label={translate('common.navigationSearchResults', 'Matching pages')}>
            {destinations.length ? destinations.map(item => <button key={item.path} type="button"
              className="topbar__search-result" onClick={() => openDestination(item.path)}>
              <span>{item.label}</span><small>{item.section}</small>
            </button>) : <p role="status" className="topbar__search-empty">{translate('common.noMatchingPages', 'No matching pages')}</p>}
          </div>}
        </div>

        {!isPaymentSampleRoute && <div className="topbar__assessment-year-wrapper">
          <AppSelectField
            id="topbar-assessment-year"
            label=""
            value={assessmentYear}
            onChange={(v) => dispatch(setAssessmentYear(v))}
            options={ASSESSMENT_YEARS.map(y => ({ value: y, label: `${translate("common.ayAbbrev")} ${y}` }))}
            compact
          />
        </div>}
      </div>

      {/* Right: notifications, appearance, user profile */}
      <div className="topbar__right">
        {/* Notification bell */}
        <div className="topbar__notification-wrapper" ref={notificationRef}>
          <button
            onClick={() => setNotificationPanelOpen((o) => !o)}
            className={`topbar__notification-button${unreadCount > 0 ? " topbar__notification-button--has-unread" : ""}`}
            aria-label={
              unreadCount > 0
                ? translate("accessibility.notificationsUnread", { count: unreadCount })
                : translate("accessibility.notifications")
            }
          >
            <Bell size={17} strokeWidth={1.75} className="topbar__notification-button-icon" />
            {unreadCount > 0 &&
              (unreadCount > 9 ? (
                <span className="topbar__notification-badge">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : (
                <span className="topbar__notification-dot" aria-hidden="true" />
              ))}
          </button>
          {notificationPanelOpen && (
            <NotificationDropdown
              notifications={notifications}
              onClose={() => setNotificationPanelOpen(false)}
              onNotificationClick={(n) => {
                markRead(n.id);
                const { main, sub, third } = n.destination;
                const path = third ? `/${main}/${sub}/${third}` : sub ? `/${main}/${sub}` : `/${main}`;
                startTransition(() => navigate(path));
                setNotificationPanelOpen(false);
              }}
              onMarkAllRead={markAllRead}
            />
          )}
        </div>

        {/* Help */}
        <button
          onClick={openHelp}
          className="topbar__icon-button"
          aria-label={translate("accessibility.helpGuide")}
          title={translate("accessibility.helpGuide")}
        >
          <CircleHelp size={17} strokeWidth={1.75} className="topbar__icon-button-icon" />
        </button>

        {/* Appearance */}
        <div className="topbar__appearance-wrapper" ref={switcherRef}>
          <AppearanceIconButton
            onClick={() => setAppearancePanelOpen((o) => !o)}
            open={appearancePanelOpen}
          />
          {appearancePanelOpen && (
            <AppearanceSettingsPanel
              onClose={() => setAppearancePanelOpen(false)}
              isMobile={!isDesktop}
            />
          )}
        </div>

        <div className="topbar__divider" aria-hidden="true" />

        {/* User profile */}
        <div className="topbar__profile-wrapper" ref={profileRef}>
          <button
            onClick={() => setProfileDropdownOpen((o) => !o)}
            className="topbar__profile-button"
            aria-label={translate("accessibility.userProfileOf", {
              name: currentUser.name,
              role: currentUser.designation,
            })}
            aria-expanded={profileDropdownOpen}
          >
            <div className="topbar__profile-avatar" aria-hidden="true">
              <span>{currentUser.shortName}</span>
            </div>
            <div className="topbar__profile-info">
              <p className="topbar__profile-name">{currentUser.name}</p>
              <p className="topbar__profile-role">{currentUser.designation}</p>
            </div>
            <ChevronDown size={11} className="topbar__profile-chevron" aria-hidden="true" />
          </button>
          {profileDropdownOpen && (
            <UserProfileDropdown
              onClose={() => setProfileDropdownOpen(false)}
              onSignOut={onSignOut}
            />
          )}
        </div>
      </div>
    </header>
  );
}
