import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const deps = vi.hoisted(() => ({ createClient: vi.fn() }));
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

function makeClient(authorized: boolean, hasSession = authorized) {
  const banners = [row()];
  const query: Record<string, unknown> = {};
  query.order = vi.fn(() => query);
  query.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve({ data: banners, error: null }).then(onFulfilled);
  const rpc = vi.fn(async (name: string, args?: unknown) => {
    if (name === 'taxpay_is_verified_portal_admin') return { data: authorized, error: null };
    if (name === 'taxpay_save_banner') return { data: row(), error: null };
    throw new Error('Unexpected RPC: ' + name);
  });
  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: hasSession ? { user: { id: 'verified-user' } } : null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
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
  return { client, rpc };
}

describe('verified TaxPay banner CMS', () => {
  beforeEach(() => {
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
    expect(screen.getByRole('button', { name: 'Publish to TaxPay' })).toBeDisabled();
    expect(screen.getByText(/unpublished preview/i)).toBeInTheDocument();
    expect(client.rpc).not.toHaveBeenCalledWith('taxpay_save_banner', expect.anything());
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
    expect(screen.getByRole('button', { name: 'Publish to TaxPay' })).toBeDisabled();
    expect(rpc).not.toHaveBeenCalledWith('taxpay_save_banner', expect.anything());
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
    expect(screen.getByText(/Saved to SQL/)).toBeInTheDocument();
  });
});
