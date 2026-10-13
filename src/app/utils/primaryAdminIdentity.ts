/** The login ID is a public identifier, never an authentication credential. */
export const PRIMARY_ADMIN_LOGIN_ID = 'admin';
export const PRIMARY_ADMIN_EMAIL = 'shihabshajib01@gmail.com';

export function emailForPrimaryAdminId(input: unknown): string | null {
  return typeof input === 'string' && input.trim().toLowerCase() === PRIMARY_ADMIN_LOGIN_ID
    ? PRIMARY_ADMIN_EMAIL
    : null;
}
