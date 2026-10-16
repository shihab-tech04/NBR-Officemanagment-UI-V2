import { useEffect } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../store/store";
import { setIsDesktop } from "../store/uiSlice";
import { useAppearance } from "../hooks/useAppearance";
import { AppShell } from "./AppShell";
import { HelpProvider } from "../context/HelpContext";
import { HelpDrawer } from "../components/help/HelpDrawer";

/**
 * Office Management has no UI authentication gate. The open shell cannot access
 * protected officer records: the connected review client is disabled separately.
 */
export function AppRoot() {
  const dispatch = useDispatch<AppDispatch>();
  useAppearance();

  useEffect(()=>{
    const sync=()=>dispatch(setIsDesktop(window.innerWidth>=1024));
    sync();window.addEventListener('resize',sync);
    return()=>window.removeEventListener('resize',sync);
  },[dispatch]);

  return <HelpProvider>
    <AppShell/>
    <HelpDrawer/>
  </HelpProvider>;
}
