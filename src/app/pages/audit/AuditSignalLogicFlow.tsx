import { GitBranch, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getAuditSignalDefinition } from "./auditKnowledge";

type Branch = { label: string; text: string; tone?: "hold" | "continue" };
type Step = { title: string; detail: string; branches?: Branch[] };

function LogicStep({ step, position }: { step: Step; position: number }) {
  return (
    <li className="audit-signal-flow__step">
      <span className="audit-signal-flow__number" aria-hidden="true">{position}</span>
      <div className="audit-signal-flow__step-content">
        <strong>{step.title}</strong>
        <p>{step.detail}</p>
        {step.branches && (
          <div className="audit-signal-flow__branches">
            {step.branches.map((branch) => (
              <div
                className={`audit-signal-flow__branch${branch.tone === "hold" ? " audit-signal-flow__branch--hold" : ""}`}
                key={branch.label + branch.text}
              >
                <b>{branch.label}</b>
                <span>{branch.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

/** Reference visualization only. This component performs no risk assessment,
 * policy approval, taxpayer data lookup, threshold evaluation or case mutation. */
export function AuditSignalLogicFlow({ signalId, language }: { signalId: string; language: string }) {
  const { t } = useTranslation("audit");
  const signal = getAuditSignalDefinition(signalId, language);
  if (!signal) return null;
  const key = (suffix: string) => t(`signalFlow.${suffix}`);
  const isC1 = signalId === "R-C1";

  const steps: Step[] = isC1 ? [
    {
      title: key("eligibility"),
      detail: key("c1.eligibility"),
      branches: [
        { label: key("yes"), text: key("c1.eligible"), tone: "continue" },
        { label: key("missing"), text: key("c1.dataHold"), tone: "hold" },
        { label: key("notRequired"), text: key("c1.notApplicable"), tone: "hold" },
      ],
    },
    {
      title: key("c1.independenceTitle"),
      detail: key("c1.independence"),
      branches: [
        { label: key("verified"), text: key("continue"), tone: "continue" },
        { label: key("unverified"), text: key("c1.shadow"), tone: "hold" },
      ],
    },
    {
      title: key("c1.calculateTitle"),
      detail: key("c1.calculate"),
      branches: [
        { label: key("valid"), text: key("c1.formulaVerified"), tone: "continue" },
        { label: key("invalid"), text: key("c1.formulaHold"), tone: "hold" },
      ],
    },
    {
      title: key("c1.materialityTitle"),
      detail: key("c1.materiality"),
      branches: [
        { label: key("belowOrEqual"), text: key("c1.noTrigger"), tone: "hold" },
        { label: key("above"), text: key("c1.evaluateStrength"), tone: "continue" },
      ],
    },
    {
      title: key("c1.strengthTitle"),
      detail: key("c1.strength"),
    },
    {
      title: key("evidenceTitle"),
      detail: signal.legitimate + " " + signal.evidence,
      branches: [
        { label: key("pending"), text: key("evidencePending"), tone: "hold" },
        { label: key("refuted"), text: key("evidenceRefuted"), tone: "hold" },
        { label: key("supported"), text: key("supportedScreening"), tone: "continue" },
      ],
    },
  ] : [
    {
      title: key("eligibility"),
      detail: signal.requires,
      branches: [
        { label: key("eligible"), text: key("continue"), tone: "continue" },
        { label: key("missing"), text: key("dataHold"), tone: "hold" },
      ],
    },
    {
      title: key("conditionTitle"),
      detail: signal.condition,
      branches: [
        { label: key("no"), text: key("noTrigger"), tone: "hold" },
        { label: key("yes"), text: key("triggerReview"), tone: "continue" },
      ],
    },
    {
      title: key("evidenceTitle"),
      detail: signal.legitimate + " " + signal.evidence,
      branches: [
        { label: key("pending"), text: key("evidencePending"), tone: "hold" },
        { label: key("refuted"), text: key("evidenceRefuted"), tone: "hold" },
        { label: key("supported"), text: key("supportedScreening"), tone: "continue" },
      ],
    },
    {
      title: key("humanTitle"),
      detail: key("humanReview"),
    },
  ];

  return (
    <section className="audit-signal-flow" aria-label={key("title") + " " + signalId} data-signal-id={signalId}>
      <div className="audit-signal-flow__header">
        <GitBranch size={17} aria-hidden="true" />
        <h3>{key("title")}</h3>
        <span className="audit-signal-flow__mode">{key("notExecuted")}</span>
      </div>
      <ol className="audit-signal-flow__steps">
        {steps.map((step, index) => (
          <LogicStep key={index} step={step} position={index + 1} />
        ))}
      </ol>
      {isC1 && (
        <details className="audit-signal-flow__formula">
          <summary>{key("c1.formulaTitle")}</summary>
          <div>
            <p>{key("c1.formulaSource")}</p>
            <p>{key("c1.formulaGross")}</p>
            <p>{key("c1.formulaAssets")}</p>
            <p><strong>{key("c1.formulaGap")}</strong></p>
            <p>{key("c1.formulaIdentity")}</p>
          </div>
        </details>
      )}
      <p className="audit-signal-flow__disclaimer">
        <Info size={13} aria-hidden="true" />
        <span>{isC1 ? key("c1.approvalWarning") : key("genericWarning")}</span>
      </p>
    </section>
  );
}
