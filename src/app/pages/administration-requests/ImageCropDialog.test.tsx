import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageCropDialog } from './ImageCropDialog';

vi.mock('./imageCrop', async importOriginal => {
  const original = await importOriginal<typeof import('./imageCrop')>();
  return { ...original, validateImageFile: vi.fn().mockResolvedValue(undefined) };
});

describe('image crop dialog', () => {
  const drawImage = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 2200, height: 1100, close: vi.fn() }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(), drawImage, fillRect: vi.fn(), imageSmoothingQuality: 'high',
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => {
      callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('exports the preview as the exact banner dimensions and does not publish by itself', async () => {
    const apply = vi.fn();
    const cancel = vi.fn();
    const file = new File(['png'], 'photo.png', { type: 'image/png' });
    const user = userEvent.setup();
    render(<ImageCropDialog file={file} title="desktop banner" outputWidth={1600} outputHeight={800} onApply={apply} onCancel={cancel} />);
    await waitFor(() => expect(document.querySelector('canvas[aria-label="desktop banner crop preview. Drag to reposition."]')).toBeInTheDocument());
    await waitFor(() => expect(drawImage).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Apply crop' }));
    await waitFor(() => expect(apply).toHaveBeenCalledOnce());
    const exported = apply.mock.calls[0][0] as File;
    expect(exported.name).toBe('photo-cropped.png');
    expect(exported.type).toBe('image/png');
    expect(exported.size).toBeGreaterThan(0);
    expect(screen.getByText(/1600 × 800 px/)).toBeInTheDocument();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('dismisses without creating a replacement image', async () => {
    const cancel = vi.fn();
    const apply = vi.fn();
    const user = userEvent.setup();
    render(<ImageCropDialog file={new File(['png'], 'photo.png', { type: 'image/png' })}
      title="site logo" outputWidth={2150} outputHeight={440} onCancel={cancel} onApply={apply} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(apply).not.toHaveBeenCalled();
  });
});
