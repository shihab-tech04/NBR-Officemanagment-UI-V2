import { describe, it, expect } from 'vitest';
import { OFFICE_AUTH_CALLBACK_URL } from './officeAuthRedirect';

describe('hosted Office email confirmation target', () => {
  it('always targets the exact live Office login, never localhost or a demo', () => {
    const target = new URL(OFFICE_AUTH_CALLBACK_URL);
    expect(target.protocol).toBe('https:');
    expect(target.hostname).toBe('shihab-tech04.github.io');
    expect(target.pathname).toBe('/NBR-Officemanagment-UI-V2/payments/transactions');
    expect(target.search).toBe('');
    expect(target.hash).toBe('');
    expect(OFFICE_AUTH_CALLBACK_URL).not.toMatch(/localhost|127\.0\.0\.1|:3000|nbr-taxpay/i);
  });
});
