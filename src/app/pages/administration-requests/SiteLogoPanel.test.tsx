import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SiteLogoPanel } from './SiteLogoPanel';

function logoCms() {
  const row = {
    id: 'primary', image_path: null, image_width: null, image_height: null,
    version: 1, updated_at: '2026-10-18T00:00:00Z',
  };
  const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
  return {
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ single: async () => ({ data: row, error: null }) }) }) })),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn().mockResolvedValue('ok'),
    storage: { from: vi.fn(() => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://example.test/${path}` } }) })) },
  } as unknown as SupabaseClient;
}

describe('Site Logo editor', () => {
  it('keeps the approved logo read-only until Edit, and Cancel restores view mode', async () => {
    const user = userEvent.setup();
    const cms = logoCms();
    render(<SiteLogoPanel cms={cms} />);
    await screen.findByRole('button', { name: 'Edit logo' });
    expect(screen.getByText('Current published logo')).toBeInTheDocument();
    expect(screen.getByText(/Source image: 2150 × 440 px/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit logo' }));
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByText(/PNG, JPG or JPEG only/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Edit logo' })).toBeInTheDocument();
  });
});
