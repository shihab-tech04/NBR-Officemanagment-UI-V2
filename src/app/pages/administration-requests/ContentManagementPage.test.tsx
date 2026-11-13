import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyPublicImage } from './verifyPublicImage';
import { BannerFullPreview } from './BannerFullPreview';

const deps = vi.hoisted(() => ({ createClient: vi.fn(), officeClient: vi.fn(), verified: vi.fn(), bridge: vi.fn() }));
vi.mock('../../services/officeCmsBridge', () => ({
  getOfficeCmsAuthClient: deps.officeClient,
  isVerifiedOfficeCmsPublisher: deps.verified,
  callOfficeCmsBridge: deps.bridge,
}));
vi.mock('./verifyPublicImage', () => ({ verifyPublicImage: vi.fn(async () => {}) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: deps.createClient }));
// Isolate the page's upload/readback contract from the separately tested
// canvas crop implementation; live Chromium exercises the real crop dialog.
vi.mock('./ImageCropDialog', () => ({
  ImageCropDialog: ({ onApply }: { onApply: (file: File) => void }) =>
    <button type="button" onClick={() => onApply(new File([new Uint8Array(128)], 'cms-cropped.png', { type: 'image/png' }))}>
      Apply crop
    </button>,
}));

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

function makeClient(authorized: boolean, hasSession = authorized, options: { rejectWrite?: boolean; staleReadback?: boolean; stalePublicReadback?: boolean; versionConflictOnce?: boolean; deleteConflictOnce?: boolean; extraBanner?: boolean } = {}) {
  const banners: Record<string, unknown>[] = [row()];
  if (options.extraBanner) banners.push({ ...row(), id:'service-1', service_code:'SOURCE_TAX', sort_order:1, published:false, heading_en:'Withholding tax banner', version:4 });
  const upload = vi.fn(async () => ({ error: null }));
  let conflictPending = options.versionConflictOnce === true;
  let deleteConflictPending = options.deleteConflictOnce === true;
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
      upload,
      remove: vi.fn(async () => ({ error: null })),
    })) },
  };
  deps.officeClient.mockReturnValue(client);
  deps.verified.mockResolvedValue(authorized && hasSession);
  deps.bridge.mockImplementation(async (action:string, fields:Record<string,unknown> = {}, files:Record<string,File|null> = {}) => {
    if (action === 'list-banners') return { banners: banners.map(b=>({...b})) };
    if (action === 'status') return { authorized:true,officeUid:'verified-user' };
    if (action === 'publish-banner') {
      if (options.rejectWrite) throw new Error('SQL rejected banner write');
      const changes = JSON.parse(String(fields.banner)) as Record<string,unknown>;
      if (conflictPending) {
        conflictPending = false;
        banners[0] = { ...banners[0], heading_en:'Latest saved headline', version:Number(banners[0].version)+1 };
        throw new Error('BANNER_VERSION_CONFLICT');
      }
      for (const device of ['desktop','mobile']) if (files[device]) {
        changes[device+'_image_path'] = 'banners/'+changes.id+'/'+device+'-00000000-0000-4000-8000-000000000001.png';
      }
      const saved = { ...banners[0], ...changes,version:Number(banners[0].version)+1 };
      if (!options.staleReadback) banners[0] = saved;
      return { banner: saved };
    }
    if (action === 'delete-banner') {
      const index = banners.findIndex(b=>b.id===fields.bannerId);
      if (index===-1) throw new Error('Banner not found');
      if (deleteConflictPending) {
        deleteConflictPending = false;
        banners[index] = { ...banners[index], heading_en:'Latest saved service headline', version:Number(banners[index].version)+1 };
        throw new Error('BANNER_VERSION_CONFLICT');
      }
      banners.splice(index,1);
      return { removed:fields.bannerId };
    }
    throw new Error('Unexpected Office CMS bridge action: '+action);
  });
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
  return { client, publicClient, rpc, upload, setSession(isActive: boolean) {
    sessionActive = isActive;
    deps.verified.mockResolvedValue(authorized && isActive);
    onAuthChange?.();
  } };
}

