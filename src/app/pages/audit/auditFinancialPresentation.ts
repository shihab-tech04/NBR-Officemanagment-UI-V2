/** Audit financial presentation: no inferred tax liability or official data. */
export function crossesBalanceSign(current: number, previous: number): boolean {
  return (current < 0 && previous >= 0) || (current >= 0 && previous < 0);
}
export function formatFinancialChange(current: number, previous: number, language = "en"): string {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "—";
  const locale = language.startsWith("bn") ? "bn-BD" : "en-BD";
  const n = (value: number, decimals: number) => new Intl.NumberFormat(locale, {
    maximumFractionDigits: decimals,
  }).format(value);
  if (crossesBalanceSign(current, previous) || previous === 0) {
    const delta = current - previous;
    const sign = delta < 0 ? "−" : delta > 0 ? "+" : "";
    return sign + "৳" + n(Math.abs(delta), 0);
  }
  const percentage = ((current - previous) / Math.abs(previous)) * 100;
  return (percentage > 0 ? "+" : "") + n(percentage, 1) + "%";
}
export function fundFlowReconciliation(source: number, outflow: number, displayedDifference: number) {
  const difference = source - outflow;
  return {
    difference,
    verifiedWithinModel: [source, outflow, displayedDifference].every(Number.isFinite)
      && Math.abs(difference - displayedDifference) < 1,
  };
}
