import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../store/store";
import { setIsDesktop } from "../store/uiSlice";
import { useAppearance } from "../hooks/useAppearance";
import { AppShell } from "./AppShell";
import { LoginPage } from "../pages/auth/LoginPage";
import { HelpProvider } from "../context/HelpContext";
import { HelpDrawer } from "../components/help/HelpDrawer";
import { checkAuditSqlAccess, getAuditSqlClient, isSharedAuditMode } from "../pages/audit/auditSharedSql";
import { getTaxPayCmsClient, hasVerifiedCmsPublisherSession } from "../services/taxpayCmsClient";

const OFFICE_ENTRY_KEY = "office_ui_entered";

function storedEntry(): string | null {
  try { return window.sessionStorage.getItem(OFFICE_ENTRY_KEY); }
  catch { return null; }
}

function clearEntry() {
  try { window.sessionStorage.removeItem(OFFICE_ENTRY_KEY); }
  catch { /* Browser storage might be disabled. */ }
}

/**
 * Preserve the approved password-optional Office prototype for its other
 * modules. Only the live TaxPay CMS route requires the verified publisher
 * identity already established by the existing Office sign-in form.
 */
export function AppRoot() {
  const dispatch = useDispatch<AppDispatch>();
  const sharedMode = isSharedAuditMode();
  const { pathname } = useLocation();
  // Only the synthetic Audit UI is open; all CMS/payment/admin routes retain Office entry.
  const openAuditPreview = !sharedMode && (pathname === "/audit" || pathname.startsWith("/audit/"));
  const [signedOut, setSignedOut] = useState(
    () => sharedMode || storedEntry() !== "admin",
  );
  const [restoring, setRestoring] = useState(
    () => sharedMode && storedEntry() === "officer",
  );
  const cmsRoute = !sharedMode && pathname.startsWith("/administration/content-management");
  const [cmsAccess, setCmsAccess] = useState<"checking" | "authorized" | "denied">("checking");
  const [signOutError, setSignOutError] = useState("");
  useAppearance();

  useEffect(() => {
    if (!sharedMode) return;
    let cancelled = false;
    let revoked = false;
    let subscription: { unsubscribe: () => void } | undefined;

    try {
      const db = getAuditSqlClient();
      const { data } = db.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT") {
          revoked = true;
          clearEntry();
          if (!cancelled) {
            setSignedOut(true);
            setRestoring(false);
          }
        }
      });
      subscription = data.subscription;

      if (storedEntry() !== "officer") {
        setSignedOut(true);
        setRestoring(false);
      } else {
        // getUser() and membership RLS are server-validated by this helper.
        void checkAuditSqlAccess()
          .then(() => {
            if (!cancelled && !revoked) setSignedOut(false);
          })
          .catch(() => {
            clearEntry();
            if (!cancelled) setSignedOut(true);
            void db.auth.signOut({ scope: "local" }).catch(() => undefined);
          })
          .finally(() => {
            if (!cancelled) setRestoring(false);
          });
      }
    } catch {
      clearEntry();
      setSignedOut(true);
      setRestoring(false);
    }
    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [sharedMode]);

  useEffect(() => {
    if (!cmsRoute) {
      // Recheck on the next CMS entry rather than trusting an old UI flag.
      setCmsAccess("checking");
      return;
    }
    let cancelled = false;
    setCmsAccess("checking");
    void hasVerifiedCmsPublisherSession()
      .then(allowed => {
        if (!cancelled) setCmsAccess(allowed ? "authorized" : "denied");
      })
      .catch(() => {
        if (!cancelled) setCmsAccess("denied");
      });
    return () => { cancelled = true; };
  }, [cmsRoute]);

  const handleSignOut = useCallback(async () => {
    setSignOutError("");
    if (sharedMode) {
      try {
        const { error } = await getAuditSqlClient().auth.signOut({ scope: "local" });
        if (error) throw error;
      } catch {
        // Do not declare officer logout while the Auth session remains active.
        setSignOutError("Officer sign-out could not be verified. Please retry.");
        return;
      }
    }
    try {
      // Revoke the CMS session whenever Office signs out. A later preview
      // login must never inherit the previous administrator's SQL authority.
      const cms = getTaxPayCmsClient();
      if (cms) {
        const { error } = await cms.auth.signOut({ scope: "local" });
        if (error) throw error;
      }
    } catch {
      setSignOutError("Content Management sign-out could not be verified. Please retry.");
      return;
    }
    clearEntry();
    setCmsAccess("denied");
    setSignedOut(true);
  }, [sharedMode]);

  const handleEnterOffice = () => {
    try {
      window.sessionStorage.setItem(OFFICE_ENTRY_KEY, sharedMode ? "officer" : "admin");
    } catch { /* The current tab can still navigate without persistence. */ }
    setSignOutError("");
    if (cmsRoute) setCmsAccess("authorized");
    setSignedOut(false);
  };

  useEffect(() => {
    const sync = () => dispatch(setIsDesktop(window.innerWidth >= 1024));
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [dispatch]);

  return <HelpProvider>
    {restoring
      ? <p role="status">Verifying Audit officer access…</p>
      : cmsRoute && !signedOut && cmsAccess === "checking"
        ? <p role="status">Verifying TaxPay publishing access…</p>
        : (signedOut || (cmsRoute && cmsAccess !== "authorized")) && !openAuditPreview
          ? <LoginPage onOfficeEnter={handleEnterOffice}/>
          : <AppShell onSignedOut={() => { void handleSignOut(); }}/>}
    {signOutError && <p role="alert" className="form-error">{signOutError}</p>}
    <HelpDrawer/>
  </HelpProvider>;
}
