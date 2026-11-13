import { useMemo } from "react";
import type { TableRow } from "../modulePageUtils";
import type { OfficeJourneyEvidenceEvent } from "./officeTaxJourneyEvidence";

export type OfficeJourneyEntry = { record: TableRow; occurredAt: string };
type TimelineItem =
  | { kind: "payment"; id: string; occurredAt: string; record: TableRow }
  | { kind: "evidence"; id: string; occurredAt: string; evidence: OfficeJourneyEvidenceEvent };

export function OfficeTaxJourney({
  entries, evidenceEvents = [], language, onOpen,
  paymentsLoading = false, paymentsError = "",
  profileLoading = false, profileError = "",
  correctionsLoading = false, correctionsError = "", correctionsAvailable,
}: {
  entries: readonly OfficeJourneyEntry[];
  evidenceEvents?: readonly OfficeJourneyEvidenceEvent[];
  language: "en" | "bn";
  onOpen: (row: TableRow) => void;
  paymentsLoading?: boolean;
  paymentsError?: string;
  profileLoading?: boolean;
  profileError?: string;
  correctionsLoading?: boolean;
  correctionsError?: string;
  correctionsAvailable?: boolean;
}) {
  const bn = language === "bn";
  const tr = (en: string, bengali: string) => bn ? bengali : en;
  const grouped = useMemo(() => {
    const rows: TimelineItem[] = [
      ...entries.map((entry) => ({
        kind: "payment" as const,
        id: "payment:" + String(entry.record.payment_ref ?? entry.record.key ?? ""),
        occurredAt: entry.occurredAt,
        record: entry.record,
      })),
      ...evidenceEvents.map((evidence) => ({
        kind: "evidence" as const,
        id: evidence.id,
        occurredAt: evidence.occurredAt,
        evidence,
      })),
    ];
    rows.sort((a, b) => {
      const left = Date.parse(a.occurredAt), right = Date.parse(b.occurredAt);
      return (Number.isFinite(right) ? right : -Infinity) -
        (Number.isFinite(left) ? left : -Infinity) || a.id.localeCompare(b.id);
    });
    const groups = new Map<string, TimelineItem[]>();
    for (const item of rows) {
      const time = Date.parse(item.occurredAt);
      const year = Number.isFinite(time)
        ? new Date(time).getUTCFullYear().toString()
        : tr("Date unavailable", "তারিখ পাওয়া যায়নি");
      groups.set(year, [...(groups.get(year) ?? []), item]);
    }
    return [...groups.entries()];
  }, [entries, evidenceEvents, language]);

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat(bn ? "bn-BD" : "en-GB", {
          day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka",
        }).format(date)
      : tr("Date unavailable", "তারিখ পাওয়া যায়নি");
  };
  const sourceReadsComplete = !paymentsLoading && !paymentsError &&
    !profileLoading && !profileError && !correctionsLoading && !correctionsError &&
    correctionsAvailable !== false;

  return <section className="card payment-module__card" data-testid="office-tax-journey">
    <header className="mb-4">
      <h2 className="text-lg font-semibold">{tr("Tax journey", "কর যাত্রা")}</h2>
      <p className="table-page__desc">{tr(
        "Recorded payments, verified Taxpayer SQL profile dates, and acknowledged Office correction events in date order. Select a payment to view its allocation details.",
        "তারিখ অনুযায়ী নথিভুক্ত পেমেন্ট, যাচাইকৃত করদাতা SQL প্রোফাইলের তারিখ এবং অফিসে স্বীকৃত সংশোধনের ঘটনা। বরাদ্দের বিস্তারিত দেখতে পেমেন্ট নির্বাচন করুন।",
      )}</p>
      <p className="table-page__desc">{tr(
        "Financial settlement and tax credits are not verified by this payment record.",
        "এই পেমেন্ট রেকর্ড দিয়ে আর্থিক নিষ্পত্তি বা কর ক্রেডিট যাচাই করা যায় না.",
      )}</p>
    </header>
    {paymentsLoading && <p role="status" className="table-page__desc">{tr("Loading payment history…", "পেমেন্ট ইতিহাস লোড হচ্ছে…")}</p>}
    {paymentsError && <p role="alert" className="table-page__desc">{paymentsError}</p>}
    {correctionsLoading && <p role="status" className="table-page__desc">{tr("Loading correction history…", "সংশোধন ইতিহাস লোড হচ্ছে…")}</p>}
    {correctionsError && <p role="alert" className="table-page__desc">{correctionsError}</p>}
    {!correctionsLoading && !correctionsError && correctionsAvailable === false &&
      <p role="status" className="table-page__desc">{tr(
        "Correction history is unavailable in this Office session.",
        "এই অফিস সেশনে সংশোধন ইতিহাস পাওয়া যাচ্ছে না.",
      )}</p>}
    {sourceReadsComplete && entries.length === 0 && evidenceEvents.length === 0
      ? <p role="status" className="table-page__desc">{tr(
          "No payment records for this taxpayer and assessment year; no verified registration or correction events are available.",
          "এই করদাতা ও করবর্ষের কোনো পেমেন্ট রেকর্ড নেই; যাচাইকৃত নিবন্ধন বা সংশোধনের ঘটনাও নেই।",
        )}</p>
      : <div className="space-y-6">
          {grouped.map(([year, items]) => <section key={year} aria-label={year}>
            <h3 className="mb-3 text-xl font-semibold">{year}</h3>
            <ol className="space-y-0" aria-label={tr("Tax history events", "কর ইতিহাসের ঘটনা")}>
              {items.map((item) => <li key={item.id}
                className="grid grid-cols-[95px_minmax(0,1fr)] gap-3 sm:grid-cols-[145px_minmax(0,1fr)]"
                data-event-kind={item.kind}>
                <time dateTime={item.occurredAt}
                  className="pt-1 text-right text-xs text-slate-500">{formatDate(item.occurredAt)}</time>
                <div className="relative border-l-2 border-slate-200 pb-5 pl-5 last:pb-0">
                  <span aria-hidden="true" className={"absolute -left-[6px] top-1.5 h-2.5 w-2.5 rounded-full " +
                    (item.kind === "payment" ? "bg-teal-700" : "bg-indigo-700")} />
                  {item.kind === "payment" ? (() => {
                    const record = item.record;
                    const parentId = String(record.payment_ref ?? record.key ?? "—");
                    return <button type="button"
                      className="min-h-11 w-full rounded-lg p-1 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      onClick={() => onOpen(record)}
                      aria-label={tr("View payment details ", "পেমেন্টের বিস্তারিত দেখুন ") + parentId}>
                      <span className="block break-words text-sm font-semibold">
                        {String(record.payment_type ?? tr("Payment", "পেমেন্ট"))} · {String(record.amount ?? "—")}
                      </span>
                      <span className="mt-1 block break-words text-xs text-slate-600">
                        {tr("AY ", "করবর্ষ ")}{String(record.assessment_year ?? "—")} · {String(record.financial_receipt_status ?? "—")}
                      </span>
                      <span className="mt-1 block break-all text-xs text-slate-500">
                        Office SQL mirror · immutable payment parent {parentId} · {tr("Tax credit not verified", "কর ক্রেডিট যাচাই হয়নি")}
                      </span>
                    </button>;
                  })() : <div className="min-h-11 rounded-lg p-1">
                    <span className="block break-words text-sm font-semibold">
                      {bn ? item.evidence.titleBn : item.evidence.titleEn}
                    </span>
                    <span className="mt-1 block break-words text-xs text-slate-600">
                      {bn ? item.evidence.detailBn : item.evidence.detailEn}
                    </span>
                    <span className="mt-1 block break-all text-xs text-slate-500">
                      {bn ? item.evidence.provenanceBn : item.evidence.provenanceEn}
                    </span>
                  </div>}
                </div>
              </li>)}
            </ol>
          </section>)}
        </div>}
  </section>;
}
