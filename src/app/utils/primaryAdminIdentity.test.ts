import { describe, expect, it } from 'vitest';
import { emailForPrimaryAdminId, PRIMARY_ADMIN_EMAIL } from './primaryAdminIdentity';

describe('primary administrator alias', () => {
  it('resolves only the exact approved login ID', () => {
    expect(emailForPrimaryAdminId('admin')).toBe(PRIMARY_ADMIN_EMAIL);
    expect(emailForPrimaryAdminId(' ADMIN ')).toBe(PRIMARY_ADMIN_EMAIL);
    for (const value of ['', 'admin1', 'superadmin', 'user1', 'user10','admin&role=APPROVER',null]) {
      expect(emailForPrimaryAdminId(value)).toBeNull();
    }
  });
});
