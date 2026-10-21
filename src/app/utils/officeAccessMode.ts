/**
 * The public Office Management UI is open for design and navigation review.
 * This is not an officer identity and must never authorize protected SQL access.
 */
// Public releases stay in visual-preview mode. Disposable cross-project tests
// can explicitly enable connected review against loopback Supabase Auth + RLS.
// This flag never grants an officer role: the server checks the verified user.
export const OFFICE_PUBLIC_UI_ONLY = import.meta.env.VITE_OFFICE_PUBLIC_UI_ONLY !== 'false';
