import type { OfficeCorrectionDecisionEvent, CorrectionReviewAction } from "./correctionReviewApi";
import type { LinkedTaxpayerCorrection } from "./officeTaxpayerCorrections";
import type { TaxpayerRegistrationProfile } from "./officeTaxpayerRegistrationProfiles";

export type OfficeJourneyEvidenceEvent = {
  id: string;
  occurredAt: string;
  titleEn: string;
  titleBn: string;
  detailEn: string;
  detailBn: string;
  provenanceEn: string;
  provenanceBn: string;
};

const eventTime = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};

/** Only canonical, non-synthetic Taxpayer SQL dates enter the Office timeline. */
export function registrationHistoryEvents(
  profile: TaxpayerRegistrationProfile | null | undefined,
): OfficeJourneyEvidenceEvent[] {
  if (!profile || !["NBR_TIN", "REVIEWED_CERTIFICATE"].includes(profile.profile.source)) return [];
  const source = profile.profile.source;
  const provenanceEn = "Original Taxpayer SQL profile · source " + source +
    " · revision " + profile.revision + " · TIN " + profile.tin;
  const provenanceBn = "মূল করদাতা SQL প্রোফাইল · উৎস " + source +
    " · সংস্করণ " + profile.revision + " · TIN " + profile.tin;
  const candidates = [
    {
      key: "registration",
      value: profile.profile.registeredOn,
      titleEn: "TIN registration date recorded",
      titleBn: "টিআইএন নিবন্ধনের তারিখ নথিভুক্ত",
      detailEn: "Date held by the verified taxpayer registration profile.",
      detailBn: "যাচাইকৃত করদাতা নিবন্ধন প্রোফাইলে থাকা তারিখ।",
    },
    {
      key: "certificate-issue",
      value: profile.profile.certificateIssuedOn,
      titleEn: "TIN certificate issue date recorded",
      titleBn: "টিআইএন সনদ ইস্যুর তারিখ নথিভুক্ত",
      detailEn: "Issue date held by the verified taxpayer registration profile.",
      detailBn: "যাচাইকৃত করদাতা নিবন্ধন প্রোফাইলে থাকা ইস্যুর তারিখ।",
    },
  ];
  return candidates.flatMap((candidate) => {
    const occurredAt = eventTime(candidate.value);
    return occurredAt ? [{
      id: "profile:" + profile.tin + ":" + profile.revision + ":" + candidate.key,
      occurredAt,
      titleEn: candidate.titleEn,
      titleBn: candidate.titleBn,
      detailEn: candidate.detailEn,
      detailBn: candidate.detailBn,
      provenanceEn,
      provenanceBn,
    }] : [];
  });
}

const actionLabels: Record<CorrectionReviewAction, readonly [string, string]> = {
  MAKER_ACKNOWLEDGE: ["Maker acknowledged", "মেকার স্বীকৃতি দিয়েছেন"],
  REVIEWER_VERIFY: ["Reviewer verified", "রিভিউয়ার যাচাই করেছেন"],
  APPROVER_CLOSE: ["Approver closed", "অনুমোদনকারী বন্ধ করেছেন"],
  REJECT: ["Correction rejected", "সংশোধন আবেদন প্রত্যাখ্যাত"],
};
const roleLabels: Record<OfficeCorrectionDecisionEvent["role"], readonly [string, string]> = {
  MAKER: ["Maker", "মেকার"],
  REVIEWER: ["Reviewer", "রিভিউয়ার"],
  APPROVER: ["Approver", "অনুমোদনকারী"],
};

/** Cases are already matched to exact immutable payment parents and allocated TIN/AY. */
export function correctionHistoryEvents(
  corrections: readonly LinkedTaxpayerCorrection[],
): OfficeJourneyEvidenceEvent[] {
  const events: OfficeJourneyEvidenceEvent[] = [];
  const seen = new Set<string>();
  for (const linked of corrections) {
    const inquiry = linked.inquiry;
    const requestId = inquiry.requestId;
    const parentId = linked.payment.id;
    if (!requestId || !parentId) continue;
    const caseSourceEn = "Office SQL correction case " + requestId +
      " · immutable Taxpayer SQL payment parent " + parentId;
    const caseSourceBn = "অফিস SQL সংশোধন কেস " + requestId +
      " · অপরিবর্তনীয় করদাতা SQL পেমেন্ট প্যারেন্ট " + parentId;
    const createdAt = eventTime(inquiry.createdAt);
    const requestEventId = "correction-request:" + requestId;
    if (createdAt && !seen.has(requestEventId)) {
      seen.add(requestEventId);
      events.push({
        id: requestEventId,
        occurredAt: createdAt,
        titleEn: "Correction request recorded",
        titleBn: "সংশোধনের আবেদন নথিভুক্ত",
        detailEn: "Original payment remains unchanged; case " + requestId + ".",
        detailBn: "মূল পেমেন্ট অপরিবর্তিত; কেস " + requestId + "।",
        provenanceEn: caseSourceEn,
        provenanceBn: caseSourceBn,
      });
    }
    for (const decision of inquiry.decisionHistory ?? []) {
      if (decision.deliveryState !== "ACKNOWLEDGED") continue;
      const occurredAt = eventTime(decision.occurredAt);
      const eventId = "correction-decision:" + decision.messageId;
      if (!occurredAt || seen.has(eventId)) continue;
      const action = actionLabels[decision.action];
      const role = roleLabels[decision.role];
      seen.add(eventId);
      events.push({
        id: eventId,
        occurredAt,
        titleEn: "Office correction decision acknowledged",
        titleBn: "অফিস সংশোধন সিদ্ধান্ত স্বীকৃত",
        detailEn: action[0] + " · role " + role[0] + " · case " + requestId,
        detailBn: action[1] + " · ভূমিকা " + role[1] + " · কেস " + requestId,
        provenanceEn: "Office SQL acknowledged outbox message " + decision.messageId +
          " · case " + requestId + " · immutable Taxpayer SQL payment parent " + parentId,
        provenanceBn: "অফিস SQL স্বীকৃত outbox বার্তা " + decision.messageId +
          " · কেস " + requestId + " · অপরিবর্তনীয় করদাতা SQL পেমেন্ট প্যারেন্ট " + parentId,
      });
    }
  }
  return events.sort((a, b) =>
    Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.id.localeCompare(b.id));
}
