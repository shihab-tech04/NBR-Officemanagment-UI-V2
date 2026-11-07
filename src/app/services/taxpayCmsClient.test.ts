import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({ createClient: vi.fn(),officeVerified:vi.fn() }));
vi.mock('./officeCmsBridge', () => ({ isVerifiedOfficeCmsPublisher: deps.officeVerified }));
vi.mock('@supabase/supabase-js', () => ({ createClient: deps.createClient }));

const oldKey = 'sb-cms-auth-token';

function mockPublisherSession(options: {
  existing?: boolean;
  allowed?: boolean;
  verified?: boolean;
  invalidTokens?: boolean;
} = {}) {
  let session: { user: { id: string } } | null =
    options.existing ? { user: { id: 'approved-publisher' } } : null;
  const auth = {
    getSession: vi.fn(async () => ({ data: { session }, error: null })),
    setSession: vi.fn(async () => {
      if (options.invalidTokens) {
        return { data: { session: null }, error: new Error('Expired refresh token') };
      }
      session = { user: { id: 'approved-publisher' } };
      return { data: { session }, error: null };
    }),
    getUser: vi.fn(async () => ({
      data: { user: !session ? null : options.verified === false
        ? { id: 'another-user', is_anonymous: false }
        : { id: 'approved-publisher', is_anonymous: false } },
      error: null,
    })),
    signOut: vi.fn(async () => { session = null; return { error: null }; }),
  };
  const rpc = vi.fn(async () => ({ data: options.allowed !== false, error: null }));
  deps.createClient.mockReturnValue({ auth, rpc });
  return { auth, rpc };
}

describe('historical Office CMS publisher session continuity', () => {
  beforeEach(() => {
    vi.resetModules();
    deps.createClient.mockReset();
    deps.officeVerified.mockReset().mockResolvedValue(false);
    localStorage.clear();
    vi.stubEnv('VITE_TAXPAY_CMS_SUPABASE_URL', 'https://cms.test.supabase.co');
    vi.stubEnv('VITE_TAXPAY_CMS_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  });
  afterEach(() => { vi.unstubAllEnvs(); localStorage.clear(); });

  it('restores the previous Office session only after server identity and SQL publisher checks', async () => {
    const { auth, rpc } = mockPublisherSession();
    localStorage.setItem(oldKey, JSON.stringify({
      access_token: 'legacy-access-token', refresh_token: 'legacy-refresh-token',
    }));
    const { restorePreviouslyVerifiedCmsSession } = await import('./taxpayCmsClient');
    expect(await restorePreviouslyVerifiedCmsSession()).toBe(true);
    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: 'legacy-access-token', refresh_token: 'legacy-refresh-token',
    });
    expect(auth.getUser).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('taxpay_is_verified_portal_admin');
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(localStorage.getItem(oldKey)).toBeNull();
    expect(deps.createClient).toHaveBeenCalledWith(
      'https://cms.test.supabase.co', 'sb_publishable_test',
      expect.objectContaining({ auth: expect.objectContaining({
        persistSession: true, storageKey: 'nbr-office-taxpay-cms-session',
      }) }),
    );
  });

  it('does not give a different account publishing authority from an old token', async () => {
    const { auth, rpc } = mockPublisherSession({ verified: false });
    localStorage.setItem(oldKey, JSON.stringify({
      access_token: 'legacy-access-token', refresh_token: 'legacy-refresh-token',
    }));
    const { restorePreviouslyVerifiedCmsSession } = await import('./taxpayCmsClient');
    expect(await restorePreviouslyVerifiedCmsSession()).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(localStorage.getItem(oldKey)).not.toBeNull();
  });

  it('does not allow an authenticated but unauthorized old account to publish', async () => {
    const { auth, rpc } = mockPublisherSession({ allowed: false });
    localStorage.setItem(oldKey, JSON.stringify({
      access_token: 'legacy-access-token', refresh_token: 'legacy-refresh-token',
    }));
    const { restorePreviouslyVerifiedCmsSession } = await import('./taxpayCmsClient');
    expect(await restorePreviouslyVerifiedCmsSession()).toBe(false);
    expect(rpc).toHaveBeenCalledWith('taxpay_is_verified_portal_admin');
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('never manufactures a publisher session from password-free Office entry', async () => {
    const { auth } = mockPublisherSession();
    const { restorePreviouslyVerifiedCmsSession } = await import('./taxpayCmsClient');
    expect(await restorePreviouslyVerifiedCmsSession()).toBe(false);
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('does not overwrite a current CMS session with an older one', async () => {
    const { auth } = mockPublisherSession({ existing: true });
    localStorage.setItem(oldKey, JSON.stringify({
      access_token: 'old-access', refresh_token: 'old-refresh',
    }));
    const { restorePreviouslyVerifiedCmsSession } = await import('./taxpayCmsClient');
    expect(await restorePreviouslyVerifiedCmsSession()).toBe(false);
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(localStorage.getItem(oldKey)).not.toBeNull();
  });

  it('rejects malformed and expired legacy credentials without claiming success', async () => {
    const { auth } = mockPublisherSession({ invalidTokens: true });
    localStorage.setItem(oldKey, '{bad json}');
    const { restorePreviouslyVerifiedCmsSession } = await import('./taxpayCmsClient');
    expect(await restorePreviouslyVerifiedCmsSession()).toBe(false);
    expect(auth.setSession).not.toHaveBeenCalled();
  });
  it('accepts only a server-verified Office Management publisher', async () => {
    const { auth, rpc } = mockPublisherSession({ existing: true });
    deps.officeVerified.mockResolvedValue(true);
    const { hasVerifiedCmsPublisherSession } = await import('./taxpayCmsClient');
    expect(await hasVerifiedCmsPublisherSession()).toBe(true);
    expect(deps.officeVerified).toHaveBeenCalledOnce();
    expect(auth.getUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('denies a TaxPay user when the Office administrator identity is not verified', async () => {
    const { rpc } = mockPublisherSession({ existing:true });
    deps.officeVerified.mockResolvedValue(false);
    const { hasVerifiedCmsPublisherSession } = await import('./taxpayCmsClient');
    expect(await hasVerifiedCmsPublisherSession()).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never authorizes a password-optional Office preview without verified Office Auth',async()=>{
    const { rpc }=mockPublisherSession();
    const { hasVerifiedCmsPublisherSession }=await import('./taxpayCmsClient');
    expect(await hasVerifiedCmsPublisherSession()).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not grant publishing through legacy TaxPay publisher tokens',async()=>{
    const { auth, rpc }=mockPublisherSession();
    localStorage.setItem(oldKey,JSON.stringify({access_token:'legacy-access',refresh_token:'legacy-refresh'}));
    const { hasVerifiedCmsPublisherSession }=await import('./taxpayCmsClient');
    expect(await hasVerifiedCmsPublisherSession()).toBe(false);
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});