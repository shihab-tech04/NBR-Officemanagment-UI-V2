import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => sdk.createClient(...args),
}));

import {
  callOfficeCmsBridge, getOfficeCmsAuthClient, isVerifiedOfficeCmsPublisher,
  OFFICE_CMS_URL, OFFICE_CMS_PUBLISHER_UID,
} from './officeCmsBridge';

describe('Office-issued identity for cross-project CMS publishing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdk.createClient.mockReturnValue({ auth: { getUser: sdk.getUser, getSession: sdk.getSession } });
    sdk.getUser.mockResolvedValue({
      data: { user: {
        id: OFFICE_CMS_PUBLISHER_UID,
        email: 'shihabshajib01@gmail.com',
        email_confirmed_at: '2026-11-07T06:11:20Z',
        is_anonymous: false,
      } }, error: null,
    });
    sdk.getSession.mockResolvedValue({
      data: { session: { access_token: 'office-access-token' } }, error: null,
    });
    sdk.fetch.mockResolvedValue({ ok: true, json: async () => ({ authorized: true }) });
    vi.stubGlobal('fetch', sdk.fetch);
    vi.stubEnv('VITE_TAXPAY_CMS_SUPABASE_URL', 'https://eyqhoavnitkrajvyqvxn.supabase.co');
    vi.stubEnv('VITE_TAXPAY_CMS_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_public_key');
  });

  it('authenticates only against the Office project, never TaxPay Auth', async () => {
    expect(await isVerifiedOfficeCmsPublisher()).toBe(true);
    getOfficeCmsAuthClient();
    expect(sdk.createClient).toHaveBeenCalledWith(OFFICE_CMS_URL,
      expect.stringMatching(/^sb_publishable_/), expect.objectContaining({
        auth: expect.objectContaining({ storageKey: 'nbr-office-management-cms-session' }),
      }));
    expect(sdk.createClient).not.toHaveBeenCalledWith(
      'https://eyqhoavnitkrajvyqvxn.supabase.co', expect.anything(), expect.anything());
  });

  it('denies other Office identities, unconfirmed email, and anonymous sessions', async () => {
    for (const changed of [
      { id: 'unrelated-office-user' },
      { email: 'different@office.example' },
      { email_confirmed_at: null },
      { is_anonymous: true },
    ]) {
      sdk.getUser.mockResolvedValueOnce({ data: { user: {
        id: OFFICE_CMS_PUBLISHER_UID, email: 'shihabshajib01@gmail.com',
        email_confirmed_at: '2026-11-07T06:11:20Z', is_anonymous: false,
        ...changed,
      } }, error: null });
      expect(await isVerifiedOfficeCmsPublisher()).toBe(false);
    }
    sdk.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('expired') });
    expect(await isVerifiedOfficeCmsPublisher()).toBe(false);
  });

  it('never sends a CMS mutation without an Office Auth session', async () => {
    sdk.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    await expect(callOfficeCmsBridge('publish-logo')).rejects.toThrow('Sign in to Office Management');
    expect(sdk.fetch).not.toHaveBeenCalled();
  });

  it('sends the Office access token to the restricted server bridge without exposing a secret key', async () => {
    const result = await callOfficeCmsBridge<{authorized:boolean}>('status');
    expect(result.authorized).toBe(true);
    expect(sdk.fetch).toHaveBeenCalledOnce();
    const [url,request] = sdk.fetch.mock.calls[0];
    expect(url).toBe('https://eyqhoavnitkrajvyqvxn.supabase.co/functions/v1/office-cms-publish');
    expect(request.method).toBe('POST');
    expect(request.headers.Authorization).toBe('Bearer office-access-token');
    expect(request.headers.apikey).toMatch(/^sb_publishable_/);
    expect(request.body.get('action')).toBe('status');
    expect(JSON.stringify(request.headers)).not.toMatch(/service_role|sb_secret_/);
  });

  it('propagates denied and offline publishing without false success', async () => {
    sdk.fetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'Office account denied' }) });
    await expect(callOfficeCmsBridge('publish-banner')).rejects.toThrow('Office account denied');
    sdk.fetch.mockRejectedValueOnce(new Error('offline'));
    await expect(callOfficeCmsBridge('publish-banner')).rejects.toThrow('could not be reached');
  });
});