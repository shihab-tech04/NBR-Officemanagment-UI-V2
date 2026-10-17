/** Localize presentation only; identifiers and stored values must remain intact. */
export function displayLocale(language?: string): string { return language?.toLowerCase().startsWith("bn") ? "bn-BD" : "en-GB"; }
export function formatLocalizedDateTime(iso: string, language?: string, timeZone?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(displayLocale(language), {day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",...(timeZone ? {timeZone} : {})}).format(date);
}
export function formatLocalizedDate(iso: string, language?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(displayLocale(language), {day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(date);
}
export function formatLocalizedNumber(value: number, language?: string): string { return new Intl.NumberFormat(displayLocale(language)).format(value); }
export function formatLocalizedCurrency(amount: number, language?: string): string { return `৳${new Intl.NumberFormat(language?.startsWith("bn") ? "bn-BD" : "en-BD").format(amount)}`; }
export function formatLocalizedPercent(value: number, language?: string): string { return `${formatLocalizedNumber(value, language)}%`; }
