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


/**
 * The original Office CMS used supabase-js's default storage key. Moving to
 * the isolated Office key in November disconnected any previously signed-in
 * publisher without signing the user out. Recover only that exact project's
 * older session, and only after server Auth + the existing SQL role check.
 *
 * A password-free Office preview does NOT gain publishing permission here.
 * Invalid, unrelated, or revoked sessions never become publishing sessions.
 */
let legacyRecovery: Promise<boolean> | null = null;

export async function restorePreviouslyVerifiedCmsSession(): Promise<boolean> {
  const cms = getTaxPayCmsClient();
  if (!cms || typeof window === 'undefined') return false;

  const { data: existing, error: existingError } = await cms.auth.getSession();
  if (existingError || existing.session) return false;
  if (legacyRecovery) return legacyRecovery;

  legacyRecovery = (async () => {
    const url = import.meta.env.VITE_TAXPAY_CMS_SUPABASE_URL as string;
    const legacyKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
    let original: string | null;
    try { original = window.localStorage.getItem(legacyKey); }
    catch { return false; }
    if (!original) return false;

    let tokens: { access_token?: unknown; refresh_token?: unknown };
    try { tokens = JSON.parse(original) as typeof tokens; }
    catch { return false; }
    if (typeof tokens.access_token !== 'string' || !tokens.access_token ||
        typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) return false;

    let sessionInstalled = false;
    try {
      // The tokens came from the OLD Office client's project-local storage,
      // not from an unverified Office UI marker or user metadata.
      const { data: recovered, error: recoverError } = await cms.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (recoverError || !recovered.session?.user?.id) throw new Error('Prior session expired');
      sessionInstalled = true;

      // Both checks are server-authoritative; neither trusts cached JWT roles.
      const { data: verified, error: userError } = await cms.auth.getUser();
      if (userError || !verified.user || verified.user.is_anonymous ||
          verified.user.id !== recovered.session.user.id) {
        throw new Error('Prior account could not be verified');
      }
      const { data: allowed, error: permissionError } =
        await cms.rpc('taxpay_is_verified_portal_admin');
      if (permissionError || allowed !== true) throw new Error('Prior account cannot publish');

      // Prevent the legacy client and the isolated client competing to rotate
      // the same refresh token. Never erase a concurrently changed storage key.
      try {
        if (window.localStorage.getItem(legacyKey) === original) {
          window.localStorage.removeItem(legacyKey);
        }
      } catch { /* Verified new session remains valid without cleanup. */ }
      return true;
    } catch {
      if (sessionInstalled) {
        await cms.auth.signOut({ scope: 'local' }).catch(() => undefined);
      }
      return false;
    }
  })();

  return legacyRecovery;
}


/**
 * Verified Office entry and CMS publishing use one server-validated identity.
 * The local office_ui_entered marker is NEVER a publishing credential.
 * A previously authenticated publisher can return without entering a password
 * again, but a preview-only Office entry cannot be promoted to a publisher.
 */
export async function hasVerifiedCmsPublisherSession(): Promise<boolean> {
  const cms = getTaxPayCmsClient();
  if (!cms) return false;
  const { data: { user }, error } = await cms.auth.getUser();
  if (error || !user || user.is_anonymous) {
    // Use only the prior CMS project's real Auth tokens, if still valid.
    return restorePreviouslyVerifiedCmsSession();
  }
  const { data: permitted, error: permissionError } =
    await cms.rpc('taxpay_is_verified_portal_admin');
  if (permissionError) throw permissionError;
  return permitted === true;
}
