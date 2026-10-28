import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Globe } from "lucide-react";
import svgPaths from "../../../imports/CompanyAdminLogin/svg-mhvw7bsa5p";
import imgNbrLogo from "../../../assets/logos/nbr-logo.png";
import { AppTextField } from "../forms/AppTextField";
import { useHelp } from "../../context/HelpContext";
import { checkAuditSqlAccess, getAuditSqlClient, isSharedAuditMode } from "../../pages/audit/auditSharedSql";

interface LoginFormProps {
  isDesktop: boolean;
  onOfficeEnter?: () => void;
}

export function LoginForm({ isDesktop, onOfficeEnter }: LoginFormProps) {
  const { t: translate } = useTranslation("auth");
  const { openHelp } = useHelp();
  const navigate = useNavigate();

  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [entryError, setEntryError] = useState(false);
  const [sharedError, setSharedError] = useState("");
  const [sharedBusy, setSharedBusy] = useState(false);
  const sharedMode = isSharedAuditMode();
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
    if (userId.trim().toLowerCase() !== "admin") { setEntryError(true); return; }
    setEntryError(false);
    // Prototype sign-in is NOT an SQL identity and cannot authorize shared Audit.
    void password;
    onOfficeEnter?.();
    navigate("/dashboard/dashboard-main");
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
                {translate("login.title")}
              </h1>
              <p className="modal-form-header__subtitle">{translate("login.subtitle")}</p>
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
          <div className="flex flex-col gap-5">
            <AppTextField
              id="login-user-id"
              label={sharedMode ? "Officer email" : translate("login.userId")}
              value={userId}
              onChange={value => { setUserId(value); setEntryError(false); setSharedError(""); }}
              onKeyDown={handleKeyDown}
              placeholder={sharedMode ? "Enter your authorized email" : translate("login.userIdPlaceholder")}
              autoComplete={sharedMode ? "username" : "off"}
              error={!sharedMode && entryError ? translate("login.adminOnly") : undefined}
            />
            <AppTextField
              id="login-password"
              type="password"
              label={translate("login.password")}
              placeholder={sharedMode ? "Password" : translate("login.passwordOptionalPlaceholder")}
              value={password}
              onChange={value => { setPassword(value); setSharedError(""); }}
              autoComplete={sharedMode ? "current-password" : "off"}
            />
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
          </div>
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
