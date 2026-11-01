import { useEffect, useRef, useState } from "react";
import { AppTextField } from "../../components/forms/AppTextField";
import { PrimaryButton } from "../../components/buttons/PrimaryButton";
import { SecondaryButton } from "../../components/buttons/SecondaryButton";
import { ResponsiveTable } from "../../components/tables/ResponsiveTable";
import { Pagination } from "../../components/shared/Pagination";
import { fc, type TableRow } from "../modulePageUtils";
import {
  readAuthorizedRules, signInRulesOfficer, signOutRulesOfficer,
  type LiveRulesPage, type RulesOfficerSession,
} from "../../services/nbrRulesOfficerClient";

/**
 * Read-only authenticated Rules SQL view. This is deliberately separate from
 * the Office prototype shell. No rules/parameters are edited or published.
 */
export function RulesSqlReadbackPanel({ year, bn }: { year: string; bn: boolean }) {
  const tr = (en: string, bangla: string) => bn ? bangla : en;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [session, setSession] = useState<RulesOfficerSession | null>(null);
  const sessionRef = useRef<RulesOfficerSession | null>(null);
  const [page, setPage] = useState(1);
  const [readback, setReadback] = useState<LiveRulesPage | null>(null);

  useEffect(() => {
    return () => {
      const active = sessionRef.current;
      sessionRef.current = null;
      if (active) void signOutRulesOfficer(active).catch(() => {});
    };
  }, []);

  useEffect(() => {
    setPage(1);
    setReadback(null);
  }, [year]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setStatus("");
    setBusy(true);
    setReadback(null);
    void readAuthorizedRules(session, year, page).then(result => {
      if (active) setReadback(result);
    }).catch(error => {
      if (!active) return;
      const isExpired = error instanceof Error && error.message === "NBR_RULES_SESSION_EXPIRED";
      setStatus(isExpired
        ? tr("Rules officer session expired. Sign in again.", "বিধি কর্মকর্তার সেশনের মেয়াদ শেষ। পুনরায় প্রবেশ করুন।")
        : tr("Live Rules SQL read-back failed. No recorded snapshot is presented as live.", "লাইভ বিধি SQL পড়া যায়নি। পূর্বের তালিকাকে লাইভ তথ্য হিসেবে দেখানো হচ্ছে না।"));
      if (isExpired) {
        sessionRef.current = null;
        setSession(null);
        void signOutRulesOfficer(session).catch(() => {});
      }
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [session, year, page, bn]);

  const connect = async () => {
    if (busy || session) return;
    setBusy(true);
    setStatus("");
    try {
      const authorized = await signInRulesOfficer(email, password);
      sessionRef.current = authorized;
      setSession(authorized);
      setPassword("");
      setEmail("");
      setPage(1);
    } catch {
      setStatus(tr(
        "Protected Rules access was denied or is not configured. A verified Rules SQL officer identity is required.",
        "সুরক্ষিত বিধি অ্যাক্সেস পাওয়া যায়নি। যাচাইকৃত বিধি SQL কর্মকর্তার পরিচয় প্রয়োজন।"
      ));
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    const active = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    setReadback(null);
    setPassword("");
    setStatus("");
    if (active) void signOutRulesOfficer(active).catch(() => {
      setStatus(tr("Server session revocation could not be confirmed.", "সার্ভার সেশন বাতিল হয়েছে কি না যাচাই করা যায়নি।"));
    });
  };

  const rows: TableRow[] = readback?.rules.map(rule => ({
    id: rule._backend.versionId,
    rule_id: rule.rule_id,
    revision_no: rule._backend.revisionNo,
    group: rule._backend.groupId,
    legal_source: String(rule.statutory_section ?? rule.canonical_source_ref ?? rule.legal_source ?? "—"),
    year_status: rule._backend.yearApplicabilityStatus,
    execution: rule._backend.executionStatus,
  })) ?? [];

  return <section className="rules-engine__section" aria-labelledby="rules-sql-readback-title">
    <div className="rules-engine__list-heading">
      <h2 id="rules-sql-readback-title" className="rules-engine__heading">
        {tr("Verified Rules SQL read-back", "যাচাইকৃত বিধি SQL রিডব্যাক")}
      </h2>
      {session && <SecondaryButton size="sm" onClick={disconnect}>
        {tr("Disconnect", "সংযোগ বিচ্ছিন্ন")}
      </SecondaryButton>}
    </div>
    {!session ? <>
      <p className="rules-engine__scope">
        {tr(
          "Connect with a registered Rules SQL officer account to read current versioned records. The Office demonstration login does not authorize this operation.",
          "বর্তমান সংস্করণের তথ্য পড়তে নিবন্ধিত বিধি SQL কর্মকর্তার অ্যাকাউন্ট ব্যবহার করুন। অফিসের সাধারণ লগইন এই অনুমতি দেয় না।"
        )}
      </p>
      <div className="rules-engine__filters rules-engine__filters--rules">
        <AppTextField id="rules-auth-email" label={tr("Rules officer email", "বিধি কর্মকর্তার ইমেইল")}
          type="email" autoComplete="username" compact required
          value={email} onChange={setEmail} disabled={busy}/>
        <AppTextField id="rules-auth-password" label={tr("Password", "পাসওয়ার্ড")}
          type="password" autoComplete="current-password" compact required
          value={password} onChange={setPassword} disabled={busy}
          onKeyDown={event => { if (event.key === "Enter") void connect(); }}/>
        <PrimaryButton size="sm" onClick={() => { void connect(); }} disabled={busy || !email.trim() || !password}>
          {busy ? tr("Connecting…", "সংযোগ হচ্ছে…") : tr("Connect", "সংযুক্ত করুন")}
        </PrimaryButton>
      </div>
    </> : <>
      <p className="rules-engine__scope">
        {tr(
          "Authenticated read-only results for AY " + year + ". SQL execution labels are not legal approval.",
          "করবর্ষ " + year + "-এর যাচাইকৃত পাঠযোগ্য তথ্য। SQL অবস্থা আইনি অনুমোদন নয়।"
        )}
      </p>
      {busy ? <p role="status">{tr("Loading Rules SQL…", "বিধি SQL লোড হচ্ছে…")}</p>
        : readback && <>
          <p role="status">{readback.total} {tr("current rule records in SQL", "বর্তমান বিধি SQL রেকর্ড")}</p>
          <ResponsiveTable aria-label={tr("Authenticated versioned SQL rules", "যাচাইকৃত সংস্করণভিত্তিক SQL বিধি")}
            cols={[
              fc("rule_id", tr("Rule ID", "বিধি আইডি")),
              fc("revision_no", tr("Revision", "সংস্করণ")),
              fc("legal_source", tr("Legal reference", "আইনি রেফারেন্স"), {truncate:"long"}),
              fc("year_status", tr("Year applicability", "করবর্ষ প্রয়োগ")),
              fc("execution", tr("Stored status", "সংরক্ষিত অবস্থা")),
            ]}
            rows={rows} mobileCardMapping={{primary:"rule_id",meta:["revision_no","legal_source","execution"]}}/>
          {readback.total > 25 && <Pagination page={page} total={readback.total} perPage={25}
            onPage={setPage} perPageOptions={[25]} onPerPageChange={() => {}} />}
        </>}
    </>}
    {status && <p role="alert">{status}</p>}
  </section>;
}
