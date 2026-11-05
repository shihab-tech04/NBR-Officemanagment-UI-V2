type AuditYearAvailabilityNoticeProps = {
  selectedYear: string;
  availableYears: string[];
  language: string | undefined;
  onSelectYear: (year: string) => void;
};

/**
 * Never substitute another assessment year's records for the selected year.
 * Offer a deliberate, reversible switch when the current AY has no records.
 */
export function AuditYearAvailabilityNotice({
  selectedYear, availableYears, language, onSelectYear,
}: AuditYearAvailabilityNoticeProps) {
  const suggestedYear = availableYears.find((year) => year !== selectedYear);
  if (availableYears.includes(selectedYear) || !suggestedYear) return null;
  const isBn = language?.startsWith("bn");
  return (
    <div role="status" className="form-helper">
      {isBn
        ? `মূল্যায়ন বছর ${selectedYear}-এর জন্য কোনো অডিট রেকর্ড লোড করা নেই। ${suggestedYear} বছরের রেকর্ড রয়েছে। `
        : `No Audit records are loaded for AY ${selectedYear}. Records are available for AY ${suggestedYear}. `}
      <button
        type="button"
        className="table-card__toolbar-btn"
        onClick={() => onSelectYear(suggestedYear)}
      >
        {isBn ? `${suggestedYear} বছরের রেকর্ড দেখুন` : `View AY ${suggestedYear} records`}
      </button>
    </div>
  );
}
