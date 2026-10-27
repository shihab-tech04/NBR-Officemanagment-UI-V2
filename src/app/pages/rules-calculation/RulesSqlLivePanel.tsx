import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { readPublicRuleYears, type PublicRuleYear } from "../../services/nbrRulesGatewayClient";

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
  return <section className="rules-engine__section" aria-label={bn ? "প্রকাশ্য বিধি তথ্য" : "Public Rules year information"}>
    <p role="status">{error
      ? (bn ? "প্রকাশ্য বিধি তথ্য পাওয়া যায়নি; সংরক্ষিত স্ন্যাপশট দেখানো হচ্ছে।" : "Public Rules data is unavailable; the recorded snapshot remains visible.")
      : years ? (bn ? "প্রকাশ্য বিধি বর্ষ" : "Public Rules years") + ": " + years.map(y => y.assessmentYear + " (" + y.state + ")").join(", ")
      : (bn ? "প্রকাশ্য বিধি তথ্য যাচাই করা হচ্ছে…" : "Checking public Rules information…")}</p>
    <p>{bn ? "এটি একটি প্রদর্শনী ইন্টারফেস। এখানে বিধি প্রকাশ, কার্যকর বা অনুমোদন করা হয় না।" : "Office prototype only. Rules cannot be approved, published or executed here."}</p>
  </section>;
}
