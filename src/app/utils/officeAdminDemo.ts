/**
 * Demonstration-only Office login state. ID 'admin' opens local UI preview,
 * never a Supabase officer session or financial authorization.
 * The preview indicator is checked at every Supabase access boundary.
 */
export function isOfficeAdminDemo(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem('gov_ui_auth');
    if (!stored) return false;
    const session: unknown = JSON.parse(stored);
    if (typeof session !== 'object' || session === null) return false;
    const entry = session as Record<string, unknown>;
    return entry.isAuthenticated === true && entry.userId === 'admin';
  } catch {
    return false;
  }
}
