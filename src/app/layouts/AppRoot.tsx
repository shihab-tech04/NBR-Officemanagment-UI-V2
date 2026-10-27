import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../store/store";
import { setIsDesktop } from "../store/uiSlice";
import { useAppearance } from "../hooks/useAppearance";
import { AppShell } from "./AppShell";
import { LoginPage } from "../pages/auth/LoginPage";
import { HelpProvider } from "../context/HelpContext";
import { HelpDrawer } from "../components/help/HelpDrawer";

/**
 * Office Management has no UI authentication gate. The open shell cannot access
 * protected officer records: the connected review client is disabled separately.
 */
export function AppRoot() {
  const dispatch = useDispatch<AppDispatch>();
  // A local, presentation-only entry screen. It does not grant database permissions.
  const [signedOut, setSignedOut] = useState(() => {
    try { return window.sessionStorage.getItem("office_ui_entered") !== "admin"; }
    catch { return true; }
  });
  useAppearance();

  const handleSignOut = () => {
    try { window.sessionStorage.removeItem("office_ui_entered"); }
    catch { /* Private browsing may prevent storage. */ }
    setSignedOut(true);
  };
  const handleEnterOffice = () => {
    try { window.sessionStorage.setItem("office_ui_entered", "admin"); }
    catch { /* The current tab still transitions into the office. */ }
    setSignedOut(false);
  };

  useEffect(()=>{
    const sync=()=>dispatch(setIsDesktop(window.innerWidth>=1024));
    sync();window.addEventListener('resize',sync);
    return()=>window.removeEventListener('resize',sync);
  },[dispatch]);

  return <HelpProvider>
    {signedOut ? <LoginPage onOfficeEnter={handleEnterOffice}/> : <AppShell onSignedOut={handleSignOut}/>}
    <HelpDrawer/>
  </HelpProvider>;
}
