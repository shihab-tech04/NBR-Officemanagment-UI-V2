/**
 * Canonical Supabase Auth confirmation destination.
 * Never derive a hosted email redirect from a development server origin:
 * a localhost sign-up confirmation must return to the published Office login.
 *
 * Supabase Auth > URL Configuration must also allow this exact URL.
 */
export const OFFICE_AUTH_CALLBACK_URL =
  'https://shihab-tech04.github.io/NBR-Officemanagment-UI-V2/payments/transactions' as const;
