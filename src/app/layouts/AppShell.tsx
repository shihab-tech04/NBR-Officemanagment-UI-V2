import { useEffect } from "react";
import { preloadAllRoutes } from "../routes";
import { useTranslation } from "react-i18next";
import { useSettings } from "../hooks/useSettings";
import { FONTS } from "../data/fonts";
import { useNavigation } from "../hooks/useNavigation";
import { useUIState, useUIDispatch } from "../hooks/useUI";
import { MuiProvider } from "../components/ui/MuiProvider";
import { SidebarShell } from "./SidebarShell";
import { MainShell } from "./MainShell";
import { MobileBackdrop } from "./MobileBackdrop";
export function AppShell() {
  const { t: translate } = useTranslation("common");

  const { fontId } = useSettings();
  const fontFamily = FONTS[fontId].family;
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
      />
    </div>
    </MuiProvider>
  );
}
