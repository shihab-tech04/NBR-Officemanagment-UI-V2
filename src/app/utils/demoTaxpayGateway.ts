/** Restricted demonstration-only navigation. A user ID here is NOT authentication. */
const TAXPAY_PUBLIC_URL = 'https://shihab-tech04.github.io/nbr-taxpay/';
export function getTaxPayDemoLoginUrl(userId: string): string | null {
  const normalized = userId.trim().toLowerCase();
  if (!/^user(?:10|[1-9])$/.test(normalized)) return null;
  const url = new URL(TAXPAY_PUBLIC_URL);
  url.searchParams.set('action', 'taxpayer_home');
  url.searchParams.set('demoUser', normalized);
  return url.toString();
}
