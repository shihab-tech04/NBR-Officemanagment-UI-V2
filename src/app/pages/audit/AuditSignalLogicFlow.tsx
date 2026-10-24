import { GitBranch } from "lucide-react";
import { getAuditSignalDefinition } from "./auditKnowledge";
import {
  auditSignalQuestion, auditSignalText, auditSignalCheck, auditSignalReason, auditSignalDocuments, type AuditSignalContext,
} from "./auditSignalPresentation";

const nonEmpty = (value: string | undefined) => (value && value.trim() ? value : "—");

/**
 * Explanatory audit decision path. Its record/population context comes from the
 * screen that opened the drawer; it never evaluates an unapproved threshold,
 * assumes a data-quality label is proof, or creates an audit finding.
 */
export function AuditSignalLogicFlow({
  signalId,
  language,
  context,
}: {
  signalId: string;
  language: string;
  context?: AuditSignalContext;
}) {
  const signal = getAuditSignalDefinition(signalId, language);
  const question = auditSignalQuestion(signalId, language);
  if (!signal || !question) return null;

  const word = (key: Parameters<typeof auditSignalText>[0]) => auditSignalText(key, language);
  const taxpayer = context?.scope === "taxpayer";
  const population = context?.scope === "population";
  const complete = context?.dataQuality?.toLowerCase() === "complete";
  const incomplete = /invalid|incomplete/i.test(context?.dataQuality ?? "");
  const isC1 = signalId === "R-C1";
  const check = auditSignalCheck(signalId, language) ?? word("check");
  const reason = auditSignalReason(signalId, language) ?? signal.legitimate;
  const documents = auditSignalDocuments(signalId, language) ?? signal.evidence;
  const locale = language.toLowerCase().startsWith("bn") ? "bn-BD" : "en-BD";
  const count = (value: number) => new Intl.NumberFormat(locale).format(value);
  const money = (value: number) => (value < 0 ? "−" : "") +
    "৳" + new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.abs(value));
  const displayedFacts = taxpayer ? (context?.displayedFacts ?? []) : [];
  const recordIntro = [
    context?.assessmentYear ? `${word("singleContext")}: ${context.assessmentYear}` : "",
    context?.returnId ? `${word("returnId")}: ${context.returnId}` : "",
    `${word("quality")}: ${nonEmpty(context?.dataQuality)}`,
    `${word("coverage")}: ${nonEmpty(context?.coverageTier)}`,
  ].filter(Boolean).join(" · ");
  const overviewCount = population && context?.count !== undefined && context?.total !== undefined
    ? `${count(context.count)} / ${count(context.total)}`
    : null;
  const overviewIntro = [overviewCount, word("groupDetail"), context?.filterContext
    ? `${word("filtered")}: ${context.filterContext}`
    : ""].filter(Boolean).join(" ");
  const readiness = taxpayer
    ? incomplete ? word("missing") : complete ? word("available") : word("unknown")
    : word("unknownCount");
  const bilingual = (en: string, bn: string) =>
    language.toLowerCase().startsWith("bn") ? bn : en;
  const flowLabel = bilingual("Decision flow", "সিদ্ধান্তের পথ");
  // These are possible review paths, not an automatic verdict or a finding.

  return (
    <section className="audit-signal-flow" aria-label={`${word("title")} ${signalId}`} data-signal-id={signalId}>
      <div className="audit-signal-flow__header">
        <GitBranch size={17} aria-hidden="true" />
        <h3>{word("title")}</h3>
        <span className="audit-signal-flow__mode">{taxpayer ? word("single") : word("group")}</span>
      </div>
      {taxpayer && displayedFacts.length > 0 && (
        <section className="detail-section audit-signal-flow__preview" aria-label={word("snapshot")}>
          <h4 className="detail-section__head detail-section__head--static">{word("snapshot")}</h4>
          <div className="drawer-field-grid">
            {displayedFacts.map((fact) => (
              <div className="drawer-field" key={fact.label}>
                <span className="drawer-field__label">{fact.label} · {fact.currentYear}</span>
                <div className="drawer-field__value"><strong>{money(fact.current)}</strong></div>
                {fact.previous !== undefined && fact.previousYear && (
                  <p className="audit-signal-flow__historical">
                    {fact.previousYear}: {money(fact.previous)} · {word("change")}: {money(fact.current - fact.previous)}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="audit-signal-flow__source-note">{word("snapshotCaution")}</p>
          {signalId.startsWith("R-E") && <p className="audit-signal-flow__source-note">{word("externalProof")}</p>}
          {isC1 && <p className="audit-signal-flow__source-note">{word("c1Separate")}</p>}
        </section>
      )}
      <div className="audit-decision-map" role="group" aria-label={flowLabel}>
        <div className="audit-decision-map__start">
          <strong>{signalId}</strong>
          <span>{bilingual("Check the signal", "সংকেত যাচাই করুন")}</span>
        </div>
        <div className="audit-decision-map__arrow" aria-hidden="true" />

        <div className="audit-decision-map__gate">
          <div className="audit-decision-map__diamond">
            <svg viewBox="0 0 240 124" focusable="false" aria-hidden="true">
              <path d="M120 2 L238 62 L120 122 L2 62 Z" />
            </svg>
            <strong>{bilingual("Are the required records available?", "প্রয়োজনীয় নথি কি আছে?")}</strong>
          </div>
          <div className="audit-decision-map__fork" aria-hidden="true" />
          <div className="audit-decision-map__options">
            <div className="audit-decision-map__option">
              <span className="audit-decision-map__answer">{bilingual("No", "না")}</span>
              <div className="audit-decision-map__box audit-decision-map__box--stop">
                <strong>{bilingual("Request missing records", "অনুপস্থিত নথি আনুন")}</strong>
                <p>{bilingual("Keep the signal open. Do not treat missing values as zero.", "যাচাই চলমান রাখুন। অনুপস্থিত তথ্য শূন্য ধরবেন না।")}</p>
              </div>
            </div>
            <div className="audit-decision-map__option">
              <span className="audit-decision-map__answer">{bilingual("Yes", "হ্যাঁ")}</span>
              <div className="audit-decision-map__box">
                <strong>{bilingual("Compare the filed figures", "দাখিলকৃত হিসাব মিলান")}</strong>
                <p>{check}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="audit-decision-map__arrow" aria-hidden="true" />

        <div className="audit-decision-map__gate">
          <div className="audit-decision-map__diamond">
            <svg viewBox="0 0 240 124" focusable="false" aria-hidden="true">
              <path d="M120 2 L238 62 L120 122 L2 62 Z" />
            </svg>
            <strong>{bilingual("Is the signal condition met?", "সংকেতের শর্ত কি মিলে?")}</strong>
          </div>
          <p className="audit-decision-map__question">{question}</p>
          <div className="audit-decision-map__fork" aria-hidden="true" />
          <div className="audit-decision-map__options">
            <div className="audit-decision-map__option">
              <span className="audit-decision-map__answer">{bilingual("No", "না")}</span>
              <div className="audit-decision-map__box audit-decision-map__box--stop">
                <strong>{bilingual("Record why it does not match", "না মেলার কারণ লিখুন")}</strong>
                <p>{bilingual("Do not trigger this signal without a verified condition.", "শর্ত যাচাই ছাড়া সংকেত চালু করবেন না।")}</p>
              </div>
            </div>
            <div className="audit-decision-map__option">
              <span className="audit-decision-map__answer">{bilingual("Yes", "হ্যাঁ")}</span>
              <div className="audit-decision-map__box">
                <strong>{bilingual("Check possible explanations", "সম্ভাব্য ব্যাখ্যা দেখুন")}</strong>
                <p>{reason}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="audit-decision-map__arrow" aria-hidden="true" />

        <div className="audit-decision-map__gate">
          <div className="audit-decision-map__diamond">
            <svg viewBox="0 0 240 124" focusable="false" aria-hidden="true">
              <path d="M120 2 L238 62 L120 122 L2 62 Z" />
            </svg>
            <strong>{bilingual("Does the evidence confirm the concern?", "প্রমাণে অমিল কি নিশ্চিত?")}</strong>
          </div>
          <div className="audit-decision-map__fork" aria-hidden="true" />
          <div className="audit-decision-map__options">
            <div className="audit-decision-map__option">
              <span className="audit-decision-map__answer">{bilingual("No / not yet", "না / এখনো নয়")}</span>
              <div className="audit-decision-map__box audit-decision-map__box--stop">
                <strong>{bilingual("Pending or explained", "অপেক্ষমাণ বা ব্যাখ্যা পাওয়া গেছে")}</strong>
                <p>{bilingual("Request more evidence or record why the concern was resolved.", "প্রমাণ চাইুন অথবা অমিল কেন মিটেছে তা লিখুন।")}</p>
              </div>
            </div>
            <div className="audit-decision-map__option">
              <span className="audit-decision-map__answer">{bilingual("Yes", "হ্যাঁ")}</span>
              <div className="audit-decision-map__box">
                <strong>{bilingual("Send for officer review", "কর্মকর্তার পর্যালোচনায় পাঠান")}</strong>
                <p>{bilingual("Link independent documents. The officer records the final assessment.", "স্বাধীন প্রমাণ যুক্ত করুন। কর্মকর্তা সিদ্ধান্ত নথিবদ্ধ করবেন।")}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="audit-decision-map__arrow" aria-hidden="true" />
        <div className="audit-decision-map__end">
          {bilingual("Record the decision, reasons and evidence in the audit trail", "সিদ্ধান্ত, কারণ ও প্রমাণ অডিট ট্রেইলে লিখুন")}
        </div>
      </div>
      <div className="audit-signal-flow__footnotes">
        <p><strong>{bilingual("Source check:", "যে নথি দেখবেন:")}</strong> {documents}</p>
        {taxpayer && <p>{recordIntro}. {readiness}</p>}
        {population && <p>{overviewIntro}. {readiness}</p>}
        {isC1 && <p>{word("c1Threshold")}</p>}
        {!isC1 && <p>{word("noAuthority")}</p>}
        <p>{word("officer")}</p>
      </div>
      <details className="audit-signal-flow__formula">
        <summary>{word("noNumeric")}</summary>
        <div>
          <p>{signal.condition}</p>
          {isC1 && <p>{word("c1Formula")}</p>}
          <p>{word("noAuthority")}</p>
        </div>
      </details>
    </section>
  );
}
