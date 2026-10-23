import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ResponsiveOverlay } from "../../components/shared/ResponsiveOverlay";
import type { TableRow } from "../modulePageUtils";
import { resolveAuditExplanation, type AuditExplanation } from "./auditKnowledge";
import { AuditSignalLogicFlow } from "./AuditSignalLogicFlow";

function compactMoney(value: number, language: string): string {
  const locale = language?.startsWith("bn") ? "bn-BD" : "en-BD";
  return "৳" + new Intl.NumberFormat(locale, {
    notation:"compact",
    maximumFractionDigits:1,
  }).format(value);
}

function CandidateEvidenceTrendChart({
  years,
  values,
  label,
  language,
}: {
  years: string[];
  values: number[];
  label: string;
  language: string;
}) {
  const width = 520;
  const height = 170;
  const pad = { top:24, right:18, bottom:34, left:18 };
  const minRaw = Math.min(0, ...values);
  const maxRaw = Math.max(0, ...values);
  const span = Math.max(1, maxRaw - minRaw);
  const axisMin = minRaw - span * 0.12;
  const axisMax = maxRaw + span * 0.12;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (index: number) =>
    pad.left + (innerW * index) / Math.max(1, values.length - 1);
  const y = (value: number) =>
    pad.top + ((axisMax - value) / Math.max(1, axisMax - axisMin)) * innerH;
  const zeroY = y(0);
  const points = values.map((value, index) => [x(index), y(value)] as const);
  const path = points
    .map(([px, py], index) => `${index === 0 ? "M" : "L"} ${px} ${py}`)
    .join(" ");
  const latestNegative = values[values.length - 1] < 0;

  return (
    <div className="audit-preview-drawer-v2__trend-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
      >
        <title>{label}</title>
        <line
          className="audit-preview-drawer-v2__trend-grid"
          x1={pad.left}
          x2={width - pad.right}
          y1={zeroY}
          y2={zeroY}
        />
        <path className="audit-preview-drawer-v2__trend-line" d={path} />
        {latestNegative && values.length >= 2 && (
          <line
            className="audit-preview-drawer-v2__trend-line audit-preview-drawer-v2__trend-line--negative"
            x1={points[points.length - 2][0]}
            y1={points[points.length - 2][1]}
            x2={points[points.length - 1][0]}
            y2={points[points.length - 1][1]}
          />
        )}
        {values.map((value, index) => {
          const px = x(index);
          const py = y(value);
          const negative = value < 0;
          const valueY = negative
            ? Math.min(height - pad.bottom - 3, py + 18)
            : Math.max(pad.top + 10, py - 10);

          return (
            <g key={years[index]}>
              <circle
                className={negative
                  ? "audit-preview-drawer-v2__trend-point audit-preview-drawer-v2__trend-point--negative"
                  : "audit-preview-drawer-v2__trend-point"}
                cx={px}
                cy={py}
                r={index === values.length - 1 ? 5 : 4}
              />
              <text
                className={negative
                  ? "audit-preview-drawer-v2__trend-value audit-preview-drawer-v2__trend-value--negative"
                  : "audit-preview-drawer-v2__trend-value"}
                x={px}
                y={valueY}
                textAnchor="middle"
              >
                {compactMoney(value, language)}
              </text>
              <text
                className="audit-preview-drawer-v2__trend-year"
                x={px}
                y={height - 9}
                textAnchor="middle"
              >
                {years[index]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

interface AuditExplainerDrawerProps {
  explanation: AuditExplanation | null;
  onClose: () => void;
  /** Return to the originating summary when opened from a risk-signal link. */
  onBack?: () => void;
}

export function AuditExplainerDrawer({ explanation, onClose, onBack }: AuditExplainerDrawerProps) {
  const { t: tc } = useTranslation("common");
  const { t, i18n } = useTranslation("audit");
  const [drilldown, setDrilldown] = useState<AuditExplanation | null>(null);

  useEffect(() => {
    setDrilldown(null);
  }, [explanation]);

  if (!explanation) return null;

  const activeExplanation = drilldown ?? explanation;
  const selectedSignalId = activeExplanation.title.match(/^(R-[A-E]\\d+)\\s+—/)?.[1] ?? null;
  const profileInsight = drilldown ? undefined : explanation.candidateInsight;
  const candidateInsight = explanation.candidateInsight;

  const candidateContextRow: TableRow | null = candidateInsight
    ? {
        return_id: candidateInsight.returnId,
        circle: candidateInsight.circle,
        risk_level: candidateInsight.riskLevel,
        data_quality: candidateInsight.dataQuality,
        coverage_tier: candidateInsight.coverageTier,
        signals: candidateInsight.signalIds.join(", "),
        control_flags: candidateInsight.controlFlags.join(", "),
        audit_state: candidateInsight.auditState,
      }
    : null;

  const openCandidateDetail = (field: string, value: string) => {
    if (!candidateContextRow) return;
    const resolved = resolveAuditExplanation(
      field,
      value,
      candidateContextRow,
      i18n.resolvedLanguage,
    );
    if (resolved) setDrilldown(resolved);
  };

  const formatMoney = (value: number) => {
    const locale = i18n.resolvedLanguage?.startsWith("bn") ? "bn-BD" : "en-BD";
    return "৳" + new Intl.NumberFormat(locale, {
      notation: value >= 1_000_000 ? "compact" : "standard",
      maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
    }).format(value);
  };

  const textSection = (title: string, value: string) => (
    <section className="detail-section">
      <h3 className="detail-section__head detail-section__head--static">{title}</h3>
      <div className="drawer-field-grid">
        <div className="drawer-field drawer-field--wide">
          <div className="drawer-field__value">
            <span>{value}</span>
          </div>
        </div>
      </div>
    </section>
  );

  const signalName = (id: string) => {
    const key = `candidates.detail.signalLabels.${id}`;
    const value = t(key);
    return value === key ? id : value;
  };

  return (
    <ResponsiveOverlay
      open
      onClose={onClose}
      onBack={() => { if (drilldown) setDrilldown(null); else (onBack ?? onClose)(); }}
      backLabel={t("initiate.actions.back")}
      title={activeExplanation.title}
      closeLabel={tc("accessibility.closeDrawer")}
      desktopWidth={profileInsight ? "620px" : "540px"}
    >
      <div className="form-stack">
        {profileInsight ? (
          <div className="audit-preview-drawer-v2">
            <section className="audit-preview-drawer-v2__snapshot">
              <div className="audit-preview-drawer-v2__eyebrow">
                {t("initiate.previewDecision.selectionSnapshot")}
              </div>
              <div className="audit-preview-drawer-v2__metrics">
                <button
                  type="button"
                  className="audit-preview-drawer-v2__metric-button"
                  onClick={() => openCandidateDetail("risk_level", profileInsight.riskLevel)}
                >
                  <span>{t("initiate.previewDecision.risk")}</span>
                  <strong>{profileInsight.riskLevel}</strong>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="audit-preview-drawer-v2__metric-button"
                  onClick={() => openCandidateDetail("signals", profileInsight.signalIds.join(", "))}
                  disabled={profileInsight.signalCount === 0}
                >
                  <span>{t("initiate.previewDecision.signals")}</span>
                  <strong>{profileInsight.signalCount}</strong>
                  {profileInsight.signalCount > 0 && <ChevronRight size={14} aria-hidden="true" />}
                </button>
                <div>
                  <span>{t("initiate.previewDecision.financialMismatch")}</span>
                  <strong>{formatMoney(profileInsight.mismatchAmount)}</strong>
                </div>
              </div>
              <p>{t("initiate.previewDecision.screeningOnly")}</p>
            </section>

            <section className="audit-preview-drawer-v2__section">
              <div className="audit-preview-drawer-v2__section-head">
                <h3>{t("initiate.previewDecision.whySelected")}</h3>
                <span>
                  {t("initiate.previewDecision.signalCountShort", { count:profileInsight.signalCount })}
                </span>
              </div>
              {profileInsight.signalIds.length > 0 ? (
                <div className="audit-preview-drawer-v2__signals">
                  {profileInsight.signalIds.map((id) => (
                    <button
                      type="button"
                      className="audit-preview-drawer-v2__signal"
                      key={id}
                      onClick={() => openCandidateDetail("signals", id)}
                    >
                      <strong>{id}</strong>
                      <span>{signalName(id)}</span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="audit-preview-drawer-v2__muted">
                  {t("initiate.previewDecision.noTriggeredSignals")}
                </p>
              )}
            </section>

            {profileInsight.evidenceTrend && (
              <section className="audit-preview-drawer-v2__section audit-preview-drawer-v2__section--visual">
                <div className="audit-preview-drawer-v2__section-head">
                  <h3>{t("candidates.detail.trendTitle")}</h3>
                  <span>{t(profileInsight.evidenceTrend.labelKey)}</span>
                </div>
                <CandidateEvidenceTrendChart
                  years={profileInsight.evidenceTrend.years}
                  values={profileInsight.evidenceTrend.values}
                  label={t(profileInsight.evidenceTrend.labelKey)}
                  language={i18n.resolvedLanguage ?? "en"}
                />
              </section>
            )}

            <section className="audit-preview-drawer-v2__section">
              <div className="audit-preview-drawer-v2__section-head">
                <h3>{t("initiate.previewDecision.screeningContext")}</h3>
              </div>
              <div className="audit-preview-drawer-v2__context">
                <button
                  type="button"
                  onClick={() => openCandidateDetail("data_quality", profileInsight.dataQuality)}
                >
                  <span>
                    <span className="audit-preview-drawer-v2__context-label">{t("initiate.fields.dataQuality")}</span>
                    <strong>{profileInsight.dataQuality}</strong>
                  </span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => openCandidateDetail("coverage_tier", profileInsight.coverageTier)}
                >
                  <span>
                    <span className="audit-preview-drawer-v2__context-label">{t("initiate.fields.coverageTier")}</span>
                    <strong>{profileInsight.coverageTier}</strong>
                  </span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => openCandidateDetail("circle", profileInsight.circle)}
                >
                  <span>
                    <span className="audit-preview-drawer-v2__context-label">{t("initiate.previewDecision.circle")}</span>
                    <strong>{profileInsight.circle}</strong>
                  </span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => openCandidateDetail("audit_state", profileInsight.auditState)}
                >
                  <span>
                    <span className="audit-preview-drawer-v2__context-label">{t("initiate.previewDecision.auditStatus")}</span>
                    <strong>
                      {profileInsight.auditState === "Not Started"
                        ? t("initiate.previewDecision.available")
                        : profileInsight.auditState}
                    </strong>
                  </span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
                <div>
                  <span className="audit-preview-drawer-v2__context-label">{t("initiate.previewDecision.returnId")}</span>
                  <strong>{profileInsight.returnId}</strong>
                </div>
                {profileInsight.controlFlags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => openCandidateDetail("control_flags", profileInsight.controlFlags.join(", "))}
                  >
                    <span>
                      <span className="audit-preview-drawer-v2__context-label">{t("initiate.previewDecision.controlFlags")}</span>
                      <strong>{profileInsight.controlFlags.join(", ")}</strong>
                    </span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            </section>

            <details className="audit-preview-drawer-v2__details">
              <summary>{t("initiate.previewDecision.moreEvidenceDetails")}</summary>
              <div className="audit-preview-drawer-v2__details-body">
                <div className="audit-preview-drawer-v2__note">
                  <strong>{t("explainer.whatItMeans")}</strong>
                  <p>{activeExplanation.definition}</p>
                </div>
                <div className="audit-preview-drawer-v2__note">
                  <strong>{t("explainer.whatItAffects")}</strong>
                  <p>{activeExplanation.effect}</p>
                </div>

                {activeExplanation.sections.map((section, sectionIndex) => (
                  <section className="audit-preview-drawer-v2__evidence" key={`${section.title}-${sectionIndex}`}>
                    <h4>{section.title}</h4>
                    <dl>
                      {section.items.map((item, itemIndex) => (
                        <div key={`${item.label}-${itemIndex}`}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}

                {activeExplanation.nextStep && (
                  <div className="audit-preview-drawer-v2__note">
                    <strong>{t("explainer.nextStep")}</strong>
                    <p>{activeExplanation.nextStep}</p>
                  </div>
                )}
                {activeExplanation.important && (
                  <div className="audit-preview-drawer-v2__note">
                    <strong>{t("explainer.important")}</strong>
                    <p>{activeExplanation.important}</p>
                  </div>
                )}
              </div>
            </details>
          </div>
        ) : (
          <>
            {textSection(t("explainer.whatItMeans"), activeExplanation.definition)}
            {selectedSignalId && (
              <AuditSignalLogicFlow signalId={selectedSignalId} language={i18n.resolvedLanguage ?? "en"} />
            )}
            {textSection(t("explainer.whatItAffects"), activeExplanation.effect)}

            {activeExplanation.sections.map((section, sectionIndex) => (
              <section className="detail-section" key={`${section.title}-${sectionIndex}`}>
                <h3 className="detail-section__head detail-section__head--static">{section.title}</h3>
                <div className="drawer-field-grid">
                  {section.items.map((item, itemIndex) => {
                    const shouldSpan = section.items.length % 2 === 1 && itemIndex === section.items.length - 1;
                    return (
                      <div
                        className={`drawer-field${shouldSpan ? " drawer-field--wide" : ""}`}
                        key={`${item.label}-${item.value}`}
                      >
                        <span className="drawer-field__label">{item.label}</span>
                        <div className="drawer-field__value">
                          <span>{item.value}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            {activeExplanation.nextStep && textSection(t("explainer.nextStep"), activeExplanation.nextStep)}
            {activeExplanation.important && textSection(t("explainer.important"), activeExplanation.important)}
          </>
        )}
      </div>
    </ResponsiveOverlay>
  );
}
