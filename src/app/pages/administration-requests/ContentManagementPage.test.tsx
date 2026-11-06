import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyPublicImage } from './verifyPublicImage';

const deps = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('./verifyPublicImage', () => ({ verifyPublicImage: vi.fn(async () => {}) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: deps.createClient }));

function row() {
  return {
    id: 'intro', service_code: null, sort_order: 0, published: true,
    heading_en: 'Tax payments, without the confusion', heading_bn: 'কর পরিশোধে আর বিভ্রান্তি নয়।',
    description_en: 'Choose a tax payment.', description_bn: 'কর পরিশোধ করুন।',
    mobile_heading_en: 'Pay tax', mobile_heading_bn: 'কর দিন',
    mobile_description_en: 'Choose and pay.', mobile_description_bn: 'কর পরিশোধ করুন।',
    action_en: 'Pay Tax', action_bn: 'কর পরিশোধ',
    desktop_image_path: null, mobile_image_path: null,
    version: 8, updated_at: '2026-11-01T00:00:00Z', updated_by: null,
  };
}

function makeClient(authorized: boolean, hasSession = authorized, options: { rejectWrite?: boolean; staleReadback?: boolean; stalePublicReadback?: boolean } = {}) {
  const banners: Record<string, unknown>[] = [row()];
  let sessionActive = hasSession;
  let onAuthChange: (() => void) | null = null;
  const query: Record<string, unknown> = {};
  query.order = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve({ data: banners, error: null }).then(onFulfilled);
  const rpc = vi.fn(async (name: string, args?: unknown) => {
    if (name === 'taxpay_is_verified_portal_admin') return { data: authorized, error: null };
    if (name === 'taxpay_save_banner') {
      if (options.rejectWrite) return { data: null, error: new Error('SQL rejected banner write') };
      const changes = (args as { p_banner: Record<string, unknown> }).p_banner;
      const saved = { ...banners[0], ...changes, version: Number(banners[0].version) + 1 };
      if (!options.staleReadback) banners[0] = saved;
      return { data: saved, error: null };
    }
    throw new Error('Unexpected RPC: ' + name);
  });
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: sessionActive ? { user: { id: 'verified-user' } } : null }, error: null })),
      onAuthStateChange: vi.fn((callback: () => void) => {
        onAuthChange = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      signInWithPassword: vi.fn(),
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signOut: vi.fn(),
    },
    rpc,
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(async () => 'ok'),
    from: vi.fn(() => ({ select: vi.fn(() => query) })),
    storage: { from: vi.fn(() => ({
      getPublicUrl: (path: string) => ({ data: { publicUrl: 'https://storage.test/' + path } }),
      remove: vi.fn(async () => ({ error: null })),
    })) },
  };
  const publicQuery: Record<string, unknown> = {};
  publicQuery.eq = vi.fn(() => publicQuery);
  publicQuery.order = vi.fn(() => publicQuery);
  publicQuery.then = (onFulfilled: (value: unknown) => unknown) => Promise.resolve({
    data: options.stalePublicReadback ? [row()] : banners.filter(banner => banner.published),
    error: null,
  }).then(onFulfilled);
  const publicClient = {
    from: vi.fn(() => ({ select: vi.fn(() => publicQuery) })),
  };
  return { client, publicClient, rpc, setSession(isActive: boolean) {
    sessionActive = isActive;
    onAuthChange?.();
  } };
}

