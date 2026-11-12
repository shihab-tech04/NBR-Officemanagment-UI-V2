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
    render(<ImageCropDialog file={file} title="desktop banner" outputWidth={2172} outputHeight={724} onApply={apply} onCancel={cancel} />);
    await waitFor(() => expect(document.querySelector('canvas[aria-label="desktop banner crop preview. Drag to reposition."]')).toBeInTheDocument());
    await waitFor(() => expect(drawImage).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: 'Apply crop' }));
    await waitFor(() => expect(apply).toHaveBeenCalledOnce());
    const exported = apply.mock.calls[0][0] as File;
    expect(exported.name).toBe('photo-cropped.png');
    expect(exported.type).toBe('image/png');
    expect(exported.size).toBeGreaterThan(0);
    expect(screen.getByText(/2172 × 724 px/)).toBeInTheDocument();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('compresses an opaque PNG banner as JPEG without altering its exact crop size', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(), drawImage, fillRect: vi.fn(), imageSmoothingQuality: 'high',
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) })),
    } as unknown as CanvasRenderingContext2D);
    const encoding = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback, type, quality) => {
        const size = (quality ?? 1) >= 0.80 ? 900_000 : 280_000;
        callback(new Blob([new Uint8Array(size)], { type: type || 'image/png' }));
      });
    const apply = vi.fn();
    const user = userEvent.setup();
    render(<ImageCropDialog file={new File(['png'], 'opaque-artwork.png', { type: 'image/png' })}
      title="desktop banner" outputWidth={2172} outputHeight={724} onApply={apply} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: /save as/i })).toHaveValue('image/jpeg'));
    await user.click(screen.getByRole('button', { name: 'Apply crop' }));
    await waitFor(() => expect(apply).toHaveBeenCalledOnce());
    const image = apply.mock.calls[0][0] as File;
    expect(image.type).toBe('image/jpeg');
    expect(image.name).toBe('opaque-artwork-cropped.jpg');
    expect(image.size).toBeLessThanOrEqual(512 * 1024);
    expect(encoding.mock.calls.some(([, type, quality]) => type === 'image/jpeg' && (quality ?? 0) < 0.80)).toBe(true);
    expect(screen.getByText(/2172 × 724 px/)).toBeInTheDocument();
  });

  it('retains PNG for a transparent banner instead of flattening its artwork', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(), drawImage, fillRect: vi.fn(), imageSmoothingQuality: 'high',
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([255, 255, 255, 0]) })),
    } as unknown as CanvasRenderingContext2D);
    const apply = vi.fn();
    const user = userEvent.setup();
    render(<ImageCropDialog file={new File(['png'], 'transparent-artwork.png', { type: 'image/png' })}
      title="mobile banner" outputWidth={768} outputHeight={520} onApply={apply} onCancel={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('combobox', { name: /save as/i })).toHaveValue('image/png'));
    await user.click(screen.getByRole('button', { name: 'Apply crop' }));
    await waitFor(() => expect(apply).toHaveBeenCalledOnce());
    expect((apply.mock.calls[0][0] as File).type).toBe('image/png');
  });

  it('uses the separately approved 768 × 520 mobile crop instead of stretching desktop', async () => {
    const apply = vi.fn();
    const cancel = vi.fn();
    const user = userEvent.setup();
    render(<ImageCropDialog file={new File(['png'], 'mobile.png', { type: 'image/png' })}
      title="mobile banner" outputWidth={768} outputHeight={520} onApply={apply} onCancel={cancel} />);
    await screen.findByText(/768 × 520 px/);
    await user.click(screen.getByRole('button', { name: 'Apply crop' }));
    await waitFor(() => expect(apply).toHaveBeenCalledOnce());
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
