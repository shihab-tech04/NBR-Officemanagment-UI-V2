import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * One publishable-only CMS session shared by the existing Office sign-in
 * and the Content Management page. SQL RPCs/RLS remain the authority.
 * A presentation-only Office login cannot grant publishing permissions.
 */
let client: SupabaseClient | null = null;
let publicClient: SupabaseClient | null = null;

export function getTaxPayCmsClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_TAXPAY_CMS_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_TAXPAY_CMS_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !/^https:\/\/[^/]+\.supabase\.co$/.test(url) ||
      !key || key.startsWith('sb_secret_') || key.includes('service_role')) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
        storageKey: 'nbr-office-taxpay-cms-session' },
    });
  }
  return client;
}

/**
 * Deliberately session-free viewer for verifying exactly what the public
 * TaxPay client can read after an Office publish. It never reuses Office
 * credentials, authorization headers or browser session storage.
 */
export function getTaxPayCmsPublicClient(): SupabaseClient | null {
  const url = import.meta.env.VITE_TAXPAY_CMS_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_TAXPAY_CMS_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !/^https:\/\/[^/]+\.supabase\.co$/.test(url) ||
      !key || key.startsWith('sb_secret_') || key.includes('service_role')) return null;
  if (!publicClient) {
    publicClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
        storageKey: 'nbr-office-taxpay-public-readback' },
    });
  }
  return publicClient;
}
