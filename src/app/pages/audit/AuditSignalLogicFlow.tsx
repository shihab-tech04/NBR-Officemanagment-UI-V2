import { GitBranch } from "lucide-react";
import { getAuditSignalDefinition } from "./auditKnowledge";
import {
  auditSignalQuestion, auditSignalText, auditSignalCheck, auditSignalReason, auditSignalDocuments, type AuditSignalContext,
} from "./auditSignalPresentation";

type Step = { title: string; detail: string; more?: string };
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
  const steps: Step[] = [
    {
      title: word("first"),
      detail: taxpayer ? recordIntro : population ? overviewIntro : word("unknownCount"),
      more: readiness,
    },
    {
      title: word("second"),
      detail: `${word("separate")} ${question}`,
      more: word("check"),
    },
    {
      title: word("third"),
      detail: check,
      more: isC1 ? word("c1Threshold") : word("noAuthority"),
    },
    {
      title: word("evidence"),
      detail: `${word("reasons")}${reason}`,
      more: `${word("proof")}${documents}`,
    },
    {
      title: word("decision"),
      detail: word("officer"),
    },
  ];

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
      <ol className="audit-signal-flow__steps">
        {steps.map((step, index) => (
          <li className="audit-signal-flow__step" key={step.title}>
            <span className="audit-signal-flow__number" aria-hidden="true">{index + 1}</span>
            <div className="audit-signal-flow__step-content">
              <strong>{step.title}</strong>
              <p>{step.detail}</p>
              {step.more && <p>{step.more}</p>}
              {index === steps.length - 1 && (
                <div className="audit-signal-flow__branches">
                  {(["evidencePending", "evidenceExplained", "evidenceReview"] as const).map((key) => (
                    <div className={`audit-signal-flow__branch${key === "evidencePending" ? " audit-signal-flow__branch--hold" : ""}`} key={key}>
                      <b>{word(key)}</b>
                      <span>{word(key === "evidencePending" ? "evidencePendingBody"
                        : key === "evidenceExplained" ? "evidenceExplainedBody" : "evidenceReviewBody")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
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
