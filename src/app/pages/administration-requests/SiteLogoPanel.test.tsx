import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SiteLogoPanel } from './SiteLogoPanel';
import { getTaxPayCmsPublicClient } from '../../services/taxpayCmsClient';
import { verifyPublicImage } from './verifyPublicImage';
import { clearPendingCmsPublish, getPendingCmsPublish, CMS_PUBLISH_SIGN_IN_EVENT } from '../../services/cmsPublishReturn';

vi.mock('../../services/taxpayCmsClient', () => ({ getTaxPayCmsPublicClient: vi.fn() }));
vi.mock('./verifyPublicImage', () => ({ verifyPublicImage: vi.fn(async () => {}) }));

vi.mock('./ImageCropDialog', () => ({
  ImageCropDialog: ({ onApply }: { onApply: (file: File) => void }) =>
    <button type="button" onClick={() => onApply(new File([new Uint8Array([137, 80, 78, 71])], 'cropped.png', { type: 'image/png' }))}>
      Apply test crop
    </button>,
}));

function logoCms(writeMode: 'ok' | 'reject' | 'conflict' | 'publicStale' = 'ok') {
  let row = {
    id: 'primary' as const, image_path: null as string | null,
    image_width: null as number | null, image_height: null as number | null,
    version: 9, updated_at: '2026-10-29T00:00:00Z',
  };
  const upload = vi.fn(async () => ({ error: null }));
  const remove = vi.fn(async () => ({ error: null }));
  const update = vi.fn((fields: { image_path: string; image_width: number; image_height: number }) => {
    const chain = {
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => {
        if (writeMode === 'reject') return { data: null, error: new Error('RLS denied') };
        if (writeMode === 'conflict') return { data: null, error: null };
        row = { ...row, ...fields, version: row.version + 1 };
        return { data: row, error: null };
      }),
    };
    return chain;
  });
  const from = vi.fn((table: string) => {
    if (table !== 'taxpay_site_logo') throw new Error('Unexpected table: ' + table);
    return {
      select: vi.fn(() => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) })),
      update,
    };
  });
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
  const storage = { from: vi.fn(() => ({
    getPublicUrl: (path: string) => ({ data: { publicUrl: 'https://images.test/' + path } }),
    upload, remove,
  })) };
  const client = {
    from, channel: vi.fn(() => channel), removeChannel: vi.fn().mockResolvedValue('ok'),
    storage,
  } as unknown as SupabaseClient;
  const stalePublicClient = {
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ single: async () => ({
      data: { id: 'primary', image_path: null, version: 9, image_width: null, image_height: null },
      error: null,
    }) }) }) })),
  } as unknown as SupabaseClient;
  vi.mocked(getTaxPayCmsPublicClient).mockReturnValue(writeMode === 'publicStale' ? stalePublicClient : client);
  return { client, upload, update, from, remove };
}

async function prepareLogo(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Edit logo' }));
  const file = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' });
  await user.upload(screen.getByLabelText('Upload / replace logo'), file);
  await user.click(await screen.findByRole('button', { name: 'Apply test crop' }));
}

