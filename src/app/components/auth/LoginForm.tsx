import { useState, startTransition } from "react";
import { useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Globe } from "lucide-react";
import type { AppDispatch } from "../../store/store";
import { login } from "../../store/authSlice";
import svgPaths from "../../../imports/CompanyAdminLogin/svg-mhvw7bsa5p";
import imgNbrLogo from "../../../assets/logos/nbr-logo.png";
import { AppTextField } from "../forms/AppTextField";
import { AppPasswordField } from "../forms/AppPasswordField";
import { AppCheckbox } from "../forms/AppCheckbox";
import { useHelp } from "../../context/HelpContext";
import { getTaxPayDemoLoginUrl } from "../../utils/demoTaxpayGateway";
import { emailForPrimaryAdminId } from "../../utils/primaryAdminIdentity";
import { OFFICE_AUTH_CALLBACK_URL } from "../../utils/officeAuthRedirect";
import { getOfficeReviewClient } from "../../pages/payments/OfficeReviewQueue";

interface LoginFormProps {
  isDesktop: boolean;
  onForgotPassword: () => void;
}

export function LoginForm({ isDesktop, onForgotPassword }: LoginFormProps) {
  const { t: translate } = useTranslation("auth");
  const dispatch = useDispatch<AppDispatch>();
  const { openHelp } = useHelp();
  const navigate = useNavigate();

  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authFeedback,setAuthFeedback]=useState<{error:boolean;text:string}|null>(null);
  const secureClient=getOfficeReviewClient();

  const demoUrl = getTaxPayDemoLoginUrl(userId);
  const adminEmail = emailForPrimaryAdminId(userId);
  // Preserve the original ID/password layout until an explicitly approved demo ID or
  // verified officer email is entered. Only the latter uses secure email-link auth.
  const officerEmail = Boolean(secureClient && (adminEmail || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userId.trim())));
  const showPasswordControls = !demoUrl && !officerEmail && !adminEmail;

  const handleSignIn = async () => {
    if (demoUrl) {
      window.location.assign(demoUrl); // Fictional TaxPay destination, no Office access.
      return;
    }
    if(adminEmail && !secureClient){
      setAuthFeedback({error:true,text:'Secure administrator sign-in is temporarily unavailable.'});
      return;
    }
    if(secureClient){
      if(isLoading)return;
      if(!officerEmail){
        setAuthFeedback({error:true,text:'Enter admin, user1–user10 or an authorized officer email.'});
        return;
      }
      setAuthFeedback(null);setIsLoading(true);
      try{
        const {error}=await secureClient.auth.signInWithOtp({
          email:adminEmail || userId.trim(),options:{
            emailRedirectTo:OFFICE_AUTH_CALLBACK_URL,
            shouldCreateUser:Boolean(adminEmail)
          }
        });
        if(error)throw error;
        setAuthFeedback({error:false,text:adminEmail ? 'A secure sign-in link was requested for the approved administrator mailbox. Verify the email to activate this account.' : 'Secure sign-in link requested. An active officer role is required.'});
      }catch(e){
        setAuthFeedback({error:true,text:e instanceof Error?e.message:'Sign-in request failed.'});
      }finally{setIsLoading(false);}
      return;
    }
    // Disconnected UX preview only. This cannot authorize any hosted Office SQL action.
    setIsLoading(true);
    setTimeout(()=>{
      setIsLoading(false);
      startTransition(()=>dispatch(login({userId:userId||undefined})));
    },800);
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
              label={translate("login.userId")}
              value={userId}
              onChange={value => { setUserId(value); setAuthFeedback(null); }}
              onKeyDown={handleKeyDown}
              placeholder={translate("login.userIdPlaceholder")}
              autoComplete="username"
            />

            {showPasswordControls && <AppPasswordField
              id="login-password"
              label={translate("login.password")}
              value={password}
              onChange={setPassword}
              onKeyDown={handleKeyDown}
              placeholder={translate("login.passwordPlaceholder")}
              autoComplete="current-password"
            />}
            {demoUrl && <p className="text-[13px] text-[var(--color-text-secondary)]">Demo account · no password needed.</p>}
            {officerEmail && <p className="text-[13px] text-[var(--color-text-secondary)]">{adminEmail ? 'Administrator sign-in uses an email verification link.' : 'Officer sign-in uses a secure email link.'}</p>}

            {showPasswordControls && (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <AppCheckbox
                id="login-remember-me"
                label={translate("login.rememberMe")}
                checked={rememberMe}
                onChange={setRememberMe}
              />
              <button type="button" onClick={onForgotPassword} className="login-form-link">
                {translate("login.forgotPassword")}
              </button>
            </div>
            )}

            {authFeedback&&<p role={authFeedback.error?'alert':'status'}>{authFeedback.text}</p>}
            <button
              type="button"
              onClick={()=>void handleSignIn()}
              disabled={isLoading}
              className="login-form-submit"
            >
              {isLoading ? (
                <>
                  <span className="login-spin-dot" aria-hidden="true" />
                  <span>{translate("login.signingIn")}</span>
                </>
              ) : (
                <span>{officerEmail?"Send secure sign-in link":translate("login.signIn")}</span>
              )}
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
