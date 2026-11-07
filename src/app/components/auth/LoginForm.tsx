import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { Eye, EyeOff, Globe } from "lucide-react";
import { Checkbox, FormControlLabel, IconButton, InputAdornment } from "@mui/material";
import svgPaths from "../../../imports/CompanyAdminLogin/svg-mhvw7bsa5p";
import imgNbrLogo from "../../../assets/logos/nbr-logo.png";
import { AppTextField } from "../forms/AppTextField";
import { useHelp } from "../../context/HelpContext";
import { checkAuditSqlAccess, getAuditSqlClient, isSharedAuditMode } from "../../pages/audit/auditSharedSql";
import { hasVerifiedCmsPublisherSession } from "../../services/taxpayCmsClient";
import { getOfficeCmsAuthClient, readRememberOfficeSession, setRememberOfficeSession } from "../../services/officeCmsBridge";
import { PRIMARY_ADMIN_EMAIL, PRIMARY_ADMIN_LOGIN_ID } from "../../utils/primaryAdminIdentity";

type RecoveryMode = "request" | "complete";

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete: string;
  onKeyDown?: (event: React.KeyboardEvent) => void;
};

/** Standard accessible show/hide control; the password is never copied or stored by this control. */
function PasswordField({ id, label, value, onChange, placeholder, autoComplete, onKeyDown }: PasswordFieldProps) {
  const { t } = useTranslation("auth");
  const [visible, setVisible] = useState(false);
  return <AppTextField id={id} type={visible ? "text" : "password"} label={label}
    placeholder={placeholder} value={value} onChange={onChange}
    autoComplete={autoComplete} onKeyDown={onKeyDown}
    endAdornment={<InputAdornment position="end">
      <IconButton type="button" edge="end" size="small"
        aria-label={t(visible ? "login.hidePassword" : "login.showPassword")}
        aria-pressed={visible} onClick={() => setVisible(current => !current)}>
        {visible ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
      </IconButton>
    </InputAdornment>}
  />;
}

/** Keep password recovery inside the approved Office sign-in card.
 * Only Supabase Auth can issue a reset link and accept a new password;
 * this UI never changes SQL publishing roles or creates another account.
 */
function CmsPasswordRecovery({ mode, onBack }: { mode: RecoveryMode; onBack: () => void }) {
  const { t } = useTranslation("auth");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [validity, setValidity] = useState<"checking" | "valid" | "invalid">("checking");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    if (mode !== "complete") return;
    let active = true;
    const cms = getOfficeCmsAuthClient();
    if (!cms) { setValidity("invalid"); return; }
    // Supabase restores the recovery session from the email callback URL.
    // getUser performs a server-side identity check before password changes.
    void cms.auth.getUser()
      .then(({ data, error }) => {
        if (!active) return;
        setValidity(!error && data.user?.email?.toLowerCase() === PRIMARY_ADMIN_EMAIL.toLowerCase()
          ? "valid" : "invalid");
      })
      .catch(() => { if (active) setValidity("invalid"); });
    return () => { active = false; };
  }, [mode]);

  const sendResetLink = async () => {
    if (busy || sent) return;
    setBusy(true);
    setError("");
    try {
      const cms = getOfficeCmsAuthClient();
      if (!cms) throw new Error(t("login.resetUnavailable"));
      // Reuse the existing public CMS route; no extra page or auth gate.
      const base = new URL(import.meta.env.BASE_URL, window.location.origin);
      const redirectTo = new URL("administration/content-management?cmsRecovery=1", base).toString();
      const { error } = await cms.auth.resetPasswordForEmail(PRIMARY_ADMIN_EMAIL, { redirectTo });
      if (error) throw error;
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("login.resetUnavailable"));
    } finally {
      setBusy(false);
    }
  };

  const setPassword = async () => {
    if (busy || validity !== "valid" || updated) return;
    setError("");
    if (newPassword.length < 12) { setError(t("login.newPasswordTooShort")); return; }
    if (newPassword !== confirmPassword) { setError(t("login.passwordMismatch")); return; }
    setBusy(true);
    try {
      const cms = getOfficeCmsAuthClient();
      if (!cms) throw new Error(t("login.resetUnavailable"));
      const { data: identity, error: identityError } = await cms.auth.getUser();
      if (identityError || identity.user?.email?.toLowerCase() !== PRIMARY_ADMIN_EMAIL.toLowerCase()) {
        throw new Error(t("login.resetLinkInvalid"));
      }
      const { error } = await cms.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setUpdated(true);
      setNewPassword("");
      setConfirmPassword("");
      // Recovery is not Office entry: the user must sign in normally after reset.
      const { error: exitError } = await cms.auth.signOut({ scope: "local" });
      if (exitError) setError(t("login.resetSignOutWarning"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("login.resetUnavailable"));
    } finally {
      setBusy(false);
    }
  };

  return <div className="flex flex-col gap-4">
    {mode === "request" ? <>
      <p className="text-[14px] text-[var(--color-text-secondary)]">{t("login.resetEmailHint")}</p>
      {sent
        ? <p role="status" className="text-[14px]">{t("login.resetEmailSent")}</p>
        : <button type="button" className="login-form-submit" disabled={busy} onClick={() => void sendResetLink()}>
            {busy ? t("login.resetSending") : t("login.resetSend")}
          </button>}
      <button type="button" className="text-[14px] underline" onClick={onBack}>{t("login.resetBack")}</button>
    </> : updated ? <>
      <p role="status" className="text-[14px]">{t("login.resetUpdated")}</p>
      <button type="button" className="login-form-submit" onClick={onBack}>{t("login.resetBack")}</button>
    </> : validity === "checking"
      ? <p role="status">{t("login.resetChecking")}</p>
      : validity === "invalid" ? <>
          <p role="alert" className="text-[14px] text-[var(--color-error)]">{t("login.resetLinkInvalid")}</p>
          <button type="button" className="login-form-submit" onClick={onBack}>{t("login.resetBack")}</button>
        </> : <>
          <PasswordField id="cms-recovery-password"
            label={t("login.newPassword")} placeholder={t("login.newPassword")}
            value={newPassword} autoComplete="new-password"
            onChange={value => { setNewPassword(value); setError(""); }} />
          <PasswordField id="cms-recovery-confirm"
            label={t("login.confirmPassword")} placeholder={t("login.confirmPassword")}
            value={confirmPassword} autoComplete="new-password"
            onChange={value => { setConfirmPassword(value); setError(""); }} />
          <button type="button" className="login-form-submit" disabled={busy}
            onClick={() => void setPassword()}>
            {busy ? t("login.resetUpdating") : t("login.resetUpdate")}
          </button>
        </>}
    {error && <p role="alert" className="text-[14px] text-[var(--color-error)]">{error}</p>}
  </div>;
}

