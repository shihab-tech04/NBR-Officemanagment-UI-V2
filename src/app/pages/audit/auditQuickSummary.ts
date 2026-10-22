import type { TableRow } from "../modulePageUtils";
import type { AuditCandidateRecord } from "./auditCandidateStore";

export const QUICK_SUMMARY_MAX_CHARACTERS = 350;

type Translator = (key: string, options?: Record<string, unknown>) => string;

function clipped(value: unknown, max: number): string {
  const normalized = String(value ?? "—").replace(/\s+/g, " ").trim() || "—";
  const characters = Array.from(normalized);
  return characters.length > max ? characters.slice(0, max - 1).join("").trimEnd() + "…" : normalized;
}

function visibleLength(value: string): number {
  return Array.from(value).length;
}

/**
 * Generates a non-executable, read-only summary solely from the selected
 * candidate's loaded fields. This does not call a model or external service,
 * infer liability, or turn screening signals into audit findings.
 */
export function buildAuditQuickSummary(
  candidate: AuditCandidateRecord,
  source: TableRow | undefined,
  t: Translator,
  language: string,
): string {
  const prefix = "candidates.detail.quickSummary";
  const signalIds = Array.from(new Set(String(candidate.signals ?? "").match(/R-[A-E]\d/g) ?? []));
  const firstSignals = signalIds.slice(0, 2);
  const signalDescriptions = firstSignals.map((code) =>
    `${code} (${t(prefix + ".signalShort." + code)})`,
  );
  const listedSignals = signalDescriptions.join(", ") +
    (signalIds.length > 2
      ? t("candidates.detail.quickSummary.moreSignals", { count: signalIds.length - 2 })
      : "");
  const lead = t(prefix + ".lead", {
    name: clipped(candidate.taxpayer_name, 48),
    year: clipped(candidate.assessment_year, 12),
    circle: clipped(candidate.circle, 20),
    risk: clipped(candidate.risk_level, 22),
    status: clipped(candidate.audit_status, 26),
  });
  const indicators = signalIds.length
    ? t(prefix + ".indicators", { indicators: listedSignals })
    : t(prefix + ".noIndicators");
  const shortIndicators = signalIds.length
    ? t(prefix + ".shortIndicators", { codes: signalIds.join(", ") })
    : t(prefix + ".noIndicators");
  const actionEvidence = firstSignals.length
    ? t(`candidates.detail.auditNote.actions.${firstSignals[0]}`)
    : t("candidates.detail.auditNote.defaultEvidence");
  const action = t(prefix + ".action", { evidence: clipped(actionEvidence, 65) });
  const coverage = t(prefix + ".coverage", {
    quality: clipped(source?.data_quality ?? candidate.data_quality, 22),
    tier: clipped(candidate.coverage_tier, 12),
  });
  const rawDifference = source?.mismatch_amount;
  const difference = Number(rawDifference);
  const hasGap = firstSignals.some((s) => s === "R-C1" || s === "R-C2")
    && rawDifference !== null && rawDifference !== undefined
    && String(rawDifference).trim() !== "" && Number.isFinite(difference)
    && difference > 0;
  const amount = new Intl.NumberFormat(language.startsWith("bn") ? "bn-BD" : "en-BD", {
    maximumFractionDigits: 0,
  }).format(difference);
  const illustrativeDifference = hasGap
    ? t(prefix + ".difference", { amount })
    : "";
  const note = t(prefix + ".disclaimer");
  const join = (parts: string[]) => parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  // Favor actionable, sourced information over arbitrary text truncation.
  const variants = [
    [lead, indicators, illustrativeDifference, coverage, action, note],
    [lead, indicators, illustrativeDifference, action, note],
    [lead, indicators, coverage, action, note],
    [lead, indicators, action, note],
    [lead, shortIndicators, action, note],
    [lead, shortIndicators, note],
    [lead, note],
  ];
  const firstFitting = variants.map(join).find((text) =>
    visibleLength(text) <= QUICK_SUMMARY_MAX_CHARACTERS);
  if (firstFitting) return firstFitting;

  // Custom candidate values can be exceptionally long: preserve the caution.
  const available = Math.max(0, QUICK_SUMMARY_MAX_CHARACTERS - visibleLength(note) - 1);
  const shortened = Array.from(lead).slice(0, available).join("").trimEnd();
  return join([shortened, note]);
}
