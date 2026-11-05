import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyPublicImage } from './verifyPublicImage';

const cms = {
  storage: { from: () => ({ getPublicUrl: (path: string) =>
    ({ data: { publicUrl: 'https://images.test/' + path } }) }) },
} as unknown as SupabaseClient;

afterEach(() => vi.unstubAllGlobals());

describe('anonymous public image delivery verification', () => {
  it('accepts a fully loaded image with non-zero intrinsic dimensions', async () => {
    class GoodImage {
      naturalWidth = 1469;
      naturalHeight = 496;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_url: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', GoodImage);
    await expect(verifyPublicImage(cms, 'taxpay-branding', 'logos/a.png')).resolves.toBeUndefined();
  });

  it('rejects a public image that fails to load', async () => {
    class BrokenImage {
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_url: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal('Image', BrokenImage);
    await expect(verifyPublicImage(cms, 'taxpay-banners', 'banners/broken.png'))
      .rejects.toThrow('Public image cannot be loaded');
  });

  it('rejects a loaded response that cannot be decoded', async () => {
    class BadDimensions {
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_url: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', BadDimensions);
    await expect(verifyPublicImage(cms, 'taxpay-banners', 'banners/invalid.png'))
      .rejects.toThrow('cannot be decoded');
  });
});
