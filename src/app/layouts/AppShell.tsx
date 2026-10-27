import { useEffect, useState } from "react";
import { preloadAllRoutes } from "../routes";
import { useTranslation } from "react-i18next";
import { useSettings } from "../hooks/useSettings";
import { resolveFontFamily } from "../data/fonts";
import { useNavigation } from "../hooks/useNavigation";
import { useUIState, useUIDispatch } from "../hooks/useUI";
import { MuiProvider } from "../components/ui/MuiProvider";
import { SidebarShell } from "./SidebarShell";
import { MainShell } from "./MainShell";
import { MobileBackdrop } from "./MobileBackdrop";
import { SignOutModal } from "../components/modals/SignOutModal";

export function AppShell({ onSignedOut }: { onSignedOut: () => void }) {
  const [signOutOpen, setSignOutOpen] = useState(false);
  const { t: translate } = useTranslation("common");

  const { fontId, languageId } = useSettings();
  const fontFamily = resolveFontFamily(fontId, languageId);
  const { mobileDrawerOpen } = useUIState();
  const { setMobileDrawerOpen } = useUIDispatch();

  const {
    handleLogoClick,
    handleMainNavClick,
    handleSubNavClick,
    handleThirdNavClick,
    handleMenuToggle,
  } = useNavigation();

  // Warm all route chunks in the background so first-click navigation is instant
  useEffect(() => { preloadAllRoutes(); }, []);

  const handleConfirmSignOut = () => {
    setSignOutOpen(false);
    onSignedOut();
  };

  return (
    <MuiProvider>
    <div className="app-shell" style={{ fontFamily }}>
      <a href="#main-content" className="skip-link">
        {translate("accessibility.skipToMainContent")}
      </a>

      <MobileBackdrop
        isOpen={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
      />

      <SidebarShell
        onLogoClick={handleLogoClick}
        onMainNavClick={handleMainNavClick}
        onSubNavClick={handleSubNavClick}
        onThirdNavClick={handleThirdNavClick}
      />

      <MainShell
        onMenuToggle={handleMenuToggle}
        onSignOut={() => setSignOutOpen(true)}
      />
      {signOutOpen && <SignOutModal onConfirm={handleConfirmSignOut} onCancel={() => setSignOutOpen(false)} />}
    </div>
    </MuiProvider>
  );
}
