import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { useTranslation } from "react-i18next";
import { AppTextField } from "../../components/forms/AppTextField";
import { PrimaryButton } from "../../components/buttons/PrimaryButton";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import { createRulesAdminReadClient } from "../../services/nbrRulesAdminReadClient";
import {
  NBR_RULES_GATEWAY_BASE, nbrRulesAuth,
  readPublicRuleYears, openRuleAdminSession,
  type PublicRuleYear,
} from "../../services/nbrRulesGatewayClient";

export type AuthorizedRulesClient = ReturnType<typeof createRulesAdminReadClient>;

export function RulesSqlLivePanel({
  onAccessChange,
}: {
  onAccessChange: (client: AuthorizedRulesClient | null) => void;
}) {
  const { i18n } = useTranslation();
  const bn = i18n.language.toLowerCase().startsWith("bn");
  const label = (en: string, local: string) => bn ? local : en;
  const [years, setYears] = useState<PublicRuleYear[] | null>(null);
  const [sqlError, setSqlError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [enroll, setEnroll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void readPublicRuleYears().then((result) => {
      if (active) setYears(result);
    }).catch(() => {
      if (active) setSqlError("NBR Rules SQL is currently unavailable.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const connect = async (session: Session) => {
      const verified = await nbrRulesAuth.auth.getUser(session.access_token);
      if (!active || verified.error || !verified.data.user || verified.data.user.id !== session.user.id) return;
      const token = await openRuleAdminSession(session.access_token);
      const api = createRulesAdminReadClient({
        baseUrl: NBR_RULES_GATEWAY_BASE, bearerToken: session.access_token,
        ruleSessionToken: token,
      });
      await api.getYears(); // Fail closed before exposing an authorized client.
      if (active) { setAuthorized(true); onAccessChange(api); setMessage(""); }
    };
    void nbrRulesAuth.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      try { await connect(data.session); }
      catch { if (active) { setAuthorized(false); onAccessChange(null); } }
    });
    return () => { active = false; };
  }, [onAccessChange]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const address = email.trim();
      if (enroll) {
        if (!activationCode.trim()) throw Error("One-time activation code is required.");
        const { data, error } = await nbrRulesAuth.auth.signUp({
          email: address, password,
          options: { data: { nbr_activation_code: activationCode.trim() } },
        });
        if (error) throw error;
        setActivationCode(""); setPassword("");
        setMessage(data.session ?
          label("Account created. Sign in to load authorized Rules data.", "অ্যাকাউন্ট তৈরি হয়েছে। অনুমোদিত বিধি দেখতে প্রবেশ করুন।") :
          label("Check your email to confirm registration. Authorization requires a valid one-time code.", "নিবন্ধন নিশ্চিত করতে ইমেইল দেখুন। অনুমোদনের জন্য বৈধ একবারের কোড প্রয়োজন।"));
        setEnroll(false);
      } else {
        const { data, error } = await nbrRulesAuth.auth.signInWithPassword({ email: address, password });
        if (error || !data.session) throw error ?? Error("No verified session returned.");
        const verified = await nbrRulesAuth.auth.getUser(data.session.access_token);
        if (verified.error || verified.data.user?.id !== data.session.user.id) throw Error("User verification failed");
        const token = await openRuleAdminSession(data.session.access_token);
        const api = createRulesAdminReadClient({
          baseUrl: NBR_RULES_GATEWAY_BASE, bearerToken: data.session.access_token,
          ruleSessionToken: token,
        });
        await api.getYears();
        setAuthorized(true); onAccessChange(api); setMessage("");
      }
    } catch (error) {
      setAuthorized(false); onAccessChange(null);
      setMessage(error instanceof Error ? error.message : "Administrator authentication failed.");
    } finally { setBusy(false); }
  };

  const signOut = async () => {
    await nbrRulesAuth.auth.signOut({ scope: "local" });
    setAuthorized(false); onAccessChange(null); setPassword("");
  };

  return (
    <section className="rules-engine__section" aria-label={label("Connected NBR Rules SQL", "সংযুক্ত এনবিআর বিধি SQL")}>
      <p role="status" aria-live="polite">
        {sqlError || (years ?
          label("Live SQL connected", "লাইভ SQL সংযুক্ত") + " · " +
          years.map(y => y.assessmentYear + " (" + y.state + ")").join(", ") :
          label("Checking Rules SQL connection…", "বিধি SQL সংযোগ যাচাই হচ্ছে…"))}
      </p>
      {authorized ? (
        <div className="table-page__actions">
          <p>{label("Verified administrator Rules session", "যাচাইকৃত প্রশাসক বিধি সেশন")}</p>
          <SecondaryButton size="sm" onClick={() => void signOut()}>
            {label("Sign out", "সাইন আউট")}
          </SecondaryButton>
        </div>
      ) : (
        <form onSubmit={event => void submit(event)} className="rules-engine__filters">
          <AppTextField id="nbr-rules-email" compact label={label("Administrator email", "প্রশাসকের ইমেইল")}
            type="email" autoComplete="email" value={email} onChange={setEmail} required />
          <AppTextField id="nbr-rules-password" compact label={label("Password", "পাসওয়ার্ড")}
            type="password" autoComplete={enroll ? "new-password" : "current-password"}
            value={password} onChange={setPassword} required />
          {enroll && <AppTextField id="nbr-rules-activation" compact label={label("One-time activation code", "একবারের সক্রিয়করণ কোড")}
            value={activationCode} onChange={setActivationCode} required />}
          <PrimaryButton type="submit" size="sm" disabled={busy}>
            {enroll ? label("Create verified account", "যাচাইকৃত অ্যাকাউন্ট তৈরি") : label("Sign in to Rules SQL", "বিধি SQL-এ প্রবেশ")}
          </PrimaryButton>
          <SecondaryButton type="button" size="sm" disabled={busy} onClick={() => { setEnroll(v => !v); setMessage(""); }}>
            {enroll ? label("Already registered", "আগেই নিবন্ধিত") : label("Activate account", "অ্যাকাউন্ট সক্রিয় করুন")}
          </SecondaryButton>
        </form>
      )}
      {message && <p role="status" aria-live="polite">{message}</p>}
      {!authorized && <p>
        {label("Rule details require your own verified Supabase identity and approved Rules permissions; the Office User ID preview is not an authorization credential.",
          "বিধির বিস্তারিত দেখতে নিজস্ব যাচাইকৃত সুপাবেস পরিচয় ও অনুমোদিত বিধি অনুমতি প্রয়োজন। Office User ID অনুমোদনের বিকল্প নয়।")}
      </p>}
    </section>
  );
}
