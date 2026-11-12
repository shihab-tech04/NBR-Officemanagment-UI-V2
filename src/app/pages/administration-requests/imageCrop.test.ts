import { describe, expect, it } from 'vitest';
import { BANNER_JPEG_TARGET_BYTES, canvasHasTransparency, cropWindow, isBannerImageCrop, isSupportedImageType, validateImageFile } from './imageCrop';

describe('image crop math and upload restrictions', () => {
  it('keeps the approved banner output dimensions and a strict compressed JPEG target', () => {
    expect(isBannerImageCrop(2172, 724)).toBe(true);
    expect(isBannerImageCrop(768, 520)).toBe(true);
    expect(isBannerImageCrop(2150, 440)).toBe(false);
    expect(BANNER_JPEG_TARGET_BYTES).toBe(512 * 1024);
  });

  it('preserves transparency and fails closed when pixel inspection is unavailable', () => {
    const opaque = { getImageData: () => ({ data: new Uint8ClampedArray([10, 20, 30, 255]) }) } as unknown as CanvasRenderingContext2D;
    const alpha = { getImageData: () => ({ data: new Uint8ClampedArray([10, 20, 30, 150]) }) } as unknown as CanvasRenderingContext2D;
    const unsupported = {} as CanvasRenderingContext2D;
    expect(canvasHasTransparency(opaque, 1, 1)).toBe(false);
    expect(canvasHasTransparency(alpha, 1, 1)).toBe(true);
    expect(canvasHasTransparency(unsupported, 1, 1)).toBe(true);
  });

  it('uses the entire 2:1 source for a matching desktop banner', () => {
    expect(cropWindow(2000, 1000, 2, 1, 0, 0)).toEqual({ sx: 0, sy: 0, sw: 2000, sh: 1000 });
  });

  it('zooms into the source and bounds draggable pan', () => {
    expect(cropWindow(2000, 1000, 2, 2, 0, 0)).toEqual({ sx: 500, sy: 250, sw: 1000, sh: 500 });
    expect(cropWindow(2000, 1000, 2, 2, 9, -9)).toEqual({ sx: 1000, sy: 0, sw: 1000, sh: 500 });
  });

  it('makes a wide logo window from a vertical source without exceeding image bounds', () => {
    const crop = cropWindow(800, 1200, 2150 / 440, 1.5, 0.4, -0.6);
    expect(crop.sw / crop.sh).toBeCloseTo(2150 / 440, 8);
    expect(crop.sx).toBeGreaterThanOrEqual(0);
    expect(crop.sy).toBeGreaterThanOrEqual(0);
    expect(crop.sx + crop.sw).toBeLessThanOrEqual(800);
    expect(crop.sy + crop.sh).toBeLessThanOrEqual(1200);
  });

  it('rejects WebP, unsupported MIME and oversized images', () => {
    expect(isSupportedImageType({ type: 'image/webp', size: 100 })).toBe(false);
    expect(isSupportedImageType({ type: 'image/gif', size: 100 })).toBe(false);
    expect(isSupportedImageType({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toBe(false);
    expect(isSupportedImageType({ type: 'image/jpeg', size: 1024 })).toBe(true);
  });

  it('checks image signatures, not just filenames and MIME labels', async () => {
    const png = new File([new Uint8Array([137,80,78,71,13,10,26,10,1])], 'sample.png', { type: 'image/png' });
    const jpg = new File([new Uint8Array([255,216,255,224,1])], 'sample.jpeg', { type: 'image/jpeg' });
    const disguised = new File([new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80])], 'fake.jpg', { type: 'image/jpeg' });
    await expect(validateImageFile(png)).resolves.toBeUndefined();
    await expect(validateImageFile(jpg)).resolves.toBeUndefined();
    await expect(validateImageFile(disguised)).rejects.toThrow(/contents do not match/);
  });
});
