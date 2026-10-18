export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_FILE_ACCEPT = '.png,.jpg,.jpeg,image/png,image/jpeg';

export type CropWindow = { sx: number; sy: number; sw: number; sh: number };

export function isSupportedImageType(file: Pick<File, 'type' | 'size'>): boolean {
  return (file.type === 'image/png' || file.type === 'image/jpeg') && file.size > 0 && file.size <= MAX_IMAGE_BYTES;
}

export async function validateImageFile(file: File): Promise<void> {
  if (!isSupportedImageType(file)) throw new Error('Select a PNG, JPG, or JPEG image of 5 MB or less. WebP is not accepted.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
    && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  const jpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (file.type === 'image/png' ? !png : !jpeg) throw new Error('The file contents do not match its PNG or JPEG format.');
}

/** Maps zoom and normalized pan (-1 to 1) to the region drawn from the original bitmap. */
export function cropWindow(imageWidth: number, imageHeight: number, aspect: number, zoom: number, panX: number, panY: number): CropWindow {
  const safeZoom = Math.max(1, zoom);
  const baseWidth = Math.min(imageWidth, imageHeight * aspect);
  const sw = baseWidth / safeZoom;
  const sh = sw / aspect;
  const maxX = (imageWidth - sw) / 2;
  const maxY = (imageHeight - sh) / 2;
  return {
    sx: maxX * (1 + Math.max(-1, Math.min(1, panX))),
    sy: maxY * (1 + Math.max(-1, Math.min(1, panY))),
    sw, sh,
  };
}

