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
import { getTaxPayCmsClient } from "../services/taxpayCmsClient";
import { CMS_PUBLISH_SIGN_IN_EVENT, clearPendingCmsPublish } from "../services/cmsPublishReturn";
import { PRIMARY_ADMIN_EMAIL } from "../utils/primaryAdminIdentity";
import { AppModal } from "../components/modals/AppModal";
import { AppTextField } from "../components/forms/AppTextField";
import { PrimaryButton } from "../components/buttons/PrimaryButton";
import { SecondaryButton } from "../components/buttons/SecondaryButton";

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
 * The Office prototype has a presentation-only login. In opt-in shared mode,
 * that marker cannot restore access: Supabase Auth and active Audit membership
 * must be reverified on reload. Signing out must also end the Auth session.
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
  const [signOutError, setSignOutError] = useState("");
  const [cmsVerificationRequested, setCmsVerificationRequested] = useState(false);
  const [cmsPassword, setCmsPassword] = useState("");
  const [cmsVerificationError, setCmsVerificationError] = useState("");
  const [cmsVerifying, setCmsVerifying] = useState(false);
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
    setSignedOut(true);
  }, [sharedMode]);

  // Publishing must never sign the user out of Office or destroy the mounted
  // banner/logo editor. The CMS credential is verified inside the existing
  // workspace, while the uncommitted cropped File remains in tab memory.
  useEffect(() => {
    if (sharedMode) return;
    const requestVerification = () => {
      setCmsVerificationError("");
      setCmsVerificationRequested(true);
    };
    window.addEventListener(CMS_PUBLISH_SIGN_IN_EVENT, requestVerification);
    return () => window.removeEventListener(CMS_PUBLISH_SIGN_IN_EVENT, requestVerification);
  }, [sharedMode]);

  const cancelCmsVerification = () => {
    if (cmsVerifying) return;
    clearPendingCmsPublish();
    setCmsPassword("");
    setCmsVerificationError("");
    setCmsVerificationRequested(false);
  };

  const verifyCmsPublisher = async () => {
    if (cmsVerifying) return;
    if (!cmsPassword) {
      setCmsVerificationError("Enter your authorized Office account password to publish.");
      return;
    }
    const cms = getTaxPayCmsClient();
    if (!cms) {
      setCmsVerificationError("TaxPay publishing service is unavailable. Your Office session and draft are unchanged.");
      return;
    }
    setCmsVerifying(true);
    setCmsVerificationError("");
    let signedIn = false;
    try {
      const { data, error } = await cms.auth.signInWithPassword({
        email: PRIMARY_ADMIN_EMAIL, password: cmsPassword,
      });
      if (error || !data.session?.user?.id) throw new Error("Office publishing verification failed. Check the password and retry.");
      signedIn = true;
      const { data: verified, error: userError } = await cms.auth.getUser();
      if (userError || !verified.user || verified.user.is_anonymous ||
          verified.user.id !== data.session.user.id) {
        throw new Error("Unable to verify this Office publishing session.");
      }
      const { data: allowed, error: accessError } = await cms.rpc("taxpay_is_verified_portal_admin");
      if (accessError || allowed !== true) throw new Error("This account cannot publish TaxPay content.");
      setCmsPassword("");
      setCmsVerificationRequested(false);
      // Supabase SIGNED_IN refreshes the mounted banner/logo editor; it then
      // resumes exactly the pending Publish once, with SQL/RLS validation.
    } catch (error) {
      if (signedIn) await cms.auth.signOut({ scope: "local" }).catch(() => undefined);
      setCmsVerificationError(error instanceof Error ? error.message : "Publishing verification failed. Retry.");
    } finally {
      setCmsVerifying(false);
    }
  };

  const handleEnterOffice = () => {
    try {
      window.sessionStorage.setItem(OFFICE_ENTRY_KEY, sharedMode ? "officer" : "admin");
    } catch { /* The current tab can still navigate without persistence. */ }
    setSignOutError("");
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
      : signedOut && !openAuditPreview
        ? <LoginPage onOfficeEnter={handleEnterOffice}/>
        : <AppShell onSignedOut={() => { void handleSignOut(); }}/>}
    {signOutError && <p role="alert" className="form-error">{signOutError}</p>}
    <HelpDrawer/>
    <AppModal
      open={cmsVerificationRequested && !signedOut && !sharedMode}
      title="Verify TaxPay publishing"
      size="sm"
      onClose={cancelCmsVerification}
      footer={<>
        <SecondaryButton size="md" onClick={cancelCmsVerification} disabled={cmsVerifying}>Cancel</SecondaryButton>
        <PrimaryButton size="md" onClick={() => { void verifyCmsPublisher(); }} disabled={cmsVerifying}>
          {cmsVerifying ? "Verifying…" : "Verify and publish"}
        </PrimaryButton>
      </>}
    >
      <p>Confirm your authorized Office password to publish the pending banner or logo. Your Office session and unsaved edits will stay open.</p>
      <AppTextField id="cms-publish-password" label="Office account password" type="password"
        value={cmsPassword} onChange={value => { setCmsPassword(value); setCmsVerificationError(""); }}
        onKeyDown={event => { if (event.key === "Enter") void verifyCmsPublisher(); }}
        disabled={cmsVerifying} autoComplete="current-password" required />
      {cmsVerificationError && <p role="alert" className="form-error">{cmsVerificationError}</p>}
    </AppModal>
  </HelpProvider>;
}