describe('verified TaxPay banner CMS', () => {
  beforeEach(() => {
    vi.mocked(verifyPublicImage).mockResolvedValue(undefined);
    vi.resetModules();
    vi.stubEnv('VITE_TAXPAY_CMS_SUPABASE_URL', 'https://cms.test.supabase.co');
    vi.stubEnv('VITE_TAXPAY_CMS_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it('renders the published SQL banner list for Office preview without a second login', async () => {
    const { client } = makeClient(false);
    deps.createClient.mockReturnValue(client);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    render(<ContentManagementPage />);
    expect(await screen.findByRole('button', { name: /Tax payments, without the confusion/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Banner list' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Site Logo' })).toBeInTheDocument();
    expect(screen.getByText(/You can edit and preview content here/)).toBeInTheDocument();
    expect(deps.createClient).toHaveBeenCalledWith(
      'https://cms.test.supabase.co', 'sb_publishable_test',
      expect.objectContaining({ auth: expect.objectContaining({
        persistSession: true, storageKey: 'nbr-office-taxpay-cms-session',
      }) }),
    );
    expect(client.from).toHaveBeenCalledWith('taxpay_site_banners');
    expect(screen.queryByText(/Sign out of Office and use/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in securely' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add banner' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Edit banner' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit banner' }));
    await user.clear(screen.getByLabelText('Desktop heading · English'));
    await user.type(screen.getByLabelText('Desktop heading · English'), 'Preview without publishing');
    expect(screen.getByRole('button', { name: 'Publish to TaxPay' })).toBeEnabled();
    expect(screen.getByText(/unpublished preview/i)).toBeInTheDocument();
    expect(client.rpc).not.toHaveBeenCalledWith('taxpay_save_banner', expect.anything());
  });

  it('keeps a banner text draft and original SQL version while routing to authorized Office sign-in', async () => {
    const { client, rpc } = makeClient(false);
    deps.createClient.mockReturnValue(client);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const { getPendingCmsPublish, clearPendingCmsPublish } = await import('../../services/cmsPublishReturn');
    const user = userEvent.setup();
    render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit banner' }));
    const heading = screen.getByLabelText('Desktop heading · English');
    await user.clear(heading);
    await user.type(heading, 'Needs verified Office publish');
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    const pending = getPendingCmsPublish();
    expect(pending?.kind).toBe('banner');
    if (pending?.kind === 'banner') {
      expect(pending.publishAfterSignIn).toBe(true);
      expect((pending.draft as { heading_en: string; version: number }).heading_en).toBe('Needs verified Office publish');
      expect((pending.draft as { heading_en: string; version: number }).version).toBe(8);
    }
    expect(rpc).not.toHaveBeenCalledWith('taxpay_save_banner', expect.anything());
    clearPendingCmsPublish();
  });

  it('publishes the preserved banner draft after the existing Office sign-in verifies the administrator', async () => {
    const { client, publicClient, rpc } = makeClient(true);
    deps.createClient.mockReturnValueOnce(client).mockReturnValueOnce(publicClient);
    const { requestCmsPublishingSignIn, getPendingCmsPublish } = await import('../../services/cmsPublishReturn');
    const resumed = { ...row(), heading_en: 'Publish this retained banner' };
    requestCmsPublishingSignIn({
      kind: 'banner', selectedId: 'intro', draft: resumed, newDraft: null,
      desiredPosition: 1, desktopFile: null, mobileFile: null, publishAfterSignIn: true,
    });
    const { ContentManagementPage } = await import('./ContentManagementPage');
    render(<ContentManagementPage />);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('taxpay_save_banner',
      expect.objectContaining({
        p_expected_version: 8,
        p_banner: expect.objectContaining({ heading_en: 'Publish this retained banner' }),
      }),
    ));
    expect(await screen.findByText(/public TaxPay text and images verified/)).toBeInTheDocument();
    expect(getPendingCmsPublish()).toBeNull();
  });

  it('shows published data but does not expose write controls to a non-admin SQL session', async () => {
    const { client, rpc } = makeClient(false, true);
    deps.createClient.mockReturnValue(client);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    render(<ContentManagementPage />);
    await screen.findByRole('button', { name: /Tax payments, without the confusion/ });
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('taxpay_is_verified_portal_admin'));
    expect(screen.getByRole('button', { name: 'Edit banner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add banner' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit banner' }));
    expect(screen.getByRole('button', { name: 'Publish to TaxPay' })).toBeEnabled();
    expect(rpc).not.toHaveBeenCalledWith('taxpay_save_banner', expect.anything());
  });

  it('preserves an unsaved banner draft and Cancel when an auth refresh reloads SQL rows', async () => {
    const { client, setSession } = makeClient(true);
    deps.createClient.mockReturnValue(client);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit banner' }));
    const heading = screen.getByLabelText('Desktop heading · English');
    await user.clear(heading);
    await user.type(heading, 'Unsaved draft stays open');
    expect(heading).toHaveValue('Unsaved draft stays open');
    act(() => { setSession(false); });
    await waitFor(() => expect(screen.getByText(/To publish live changes, sign in to Office once/)).toBeInTheDocument());
    act(() => { setSession(true); });
    await waitFor(() => expect(screen.queryByText(/To publish live changes, sign in to Office once/)).not.toBeInTheDocument());
    expect(screen.getByLabelText('Desktop heading · English')).toHaveValue('Unsaved draft stays open');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeVisible();
  });

  it('locks canonical Intro category, publishing and deletion controls', async () => {
    const { client } = makeClient(true);
    deps.createClient.mockReturnValue(client);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit banner' }));
    expect(screen.queryByRole('combobox', { name: 'Banner category' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Publish banner' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove banner' })).not.toBeInTheDocument();
    expect(screen.getByText('Main banner (fixed)')).toBeInTheDocument();
  });


  it('does not claim successful publishing when SQL rejects a write', async () => {
    const { client, rpc } = makeClient(true, true, { rejectWrite: true });
    deps.createClient.mockReturnValue(client);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit banner' }));
    await user.clear(screen.getByLabelText('Desktop heading · English'));
    await user.type(screen.getByLabelText('Desktop heading · English'), 'Rejected edit');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('taxpay_save_banner', expect.anything()));
    expect(await screen.findByText(/Save not completed: SQL rejected banner write/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(screen.queryByText(/Saved to SQL\./)).not.toBeInTheDocument();
  });

  it('does not claim successful publishing when the returned SQL row is not persisted', async () => {
    const { client } = makeClient(true, true, { staleReadback: true });
    deps.createClient.mockReturnValue(client);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit banner' }));
    await user.clear(screen.getByLabelText('Desktop heading · English'));
    await user.type(screen.getByLabelText('Desktop heading · English'), 'Stale read-back edit');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/SQL read-back did not match the published banner/)).toBeInTheDocument();
    expect(screen.queryByText(/Saved to SQL\./)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  it('verifies an actual anonymous read-back rather than trusting the Office admin session', async () => {
    const { client, publicClient } = makeClient(true);
    deps.createClient.mockReturnValueOnce(client).mockReturnValueOnce(publicClient);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit banner' }));
    await user.clear(screen.getByLabelText('Desktop heading · English'));
    await user.type(screen.getByLabelText('Desktop heading · English'), 'Publicly verified headline');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/public TaxPay text and images verified/)).toBeInTheDocument();
    expect(publicClient.from).toHaveBeenCalledWith('taxpay_site_banners');
    expect(deps.createClient).toHaveBeenCalledWith('https://cms.test.supabase.co', 'sb_publishable_test',
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: false, autoRefreshToken: false }) }));
  });

  it('reports incomplete verification when Office sees a write but the anonymous TaxPay feed is stale', async () => {
    const { client, publicClient } = makeClient(true, true, { stalePublicReadback: true });
    deps.createClient.mockReturnValueOnce(client).mockReturnValueOnce(publicClient);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit banner' }));
    await user.clear(screen.getByLabelText('Desktop heading · English'));
    await user.type(screen.getByLabelText('Desktop heading · English'), 'Unseen on public');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Public TaxPay visibility does not match the committed SQL banner/)).toBeInTheDocument();
    expect(screen.queryByText(/public TaxPay text and images verified/)).not.toBeInTheDocument();
  });

  it('explains that service text is announced while fixed Taxpayer copy stays unchanged', async () => {
    const { client } = makeClient(true);
    deps.createClient.mockReturnValue(client);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    render(<ContentManagementPage />);
    await screen.findByRole('button', { name: 'Edit banner' });
    expect(screen.getByText(/controls the Taxpayer homepage’s fixed left heading/)).toBeInTheDocument();
  });

  it('reads the approved v9 preview and commits edits through atomic SQL RPC', async () => {
    const { client, rpc } = makeClient(true);
    deps.createClient.mockReturnValue(client);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    render(<ContentManagementPage />);
    await screen.findByRole('button', { name: 'Edit banner' });
    expect(screen.getByAltText('desktop banner preview')).toHaveAttribute(
      'src', expect.stringContaining('taxpay-hero-intro-v9.webp'),
    );
    await user.click(screen.getByRole('button', { name: 'Edit banner' }));
    const heading = screen.getByLabelText('Desktop heading · English');
    await user.clear(heading);
    await user.type(heading, 'Updated fixed headline');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('taxpay_save_banner',
      expect.objectContaining({
        p_expected_version: 8,
        p_position: 1,
        p_banner: expect.objectContaining({ heading_en: 'Updated fixed headline', id: 'intro' }),
      }),
    ));
    expect(await screen.findByText(/Saved to SQL/)).toBeInTheDocument();
  });
});
