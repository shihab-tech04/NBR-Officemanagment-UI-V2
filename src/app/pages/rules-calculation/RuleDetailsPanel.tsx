import { ResponsiveOverlay } from "../../components/shared/ResponsiveOverlay";
import { RULES_SNAPSHOT_DATE } from "../../data/rulesEngineSnapshot";

export interface RuleDetailRecord {
  id: string;
  group: string;
  year: string;
  incomeYear: string;
  origin: string | null;
  source: string | null;
  legalSource: string[];
  applicability: string;
  execution: string | null;
  inherited: boolean;
}

interface Props {
  record: RuleDetailRecord | null;
  onClose: () => void;
  bn: boolean;
}

function legalValue(value: string | null | undefined, fallback: string) {
  return value?.trim() ? value : fallback;
}

/** A dedicated rule presentation, reusing the approved Office overlay and tokens.
 * Never invents a rate, formula, dependency or certification from identity metadata.
 */
export function RuleDetailsPanel({ record, onClose, bn }: Props) {
  const tr = (en: string, translated: string) => bn ? translated : en;
  if (!record) return null;
  const missing = tr("Not recorded", "নথিভুক্ত নয়");
  return (
    <ResponsiveOverlay
      open
      onClose={onClose}
      closeLabel={tr("Close rule details", "বিধির বিস্তারিত বন্ধ করুন")}
      title={tr("Rule Details", "বিধির বিস্তারিত")}
      desktopWidth="620px"
      className="rules-engine__details-dialog"
    >
      <div className="rules-engine__detail">
        <div className="rules-engine__detail-intro">
          <div>
            <h3>{record.id}</h3>
            <p>{record.group}</p>
          </div>
          <span className="rules-engine__detail-state">
            {record.inherited ? tr("Inherited · review pending", "উত্তরাধিকারী · পর্যালোচনা বাকি") : tr("Release not certified", "প্রকাশ অনুমোদিত নয়")}
          </span>
        </div>
        <section className="rules-engine__detail-section" aria-labelledby="rule-identity-heading">
          <h3 id="rule-identity-heading">{tr("Identity & applicability", "পরিচয় ও প্রযোজ্যতা")}</h3>
          <dl className="rules-engine__detail-grid">
            <div><dt>{tr("Assessment year", "করবর্ষ")}</dt><dd>{record.year}</dd></div>
            <div><dt>{tr("Income year", "আয়বর্ষ")}</dt><dd>{record.incomeYear}</dd></div>
            <div><dt>{tr("Recorded applicability", "নথিভুক্ত প্রযোজ্যতা")}</dt><dd>{record.inherited ? "INHERITED_PENDING_REVIEW" : record.applicability}</dd></div>
            <div><dt>{tr("Recorded execution", "নথিভুক্ত কার্যকর অবস্থা")}</dt><dd>{record.inherited ? "NOT_CERTIFIED" : legalValue(record.execution, missing)}</dd></div>
          </dl>
        </section>
        <section className="rules-engine__detail-section" aria-labelledby="rule-source-heading">
          <h3 id="rule-source-heading">{tr("Legal sources & provenance", "আইনি উৎস ও প্রমাণপঞ্জি")}</h3>
          <div className="rules-engine__detail-field">
            <p className="rules-engine__detail-key">{tr("Recorded legal references", "নথিভুক্ত আইনি রেফারেন্স")}</p>
            {record.legalSource.length ? (
              <ul className="rules-engine__source-list">
                {record.legalSource.map((source, index) => <li key={index}>{source}</li>)}
              </ul>
            ) : <p>{missing}</p>}
          </div>
          <dl className="rules-engine__detail-grid">
            <div><dt>{tr("Original artifact", "মূল নথি")}</dt><dd>{legalValue(record.source, missing)}</dd></div>
            <div><dt>{tr("Origin workstream", "উৎস কার্যক্রম")}</dt><dd>{legalValue(record.origin, missing)}</dd></div>
          </dl>
        </section>
        <section className="rules-engine__detail-section" aria-labelledby="rule-engine-heading">
          <h3 id="rule-engine-heading">{tr("Calculation & eReturn mapping", "হিসাব ও ই-রিটার্ন সংযোগ")}</h3>
          <dl className="rules-engine__detail-grid">
            <div><dt>{tr("Verified formula", "যাচাইকৃত সূত্র")}</dt><dd>{tr("Not in this record", "এই রেকর্ডে নেই")}</dd></div>
            <div><dt>{tr("Verified field dependencies", "যাচাইকৃত ফিল্ড নির্ভরতা")}</dt><dd>{tr("Not mapped", "সংযুক্ত নয়")}</dd></div>
          </dl>
        </section>
        <p className="rules-engine__detail-footnote">
          {tr(`Read-only SQL observation · ${RULES_SNAPSHOT_DATE}. These fields are identity evidence, not approval to calculate or publish.`,
              `শুধু পাঠযোগ্য SQL পর্যবেক্ষণ · ${RULES_SNAPSHOT_DATE}। এটি বিধির পরিচয়সংক্রান্ত প্রমাণ, হিসাব বা প্রকাশের অনুমোদন নয়।`)}
        </p>
      </div>
    </ResponsiveOverlay>
  );
}
