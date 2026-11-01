import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { readPublicRuleYears, type PublicRuleYear } from "../../services/nbrRulesGatewayClient";
import { TAX_YEAR_SNAPSHOT } from "../../data/rulesEngineSnapshot";

export function RulesSqlLivePanel() {
  const { i18n } = useTranslation();
  const bn = i18n.language.toLowerCase().startsWith("bn");
  const [years, setYears] = useState<PublicRuleYear[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void readPublicRuleYears().then(data => { if (active) setYears(data); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, []);
  // A live SQL year catalogue can be checked against the Office-recorded
  // baseline without granting authority to the recorded rule snapshot.
  const matchesRecordedYears = years !== null &&
    years.length === TAX_YEAR_SNAPSHOT.length &&
    TAX_YEAR_SNAPSHOT.every(record =>
      years.some(y => y.assessmentYear === record.assessmentYear && y.incomeYear === record.incomeYear));
  return <section className="rules-engine__section" aria-label={bn ? "প্রকাশ্য বিধি তথ্য" : "Public Rules year information"}>
    <p role="status">{error
      ? (bn ? "প্রকাশ্য বিধি তথ্য পাওয়া যায়নি; সংরক্ষিত তালিকার সত্যতা যাচাই করা যাচ্ছে না।" : "Live Rules SQL is unavailable; the recorded inventory cannot be verified.")
      : years ? (matchesRecordedYears
        ? (bn ? "SQL ও অফিসের করবর্ষ/আয়বর্ষ পরিচয় মিলেছে" : "SQL and Office AY/IY identities match")
        : (bn ? "SQL ও অফিসের করবর্ষ/আয়বর্ষ তথ্য ভিন্ন — যাচাই প্রয়োজন" : "SQL and Office AY/IY records differ — review required")) + ": " + years.map(y => y.assessmentYear + " / " + y.incomeYear).join(", ")
      : (bn ? "প্রকাশ্য বিধি তথ্য যাচাই করা হচ্ছে…" : "Checking public Rules information…")}</p>
    <p>{bn ? "এখানে বিধি প্রকাশ, কার্যকর বা অনুমোদন করা হয় না।" : "Rules cannot be approved, published or executed here."}</p>
  </section>;
}