interface LoginFormProps {
  isDesktop: boolean;
  onOfficeEnter?: (remembered?: boolean) => void;
}

export function LoginForm({ isDesktop, onOfficeEnter }: LoginFormProps) {
  const { t: translate } = useTranslation("auth");
  const { openHelp } = useHelp();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const [userId, setUserId] = useState("");
  const [resetRequested, setResetRequested] = useState(false);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => readRememberOfficeSession());
  const [entryError, setEntryError] = useState(false);
  const [sharedError, setSharedError] = useState("");
  const [sharedBusy, setSharedBusy] = useState(false);
  const sharedMode = isSharedAuditMode();
  const cmsEntry = !sharedMode && pathname.startsWith("/administration/content-management");
  const recovering = cmsEntry && new URLSearchParams(search ?? "").get("cmsRecovery") === "1";
  const showRecovery = recovering || (cmsEntry && resetRequested);
  const cancelRecovery = () => {
    setResetRequested(false);
    if (recovering) navigate("/administration/content-management", { replace: true });
  };
  const handleSignIn = async () => {
    if (sharedBusy) return;
    if (sharedMode) {
      setSharedError("");
      if (!userId.trim() || !password) {
        setSharedError("Officer email and password are required.");
        return;
      }
      setSharedBusy(true);
      try {
        const db = getAuditSqlClient();
        const { error } = await db.auth.signInWithPassword({
          email: userId.trim(), password,
        });
        if (error) throw new Error("Officer sign-in failed.");
        try {
          await checkAuditSqlAccess();
        } catch {
          await db.auth.signOut({ scope: "local" });
          throw new Error("An active Audit officer membership is required.");
        }
        setPassword("");
        onOfficeEnter?.();
        navigate("/dashboard/dashboard-main");
      } catch (error) {
        setSharedError(error instanceof Error ? error.message : "Officer sign-in failed.");
      } finally {
        setSharedBusy(false);
      }
      return;
    }
    const identifier = userId.trim().toLowerCase();
    const usingOfficeEmail = identifier === PRIMARY_ADMIN_EMAIL.toLowerCase();
    const usingAdminAlias = identifier === PRIMARY_ADMIN_LOGIN_ID.toLowerCase();
    if (!usingOfficeEmail && !usingAdminAlias) { setEntryError(true); return; }
    setEntryError(false);
    // The existing Office prototype remains password-optional everywhere
    // except its public-facing TaxPay publishing workspace. If a password
    // is provided, the same original sign-in verifies the Office-owned publisher session.
    setSharedBusy(true);
    try {
      const cms = getOfficeCmsAuthClient();
      if (!cms && (password || cmsEntry)) {
        throw new Error("Office content service is unavailable. Publishing access cannot be verified.");
      }
      if (cms && password) {
        const previousRemember = readRememberOfficeSession();
        setRememberOfficeSession(rememberMe);
        const { data, error } = await cms.auth.signInWithPassword({
          email: PRIMARY_ADMIN_EMAIL, password,
        });
        if (error || !data?.session?.user?.id) {
          setRememberOfficeSession(previousRemember);
          throw new Error("Office sign-in failed. Check your Office Supabase email/password and try again.");
        }
      }
      if (password || cmsEntry || usingOfficeEmail) {
        const mayPublish = await hasVerifiedCmsPublisherSession();
        if (!mayPublish) {
          if (password && cms) {
            await cms.auth.signOut({ scope: "local" });
            throw new Error("This Office account does not have permission to publish TaxPay content.");
          }
          throw new Error(translate("login.publisherPasswordRequired"));
        }
      }
      // A cached verified Office session may be reused without another login.
      if (!password && (cmsEntry || usingOfficeEmail)) setRememberOfficeSession(rememberMe);
      setPassword("");
      onOfficeEnter?.(rememberMe && (Boolean(password) || cmsEntry || usingOfficeEmail));
      navigate(cmsEntry ? "/administration/content-management" : "/dashboard/dashboard-main");
    } catch (error) {
      setSharedError(error instanceof Error ? error.message : "Office sign-in could not be verified. Please retry.");
    } finally {
      setSharedBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") void handleSignIn();
  };

  return (
    <div className={`login-form-wrapper${isDesktop ? "" : " login-form-wrapper--mobile"}`}>
      {/* Brand header */}
      <div className="login-form-brand-row">
        <div className="flex-1 min-w-0">
          <h2 className="login-form-brand-title">{translate("appTitle")}</h2>
          <p className="login-form-brand-subtitle">{translate("appSubtitle")}</p>
        </div>
        <div className="flex-shrink-0" style={{ maxWidth: isDesktop ? "200px" : "140px" }}>
          <img src={imgNbrLogo} alt="NBR Logo" style={{ width: "100%", height: "auto", objectFit: "contain" }} />
        </div>
      </div>

      {/* Form card */}
      <div className={`login-form-card modal-enter${isDesktop ? "" : " login-form-card--mobile"}`}>
        <div className="flex flex-col gap-6">
          {/* Title row */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="modal-form-header__title text-[30px] mb-1">
                {translate(recovering ? "login.resetChooseTitle" : resetRequested ? "login.resetTitle" : "login.title")}
              </h1>
              <p className="modal-form-header__subtitle">{translate(recovering ? "login.resetChooseSubtitle" : resetRequested ? "login.resetSubtitle" : cmsEntry ? "login.publisherSubtitle" : "login.subtitle")}</p>
            </div>
            <button type="button" className="login-form-manual-btn" onClick={openHelp}>
              <svg width="10" height="12" viewBox="0 0 10 12" fill="none">
                <path d={svgPaths.p10115700} fill="var(--color-text-secondary)" />
              </svg>
              <span className="text-[14px] text-[var(--color-text-secondary)]">
                {translate("login.userManual")}
              </span>
            </button>
          </div>

          {/* Fields */}
          {showRecovery ? <CmsPasswordRecovery mode={recovering ? "complete" : "request"} onBack={cancelRecovery} /> : <div className="flex flex-col gap-5">
            <AppTextField
              id="login-user-id"
              label={sharedMode ? "Officer email" : cmsEntry ? translate("login.userIdOrEmail") : translate("login.userId")}
              value={userId}
              onChange={value => { setUserId(value); setEntryError(false); setSharedError(""); }}
              onKeyDown={handleKeyDown}
              placeholder={sharedMode ? "Enter your authorized email" : translate(cmsEntry ? "login.userIdOrEmailPlaceholder" : "login.userIdPlaceholder")}
              autoComplete="username"
              error={!sharedMode && entryError ? translate("login.adminOnly") : undefined}
            />
            <PasswordField
              id="login-password"
              label={translate("login.password")}
              placeholder={sharedMode ? "Password" : translate(cmsEntry ? "login.passwordPlaceholder" : "login.passwordOptionalPlaceholder")}
              value={password}
              onChange={value => { setPassword(value); setSharedError(""); }}
              autoComplete="current-password"
            />
            {!sharedMode && <div className="flex items-center justify-between flex-wrap gap-2">
              <FormControlLabel
                sx={{ marginLeft: 0, marginRight: 0 }}
                control={<Checkbox size="small" checked={rememberMe}
                  onChange={(_, checked) => setRememberMe(checked)} />}
                label={<span className="text-[14px] text-[var(--color-text-secondary)]">{translate("login.rememberMe")}</span>}
              />
              {cmsEntry && <button type="button"
                className="text-[14px] underline text-[var(--color-text-secondary)]"
                onClick={() => { setSharedError(""); setResetRequested(true); }}>
                {translate("login.forgotPassword")}
              </button>}
            </div>}
            <button
              type="button"
              onClick={() => { void handleSignIn(); }}
              disabled={sharedBusy}
              className="login-form-submit"
            >
              <span>{sharedBusy ? "Signing in..." : translate("login.signIn")}</span>
            </button>

            {sharedError && <p role="alert" className="text-[14px] text-[var(--color-error)">{sharedError}</p>}
            {!sharedMode && <p className="text-[14px] text-center text-[var(--color-text-secondary)]">
              {translate("login.needHelp")}
            </p>}
          </div>}
        </div>
      </div>

      {/* NRB Special Registration entry */}
      <div className="login-public-access">
        <p className="login-public-access__text">{translate("specialReg.helper")}</p>
        <button
          type="button"
          className="login-public-access__btn"
          onClick={() => navigate("/special-registration/instructions")}
        >
          <Globe size={16} aria-hidden="true" />
          {translate("specialReg.button")}
        </button>
      </div>
    </div>
  );
}