describe('Site Logo SQL editor and Korbritto parity', () => {
  beforeEach(() => { clearPendingCmsPublish(); vi.mocked(verifyPublicImage).mockResolvedValue(undefined); });
  it('uses the exact current Korbritto fallback when SQL has no uploaded logo', async () => {
    const cms = logoCms();
    render(<SiteLogoPanel cms={cms.client} />);
    await screen.findByRole('button', { name: 'Edit logo' });
    expect(screen.getByRole('heading', { name: 'Current TaxPay logo' })).toBeInTheDocument();
    expect(screen.getByText(/Current Korbritto brand/)).toBeInTheDocument();
    const img = screen.getByAltText('Korbritto TaxPay logo preview');
    expect(img.getAttribute('src')).not.toContain('amar-kor');
    const source = img.getAttribute('src') || '';
    expect(source.includes('korbritto-brand-locked') || source.startsWith('data:image/svg+xml')).toBe(true);
    expect(cms.from).toHaveBeenCalledWith('taxpay_site_logo');
  });

  it('falls back to the approved brand if the active preview image fails', async () => {
    const user = userEvent.setup();
    const cms = logoCms();
    render(<SiteLogoPanel cms={cms.client} canPublish />);
    await prepareLogo(user);
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    await screen.findByText(/verified in the public TaxPay logo feed/);
    const logo = screen.getByAltText('Korbritto TaxPay logo preview');
    fireEvent.error(logo);
    await waitFor(() => expect(logo.getAttribute('src')).toMatch(/korbritto-brand-locked|data:image/));
  });

  it('retains an unpublished cropped logo when requesting existing Office sign-in', async () => {
    const user = userEvent.setup();
    const cms = logoCms();
    const signInRequested = vi.fn();
    window.addEventListener(CMS_PUBLISH_SIGN_IN_EVENT, signInRequested);
    try {
      render(<SiteLogoPanel cms={cms.client} canPublish={false} />);
      await prepareLogo(user);
      await user.click(screen.getByRole('button', { name: 'Sign in to publish' }));
      expect(signInRequested).toHaveBeenCalledOnce();
      const pending = getPendingCmsPublish();
      expect(pending?.kind).toBe('logo');
      if (pending?.kind === 'logo') {
        expect(pending.selected?.width).toBe(1469);
        expect(pending.selected?.height).toBe(496);
        expect(pending.selected?.file.name).toBe('cropped.png');
      }
      expect(cms.upload).not.toHaveBeenCalled();
      expect(cms.update).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(CMS_PUBLISH_SIGN_IN_EVENT, signInRequested);
      clearPendingCmsPublish();
    }
  });

  it('allows a preview without publishing or changing SQL for ordinary Office access', async () => {
    const user = userEvent.setup();
    const cms = logoCms();
    render(<SiteLogoPanel cms={cms.client} canPublish={false} />);
    await prepareLogo(user);
    expect(screen.getByRole('button', { name: 'Publish to TaxPay' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sign in to publish' })).toBeEnabled();
    expect(cms.upload).not.toHaveBeenCalled();
    expect(cms.update).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Edit logo' })).toBeInTheDocument();
  });

  it('uploads a uniquely named asset, saves a versioned SQL row and checks read-back', async () => {
    const user = userEvent.setup();
    const cms = logoCms();
    render(<SiteLogoPanel cms={cms.client} canPublish />);
    await prepareLogo(user);
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    await waitFor(() => expect(cms.upload).toHaveBeenCalledOnce());
    expect(cms.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^logos\/[a-f0-9-]{36}\.png$/), expect.any(File),
      expect.objectContaining({ contentType: 'image/png', upsert: false }),
    );
    await waitFor(() => expect(cms.update).toHaveBeenCalledWith(expect.objectContaining({
      image_width: 1469, image_height: 496,
      image_path: expect.stringMatching(/^logos\//),
    })));
    expect(await screen.findByText(/Logo saved to SQL and verified in the public TaxPay logo feed/)).toBeInTheDocument();
    expect(screen.getByAltText('Korbritto TaxPay logo preview').getAttribute('src')).toMatch(/^https:\/\/images\.test\/logos\//);
    expect(screen.getByRole('button', { name: 'Edit logo' })).toBeInTheDocument();
  });

  it('restores the original logo with a version-checked SQL write and anonymous read-back', async () => {
    const user = userEvent.setup();
    const cms = logoCms();
    render(<SiteLogoPanel cms={cms.client} canPublish />);
    await prepareLogo(user);
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    await screen.findByText(/verified in the public TaxPay logo feed/);
    await user.click(screen.getByRole('button', { name: 'Edit logo' }));
    await user.click(screen.getByRole('button', { name: 'Restore original logo' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restore original logo' }));
    expect(await screen.findByText(/Original Korbritto logo restored and verified/)).toBeInTheDocument();
    expect(cms.update).toHaveBeenCalledWith({
      image_path: null, image_width: null, image_height: null,
    });
    expect(cms.remove).toHaveBeenCalledOnce();
    expect(screen.getByText(/Current Korbritto brand/)).toBeVisible();
  });

  it('does not change SQL when the uploaded logo cannot be delivered to public visitors', async () => {
    const user = userEvent.setup();
    const cms = logoCms();
    vi.mocked(verifyPublicImage).mockRejectedValueOnce(new Error('Public image cannot be decoded.'));
    render(<SiteLogoPanel cms={cms.client} canPublish />);
    await prepareLogo(user);
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    expect(await screen.findByText(/Logo not published: Public image cannot be decoded/)).toBeInTheDocument();
    expect(cms.update).not.toHaveBeenCalled();
    expect(cms.remove).toHaveBeenCalledOnce();
  });

  it('does not claim public publishing when only Office sees the updated logo', async () => {
    const user = userEvent.setup();
    const cms = logoCms('publicStale');
    render(<SiteLogoPanel cms={cms.client} canPublish />);
    await prepareLogo(user);
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    expect(await screen.findByText(/Public TaxPay logo does not match the committed SQL version/)).toBeInTheDocument();
    expect(screen.queryByText(/verified in the public TaxPay logo feed/)).not.toBeInTheDocument();
  });

  it('does not claim a SQL publish on a rejected write', async () => {
    const user = userEvent.setup();
    const cms = logoCms('reject');
    render(<SiteLogoPanel cms={cms.client} canPublish />);
    await prepareLogo(user);
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    expect(await screen.findByText(/Logo not published: RLS denied/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish to TaxPay' })).toBeEnabled();
  });

  it('rejects a stale version without replacing the current logo', async () => {
    const user = userEvent.setup();
    const cms = logoCms('conflict');
    render(<SiteLogoPanel cms={cms.client} canPublish />);
    await prepareLogo(user);
    await user.click(screen.getByRole('button', { name: 'Publish to TaxPay' }));
    expect(await screen.findByText(/Logo changed in another session/)).toBeInTheDocument();
    expect(screen.getByAltText('Korbritto TaxPay logo preview').getAttribute('src')).not.toContain('https://images.test/logos/');
  });
});
