import { afterEach, describe, expect, it } from 'vitest';
import { isOfficeAdminDemo } from './officeAdminDemo';

describe('Office demo login isolation', () => {
  afterEach(() => localStorage.removeItem('gov_ui_auth'));
  it('allows only an exact admin demo identity', () => {
    localStorage.setItem('gov_ui_auth', JSON.stringify({isAuthenticated:true,userId:'admin'}));
    expect(isOfficeAdminDemo()).toBe(true);
  });
  it('rejects outsider, taxpayer demo, forged variants, inactive and invalid local state', () => {
    for (const data of [
      {isAuthenticated:true,userId:'forged-admin'},
      {isAuthenticated:true,userId:'user1'},
      {isAuthenticated:false,userId:'admin'},
      {isAuthenticated:true,userId:'Admin'},
      {isAuthenticated:true,userId:'user10'}
    ]) {
      localStorage.setItem('gov_ui_auth', JSON.stringify(data));
      expect(isOfficeAdminDemo()).toBe(false);
    }
    localStorage.setItem('gov_ui_auth', '{invalid');
    expect(isOfficeAdminDemo()).toBe(false);
  });
});
