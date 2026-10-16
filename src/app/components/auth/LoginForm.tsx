import { useState } from "react";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Globe } from "lucide-react";
import type { AppDispatch } from "../../store/store";
import { login, logout } from "../../store/authSlice";
import svgPaths from "../../../imports/CompanyAdminLogin/svg-mhvw7bsa5p";
import imgNbrLogo from "../../../assets/logos/nbr-logo.png";
import { AppTextField } from "../forms/AppTextField";
import { useHelp } from "../../context/HelpContext";
import { getOfficeReviewClient } from "../../pages/payments/OfficeReviewQueue";
import { OFFICE_AUTH_CALLBACK_URL } from "../../utils/officeAuthRedirect";
import { getTaxPayDemoLoginUrl } from "../../utils/demoTaxpayGateway";

interface LoginFormProps {
  isDesktop: boolean;
  onForgotPassword: () => void;
}

export function LoginForm({ isDesktop }: LoginFormProps) {
  const { t: translate } = useTranslation("auth");
  const dispatch = useDispatch<AppDispatch>();
  const { openHelp } = useHelp();
  const navigate = useNavigate();

  const [userId, setUserId] = useState("");
  const [authFeedback,setAuthFeedback]=useState<{error:boolean;text:string}|null>(null);
  const [busy,setBusy]=useState(false);

  const normalizedId = userId.trim().toLowerCase();

  const handleSignIn = async () => {
    if (busy) return;
    if (import.meta.env.DEV) {
      const demoUrl = getTaxPayDemoLoginUrl(userId);
      if (demoUrl) {
        window.location.assign(demoUrl);
        return;
      }
      if (normalizedId === 'admin') {
        // Local preview only. Connected officer access still requires Supabase Auth.
        dispatch(login({userId:'admin'}));
        navigate('/dashboard/dashboard-main');
        return;
      }
    }

    const email = userId.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAuthFeedback({error:true,text:translate('login.officerEmailInvalid')});
      return;
    }

    // Clear a persisted local preview identity before asking the connected client
    // for a real session. The server still rejects accounts without an active role.
    dispatch(logout());
    const client = getOfficeReviewClient();
    if (!client) {
      setAuthFeedback({error:true,text:translate('login.officerSignInUnavailable')});
      return;
    }

    setBusy(true);
    setAuthFeedback(null);
    try {
      const {error} = await client.auth.signInWithOtp({
        email,
        options:{emailRedirectTo:OFFICE_AUTH_CALLBACK_URL,shouldCreateUser:false}
      });
      if (error) throw error;
      setAuthFeedback({error:false,text:translate('login.officerSignInLinkSent')});
    } catch {
      // Keep the response generic so the login screen does not disclose whether
      // an officer email is registered or currently active.
      setAuthFeedback({error:true,text:translate('login.officerSignInUnavailable')});
    } finally {
      setBusy(false);
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
              id="login-officer-email"
              label={translate("login.officerEmail")}
              value={userId}
              onChange={value => { setUserId(value); setAuthFeedback(null); }}
              onKeyDown={handleKeyDown}
              placeholder={translate("login.officerEmailPlaceholder")}
              autoComplete="email"
              inputMode="email"
            />

            <p className="text-[13px] text-[var(--color-text-secondary)]">{import.meta.env.DEV ? translate("login.localPreviewHint") : translate("login.officerEmailHint")}</p>

            {authFeedback&&<p role={authFeedback.error?'alert':'status'}>{authFeedback.text}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={()=>void handleSignIn()}
              className="login-form-submit"
            >
              <span>{busy ? translate("login.sendingSignInLink") : translate("login.signIn")}</span>
            </button>

            <p className="text-[13px] text-center text-[var(--color-text-secondary)]">
              {translate("login.needHelp")}
            </p>
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
