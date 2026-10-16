import { Topbar } from "../components/navigation/Topbar";
import { MobileTopbar } from "../components/navigation/MobileTopbar";
import { Breadcrumbs } from "../components/navigation/Breadcrumbs";
import { MainContentArea } from "./MainContentArea";
import { useUIState } from "../hooks/useUI";

interface MainShellProps {
  onMenuToggle: () => void;
}

/**
 * Main shell — topbar, breadcrumbs, and page content.
 * Renders MobileTopbar on mobile (<1024px) and full Topbar on desktop.
 * All state is read from Redux — no prop drilling.
 */
export function MainShell({ onMenuToggle }: MainShellProps) {
  const { isDesktop } = useUIState();

  return (
    <div className="app-main-shell">
      {isDesktop ? (
        <Topbar onMenuToggle={onMenuToggle} />
      ) : (
        <MobileTopbar onMenuToggle={onMenuToggle} />
      )}
      <Breadcrumbs />
      <MainContentArea />
    </div>
  );
}
