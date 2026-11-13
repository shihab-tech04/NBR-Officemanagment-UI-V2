import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OfficeTaxJourney } from "../OfficeTaxJourney";
import { correctionHistoryEvents, registrationHistoryEvents } from "../officeTaxJourneyEvidence";
import type { OfficeJourneyEvidenceEvent } from "../officeTaxJourneyEvidence";
import type { LinkedTaxpayerCorrection } from "../officeTaxpayerCorrections";
import type { TaxpayerRegistrationProfile } from "../officeTaxpayerRegistrationProfiles";
import type { TableRow } from "../../modulePageUtils";

const oldRow = { key: "old", payment_ref: "old-sql-id", payment_type: "Tax with Return", amount: "৳80.00",
  assessment_year: "2025-26", financial_receipt_status: "Payment record saved" } as TableRow;
const newerRow = { key: "new", payment_ref: "new-sql-id", payment_type: "Advance Tax", amount: "৳15.00",
  assessment_year: "2026-27", financial_receipt_status: "PENDING" } as TableRow;

const taxpayerProfile = (source: string) => ({
  accountId: "office-profile-account",
  tin: "123456789012",
  revision: 4,
  updatedAt: "2026-11-12T10:00:00.000Z",
  profile: {
    tin: "123456789012",
    taxpayerName: "Test Taxpayer",
    registeredOn: "2020-01-02",
    certificateIssuedOn: "2020-01-03",
    source,
    sourceUpdatedAt: "2026-11-12T10:00:00.000Z",
  },
}) as unknown as TaxpayerRegistrationProfile;

const linkedCorrection = [{
  inquiry: {
    requestId: "80000000-0000-4000-8000-000000000041",
    sourceEventId: "80000000-0000-4000-8000-000000000050",
    sourceEventType: "CORRECTION_SUBMITTED",
    changeKind: "CIRCLE",
    oldValue: "Circle A",
    newValue: "Circle B",
    createdAt: "2026-11-10T09:00:00.000Z",
    decisionHistory: [
      { messageId: "80000000-0000-4000-8000-000000000051",
        action: "MAKER_ACKNOWLEDGE", role: "MAKER",
        occurredAt: "2026-11-10T10:00:00.000Z", deliveryState: "ACKNOWLEDGED" },
      { messageId: "80000000-0000-4000-8000-000000000052",
        action: "REVIEWER_VERIFY", role: "REVIEWER",
        occurredAt: "2026-11-10T11:00:00.000Z", deliveryState: "PENDING" },
    ],
  },
  payment: { id: "80000000-0000-4000-8000-000000000061" },
}] as unknown as LinkedTaxpayerCorrection[];

describe("Office taxpayer Tax Journey", () => {
  it("shows SQL payment records across calendar years, newest first, without implying settlement", () => {
    const html = renderToStaticMarkup(<OfficeTaxJourney language="en" onOpen={() => {}}
      entries={[
        { record: oldRow, occurredAt: "2025-09-09T10:00:00Z" },
        { record: newerRow, occurredAt: "2026-11-02T06:00:00Z" },
      ]} />);
    expect((html.match(/<li /g) || []).length).toBe(2);
    expect(html).toContain("2026");
    expect(html).toContain("2025");
    expect(html.indexOf("new-sql-id")).toBeLessThan(html.indexOf("old-sql-id"));
    expect(html).toContain("Tax credit not verified");
    expect(html).toContain("Office SQL mirror");
    expect(html).toContain("Recorded payer:");
    expect(html).toContain("paid for");
    expect(html).not.toContain("Treasury settled");
  });

  it("does not invent an event when no records are available", () => {
    const html = renderToStaticMarkup(<OfficeTaxJourney entries={[]} language="bn" onOpen={() => {}}
      correctionsAvailable />);
    expect(html).toContain("কোনো পেমেন্ট রেকর্ড নেই");
    expect(html).not.toContain("<li ");
  });

  it("includes only registration and certificate dates from canonical, non-synthetic profiles", () => {
    const verified = registrationHistoryEvents(taxpayerProfile("NBR_TIN"));
    expect(verified).toHaveLength(2);
    expect(verified[0].titleEn).toContain("registration date");
    expect(verified[1].titleEn).toContain("certificate issue date");
    expect(verified.every(event => event.provenanceEn.includes("Original Taxpayer SQL profile"))).toBe(true);
    expect(registrationHistoryEvents(taxpayerProfile("SYNTHETIC"))).toEqual([]);
  });

  it("includes source IDs, request values as unverified, and only acknowledged decisions", () => {
    const events = correctionHistoryEvents(linkedCorrection);
    expect(events).toHaveLength(2);
    expect(events.some(event => event.id.includes("correction-request:"))).toBe(true);
    expect(events.some(event => event.id.includes("correction-decision:80000000-0000-4000-8000-000000000051"))).toBe(true);
    expect(events.every(event => event.provenanceEn.includes("Taxpayer SQL source event"))).toBe(true);
    expect(events.every(event => event.provenanceEn.includes("Office SQL correction case"))).toBe(true);
    expect(events.every(event => event.provenanceEn.includes("immutable Taxpayer SQL payment parent"))).toBe(true);
    expect(events[0].detailEn).toContain("not verified as a completed change");
    expect(events.some(event => event.provenanceEn.includes("000000000052"))).toBe(false);
  });

  it("renders provenance for merged payment and historic source events", () => {
    const evidence: OfficeJourneyEvidenceEvent[] = [{
      id: "profile:registration",
      occurredAt: "2025-02-01T00:00:00.000Z",
      titleEn: "TIN registration date recorded",
      titleBn: "টিআইএন নিবন্ধনের তারিখ নথিভুক্ত",
      detailEn: "Verified profile date",
      detailBn: "যাচাইকৃত প্রোফাইল তারিখ",
      provenanceEn: "Original Taxpayer SQL profile · source NBR_TIN",
      provenanceBn: "মূল করদাতা SQL প্রোফাইল · উৎস NBR_TIN",
    }];
    const html = renderToStaticMarkup(<OfficeTaxJourney entries={[
      { record: newerRow, occurredAt: "2026-11-02T06:00:00Z" },
    ]} evidenceEvents={evidence} language="en" onOpen={() => {}}
      correctionsAvailable />);
    expect(html.indexOf("new-sql-id")).toBeLessThan(html.indexOf("TIN registration date recorded"));
    expect(html).toContain("Original Taxpayer SQL profile");
    expect(html).toContain("Office SQL mirror");
  });
});
