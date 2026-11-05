import type { SupabaseClient } from '@supabase/supabase-js';

/** A matching SQL path is insufficient: verify the anonymous public URL decodes. */
export async function verifyPublicImage(
  publicCms: SupabaseClient,
  bucket: 'taxpay-banners' | 'taxpay-branding',
  path: string,
): Promise<void> {
  const url = publicCms.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  if (!url || !url.startsWith('https://')) throw new Error('Public image URL is unavailable.');
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      img.onload = null;
      img.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    const timeout = window.setTimeout(
      () => finish(new Error('Public image could not be loaded within 12 seconds.')), 12_000);
    img.onload = () => img.naturalWidth > 0 && img.naturalHeight > 0
      ? finish()
      : finish(new Error('Public image cannot be decoded.'));
    img.onerror = () => finish(new Error('Public image cannot be loaded.'));
    img.src = url;
  });
}