describe('verified TaxPay banner CMS', () => {
  beforeEach(() => {
    // Reset queued constructor responses as well as call counts: a failed
    // render must not leak a public viewer mock into the next CMS test.
    deps.createClient.mockReset();
    deps.officeClient.mockReset();
    deps.verified.mockReset();
    deps.bridge.mockReset();
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
    expect(deps.bridge).not.toHaveBeenCalledWith('publish-banner', expect.anything(), expect.anything());
  });

  it('does not request another login or lose the draft when the existing Office session lacks publishing access', async () => {
    const { client, rpc } = makeClient(false);
    deps.createClient.mockReturnValue(client);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit banner' }));
    const heading = screen.getByLabelText('Desktop heading · English');
    await user.clear(heading);
    await user.type(heading, 'My cropped edits remain here');
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    expect(await screen.findByText(/no verified TaxPay publishing access/)).toBeInTheDocument();
    expect(heading).toHaveValue('My cropped edits remain here');
    expect(screen.queryByRole('dialog', { name: /publishing/i })).not.toBeInTheDocument();
    expect(deps.bridge).not.toHaveBeenCalledWith('publish-banner', expect.anything(), expect.anything());
  });

  it('does not claim image verification when publishing banner text without uploaded images', async () => {
    const { client, publicClient, rpc } = makeClient(true);
    deps.createClient.mockReturnValueOnce(client).mockReturnValueOnce(publicClient);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit banner' }));
    await user.clear(screen.getByLabelText('Desktop heading · English'));
    await user.type(screen.getByLabelText('Desktop heading · English'), 'Single-click verified banner');
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    await waitFor(() => expect(deps.bridge).toHaveBeenCalledWith('publish-banner',
      expect.objectContaining({ banner: expect.stringContaining('Single-click verified banner') }),
      expect.any(Object))); 
    expect(await screen.findByText(/public TaxPay text verified\. Both image slots still use the approved artwork fallback/)).toBeInTheDocument();
    expect(screen.queryByText(/images verified/)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /publishing/i })).not.toBeInTheDocument();
  });

  it('uploads both cropped banner image slots and verifies their SQL and public paths', async () => {
    const { client, publicClient, rpc, upload } = makeClient(true);
    deps.createClient.mockReturnValueOnce(client).mockReturnValueOnce(publicClient);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    const { container } = render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit banner' }));
    for (const device of ['desktop', 'mobile']) {
      const input = container.querySelector(`.cms-upload--${device} input[type="file"]`) as HTMLInputElement | null;
      expect(input).not.toBeNull();
      await user.upload(input!, new File([new Uint8Array(256)], `${device}.png`, { type: 'image/png' }));
      await user.click(screen.getByRole('button', { name: 'Apply crop' }));
      expect(container.querySelector(`.cms-upload--${device}`)).toHaveTextContent('Cropped image ready');
    }
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    await waitFor(() => expect(deps.bridge).toHaveBeenCalledWith('publish-banner',
      expect.objectContaining({ expectedVersion: 8,position:1 }),
      expect.objectContaining({ desktop:expect.any(File),mobile:expect.any(File) })));
    const paths = [
      'banners/intro/desktop-00000000-0000-4000-8000-000000000001.png',
      'banners/intro/mobile-00000000-0000-4000-8000-000000000001.png',
    ];
    expect(await screen.findByText(/Saved to SQL; public TaxPay text and desktop\/mobile images verified/)).toBeInTheDocument();
    for (const path of paths) {
      expect(vi.mocked(verifyPublicImage)).toHaveBeenCalledWith(publicClient, 'taxpay-banners', path);
    }
  });

  it('reports a missing banner image slot when only one image was uploaded', async () => {
    const { client, publicClient } = makeClient(true);
    deps.createClient.mockReturnValueOnce(client).mockReturnValueOnce(publicClient);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    const { container } = render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit banner' }));
    const input = container.querySelector('.cms-upload--desktop input[type=\"file\"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    await user.upload(input!, new File([new Uint8Array(256)], 'desktop.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Apply crop' }));
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    await waitFor(() => expect(deps.bridge).toHaveBeenCalledWith('publish-banner',
      expect.objectContaining({ expectedVersion: 8, position: 1 }),
      expect.objectContaining({ desktop: expect.any(File), mobile: null })));
    expect(await screen.findByText(/public TaxPay text and the uploaded image verified\. The other slot still uses the approved artwork fallback/)).toBeInTheDocument();
    expect(vi.mocked(verifyPublicImage)).toHaveBeenCalledTimes(1);
  });

  it('shows published data but does not expose write controls to a non-admin SQL session', async () => {
    const { client, rpc } = makeClient(false, true);
    deps.createClient.mockReturnValue(client);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    render(<ContentManagementPage />);
    await screen.findByRole('button', { name: /Tax payments, without the confusion/ });
    await waitFor(() => expect(deps.verified).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Edit banner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add banner' })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit banner' }));
    expect(screen.getByRole('button', { name: 'Publish to TaxPay' })).toBeEnabled();
    expect(deps.bridge).not.toHaveBeenCalledWith('publish-banner', expect.anything(), expect.anything());
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
    await waitFor(() => expect(screen.getByText(/Changes are published only when this Office session has existing publishing access/)).toBeInTheDocument());
    act(() => { setSession(true); });
    await waitFor(() => expect(screen.queryByText(/Changes are published only when this Office session has existing publishing access/)).not.toBeInTheDocument());
    expect(screen.getByLabelText('Desktop heading · English')).toHaveValue('Unsaved draft stays open');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish to TaxPay' })).toBeVisible();
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
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    await waitFor(() => expect(deps.bridge).toHaveBeenCalledWith('publish-banner',expect.anything(),expect.anything()));
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
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
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
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    expect(await screen.findByText(/public TaxPay text verified\. Both image slots still use the approved artwork fallback/)).toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    expect(await screen.findByText(/Public TaxPay visibility does not match the committed SQL banner/)).toBeInTheDocument();
    expect(screen.queryByText(/public TaxPay text and images verified/)).not.toBeInTheDocument();
  });

  it('explains that public copy and payment actions stay fixed across artwork slides', async () => {
    const { client } = makeClient(true);
    deps.createClient.mockReturnValue(client);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    render(<ContentManagementPage />);
    await screen.findByRole('button', { name: 'Edit banner' });
    expect(screen.getByText(/keeps the main banner’s heading, description and Pay Tax label, plus the Travel Tax label, fixed/)).toBeInTheDocument();
  });

  it('reads approved v9 preview and commits edits through versioned server bridge', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    await waitFor(() => expect(deps.bridge).toHaveBeenCalledWith('publish-banner',
      expect.objectContaining({ expectedVersion:8,position:1,banner:expect.stringContaining('Updated fixed headline') }),
      expect.anything()));
    expect(await screen.findByText(/Saved to SQL/)).toBeInTheDocument();
  });

  it('keeps the local edit and crop on a stale version, then deliberately reloads before publishing again', async () => {
    const { client, publicClient } = makeClient(true, true, { versionConflictOnce:true });
    deps.createClient.mockReturnValueOnce(client).mockReturnValueOnce(publicClient);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    const { container } = render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name:'Edit banner' }));
    const heading = screen.getByLabelText('Desktop heading · English');
    await user.clear(heading);
    await user.type(heading, 'My local change must remain');
    const input = container.querySelector('.cms-upload--desktop input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([new Uint8Array(256)], 'conflicted-crop.png', { type:'image/png' }));
    await user.click(screen.getByRole('button', { name:'Apply crop' }));

    await user.click(screen.getByRole('button', { name:'Publish to TaxPay' }));
    expect(await screen.findByText(/latest saved version is v9/i)).toBeInTheDocument();
    expect(heading).toHaveValue('My local change must remain');
    expect(container.querySelector('.cms-upload--desktop')).toHaveTextContent('Cropped image ready');
    expect(screen.getByRole('button', { name:'Refresh before publishing' })).toBeDisabled();
    expect(deps.bridge.mock.calls.filter(([action]) => action === 'publish-banner')).toHaveLength(1);

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name:'Refresh' }));
    await waitFor(() => expect(screen.getByRole('button', { name:'Edit banner' })).toBeEnabled());
    expect(container.querySelector('.cms-upload--desktop')).not.toHaveTextContent('Cropped image ready');
    await user.click(screen.getByRole('button', { name:'Edit banner' }));
    const reloadedHeading = screen.getByLabelText('Desktop heading · English');
    expect(reloadedHeading).toHaveValue('Latest saved headline');
    await user.clear(reloadedHeading);
    await user.type(reloadedHeading, 'Resubmitted after refresh');
    await user.click(screen.getByRole('button', { name:'Publish to TaxPay' }));
    expect(await screen.findByText(/Saved to SQL/)).toBeInTheDocument();
    const publishCalls = deps.bridge.mock.calls.filter(([action]) => action === 'publish-banner');
    expect(publishCalls).toHaveLength(2);
    expect(publishCalls[1][1]).toEqual(
      expect.objectContaining({ expectedVersion:9, banner:expect.stringContaining('Resubmitted after refresh') }),
    );
    confirm.mockRestore();
  });

  it('allows only one banner save when Publish is clicked repeatedly during authorization', async () => {
    const { client, publicClient } = makeClient(true);
    deps.createClient.mockReturnValueOnce(client).mockReturnValueOnce(publicClient);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name:'Edit banner' }));
    await user.clear(screen.getByLabelText('Desktop heading · English'));
    await user.type(screen.getByLabelText('Desktop heading · English'), 'One guarded submission');
    let resolveAuthorization!: (allowed:boolean)=>void;
    const authorization = new Promise<boolean>(resolve => { resolveAuthorization = resolve; });
    deps.verified.mockReturnValue(authorization);

    await user.dblClick(screen.getByRole('button', { name:'Publish to TaxPay' }));
    expect(screen.getByRole('button', { name:'Publishing…' })).toBeDisabled();
    expect(deps.bridge.mock.calls.filter(([action]) => action === 'publish-banner')).toHaveLength(0);
    await act(async () => { resolveAuthorization(true); await authorization; });
    expect(await screen.findByText(/Saved to SQL/)).toBeInTheDocument();
    expect(deps.bridge.mock.calls.filter(([action]) => action === 'publish-banner')).toHaveLength(1);
  });

  it('does not delete a banner on a stale delete and requires refresh before further action', async () => {
    const { client } = makeClient(true, true, { extraBanner:true, deleteConflictOnce:true });
    deps.createClient.mockReturnValue(client);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name:/Withholding tax banner/ }));
    await user.click(screen.getByRole('button', { name:'Edit banner' }));
    await user.click(screen.getByRole('button', { name:'Remove banner' }));
    await user.click(screen.getByRole('button', { name:'Delete banner' }));
    expect(await screen.findByText(/latest saved version is v5/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name:/Latest saved service headline/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name:'Remove banner' })).toBeDisabled();
    expect(deps.bridge.mock.calls.filter(([action]) => action === 'delete-banner')).toHaveLength(1);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name:'Refresh' }));
    await waitFor(() => expect(screen.getByRole('button', { name:'Edit banner' })).toBeEnabled());
    await user.click(await screen.findByRole('button', { name:'Edit banner' }));
    expect(screen.getByLabelText('Desktop heading · English')).toHaveValue('Latest saved service headline');
    expect(deps.bridge.mock.calls.filter(([action]) => action === 'delete-banner')).toHaveLength(1);
    confirm.mockRestore();
  });

  it('keeps edits and cropped files when refreshing fails', async () => {
    const { client } = makeClient(true);
    deps.createClient.mockReturnValue(client);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    const { container } = render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name:'Edit banner' }));
    const heading = screen.getByLabelText('Desktop heading · English');
    await user.clear(heading);
    await user.type(heading, 'Keep this while refresh fails');
    const input = container.querySelector('.cms-upload--desktop input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([new Uint8Array(256)], 'preserve-crop.png', { type:'image/png' }));
    await user.click(screen.getByRole('button', { name:'Apply crop' }));

    const bridge = deps.bridge.getMockImplementation();
    if (!bridge) throw new Error('Expected banner bridge mock');
    let failNextList = true;
    deps.bridge.mockImplementation(async (action:string, fields:Record<string,unknown> = {}, files:Record<string,File|null> = {}) => {
      if (failNextList && action === 'list-banners') {
        failNextList = false;
        throw new Error('Banner read-back unavailable');
      }
      return bridge(action, fields, files);
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name:'Refresh' }));
    expect(await screen.findByText(/Refresh not completed.*Banner read-back unavailable/)).toBeInTheDocument();
    expect(heading).toHaveValue('Keep this while refresh fails');
    expect(container.querySelector('.cms-upload--desktop')).toHaveTextContent('Cropped image ready');
    expect(screen.getByRole('button', { name:'Publish to TaxPay' })).toBeEnabled();
    confirm.mockRestore();
  });

  it('previews the cropped artwork with generated colors before a single Office publish', async () => {
    const { client, publicClient } = makeClient(true);
    deps.createClient.mockReturnValueOnce(client).mockReturnValueOnce(publicClient);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    const { container } = render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name: 'Edit banner' }));
    const input = container.querySelector('.cms-upload--desktop input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File([new Uint8Array(256)], 'new-banner.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Apply crop' }));
    const dialog = await screen.findByRole('dialog', { name: /Full banner preview/ });
    const preview = dialog.querySelector('.cms-theme-preview')!;
    expect(preview).toHaveAccessibleName(
      'Unpublished desktop banner preview. Tax payments, without the confusion. Choose a tax payment. Actions shown: Pay Tax; Pay Travel Tax.',
    );
    expect(preview.querySelector('.cms-theme-preview__actions')).toHaveAttribute('aria-hidden', 'true');
    expect(preview.querySelector('.cms-theme-preview__media')).toHaveAttribute('aria-hidden', 'true');
    expect(preview.querySelector('button, a, input, select, textarea, [tabindex]')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'বাংলা' }));
    expect(preview).toHaveAccessibleName(
      'Unpublished desktop banner preview. কর পরিশোধে আর বিভ্রান্তি নয়। কর পরিশোধ করুন। Actions shown: কর পরিশোধ; ভ্রমণ কর পরিশোধ.',
    );
    await user.click(screen.getByRole('button', { name: 'Mobile' }));
    expect(dialog.querySelector('.cms-theme-preview__copy h3')).toHaveTextContent('কর দিন');
    expect(preview).toHaveAccessibleName(
      'Unpublished mobile banner preview. কর দিন। কর পরিশোধ করুন। Actions shown: কর পরিশোধ; ভ্রমণ কর পরিশোধ.',
    );
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(preview).toHaveAccessibleName(
      'Unpublished mobile banner preview. Pay tax. Choose and pay. Actions shown: Pay Tax; Pay Travel Tax.',
    );
    await user.click(screen.getByRole('button', { name: 'Return to editor' }));
    expect(screen.getByLabelText('Light background color')).toHaveValue('#eaf2ff');
    expect(screen.getByLabelText('Dark heading color')).toHaveValue('#1e4484');
    expect(deps.bridge).not.toHaveBeenCalledWith('publish-banner',expect.anything(),expect.anything());
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    await waitFor(() => expect(deps.bridge).toHaveBeenCalledWith('publish-banner',
      expect.objectContaining({ banner: expect.stringContaining('"background_color":"#EAF2FF"') }),
      expect.objectContaining({ desktop:expect.any(File) })));
    expect(await screen.findByText(/Published colors verified in SQL/)).toBeInTheDocument();
  });


  it('applies saved fixed-left preview content to all five banner assets in both languages and device layouts', () => {
    const palettes = [
      { background_color:'#EAF2FF', heading_color:'#172033', body_color:'#5F6B7A', outline_color:'#2C5EAD' },
      { background_color:'#F1F6FA', heading_color:'#234868', body_color:'#375977', outline_color:'#265D79' },
      { background_color:'#FFF6EC', heading_color:'#80420D', body_color:'#765334', outline_color:'#A65B19' },
      { background_color:'#F6F1FC', heading_color:'#4E327B', body_color:'#5A4673', outline_color:'#6D4BA8' },
      { background_color:'#ECF8FC', heading_color:'#07516B', body_color:'#316078', outline_color:'#0C6D8D' },
    ];
    const slides = [
      { ...row(), id:'intro', service_code:null },
      { ...row(), id:'return', service_code:'TAX_WITH_RETURN' },
      { ...row(), id:'advance', service_code:'ADVANCE_TAX' },
      { ...row(), id:'source', service_code:'SOURCE_TAX_DEPOSIT' },
      { ...row(), id:'travel', service_code:'TRAVEL_TAX', action_en:'Pay Travel Tax', action_bn:'ভ্রমণ কর পরিশোধ' },
    ].map((banner, index) => ({ ...banner, ...palettes[index] }));

    for (const banner of slides) {
      for (const device of ['desktop', 'mobile'] as const) {
        for (const language of ['en', 'bn'] as const) {
          const mobile = device === 'mobile';
          const bn = language === 'bn';
          const title = mobile
            ? (bn ? banner.mobile_heading_bn : banner.mobile_heading_en)
            : (bn ? banner.heading_bn : banner.heading_en);
          const body = mobile
            ? (bn ? banner.mobile_description_bn : banner.mobile_description_en)
            : (bn ? banner.description_bn : banner.description_en);
          const ending = bn
            ? (/[.!?।]$/u.test(title) ? '' : '।')
            : (/[.!?]$/.test(title) ? '' : '.');
          const action = bn ? banner.action_bn : banner.action_en;
          const travelAction = bn ? 'ভ্রমণ কর পরিশোধ' : 'Pay Travel Tax';
          const imageSrc = '/published/' + banner.id + '-' + device + '.webp';
          const { container, unmount } = render(<BannerFullPreview banner={banner}
            imageSrc={imageSrc} device={device} language={language}
            travelAction={travelAction} fixedCopy={row()} />);
          const preview = screen.getByRole('img');
          expect(preview).toHaveAttribute('data-fixed-left', 'true');
          expect(preview).toHaveAttribute('data-preview-palette', 'image');
          if (banner.service_code) expect(preview).toHaveAttribute('data-payment-service', banner.service_code);
          else expect(preview).not.toHaveAttribute('data-payment-service');
          expect(preview).toHaveAccessibleName(
            'Unpublished ' + device + ' banner preview. ' + title + ending + ' ' + body +
              ' Actions shown: ' + action + '; ' + travelAction + '.',
          );
          expect(preview.getAttribute('style')).toContain('--preview-bg: ' + banner.background_color);
          expect(preview.getAttribute('style')).toContain('--preview-heading: ' + banner.heading_color);
          expect(preview.getAttribute('style')).toContain('--preview-body: ' + banner.body_color);
          expect(preview.getAttribute('style')).toContain('--preview-outline: ' + banner.outline_color);
          expect(container.querySelector('.cms-theme-preview__media img')).toHaveAttribute('src', imageSrc);
          expect(container.querySelector('.cms-theme-preview__actions')).toHaveAttribute('aria-hidden', 'true');
          expect(container.querySelector('.cms-theme-preview__media')).toHaveAttribute('aria-hidden', 'true');
          expect(container.querySelector('button, a, input, select, textarea, [tabindex]')).toBeNull();
          unmount();
        }
      }
    }
  });

  it('keeps the published intro copy and both payment actions on a service artwork preview', async () => {
    const { client, publicClient } = makeClient(false, false, { extraBanner:true });
    deps.createClient.mockReturnValueOnce(client).mockReturnValueOnce(publicClient);
    const { ContentManagementPage } = await import('./ContentManagementPage');
    const user = userEvent.setup();
    render(<ContentManagementPage />);
    await user.click(await screen.findByRole('button', { name:/Withholding tax banner/ }));
    await user.click(screen.getByRole('button', { name:'Full banner preview' }));
    const dialog=await screen.findByRole('dialog', { name:/Full banner preview/ });
    const preview=dialog.querySelector('.cms-theme-preview')!;
    expect(preview).toHaveAttribute('data-payment-service','SOURCE_TAX');
    expect(preview).toHaveAttribute('data-fixed-left','true');
    expect(dialog.querySelector('.cms-theme-preview__copy h3')).toHaveTextContent('Tax payments, without the confusion');
    expect(dialog.querySelector('.cms-theme-preview__copy h3')).not.toHaveTextContent('Withholding tax banner');
    expect(dialog.querySelectorAll('.cms-theme-preview__actions span')).toHaveLength(2);
    expect(dialog.querySelector('.cms-theme-preview__primary')).toHaveTextContent('Pay Tax');
    expect(dialog.querySelector('.cms-theme-preview__outline')).toHaveTextContent('Pay Travel Tax');
  });
});
