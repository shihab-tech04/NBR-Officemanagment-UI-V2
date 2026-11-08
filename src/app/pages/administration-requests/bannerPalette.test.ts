import { describe, expect, it } from 'vitest';
import { FALLBACK_PALETTE, contrastRatio, paletteFromPixels, validateBannerPalette } from './bannerPalette';

function pixels(colors: [number, number, number][]): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flatMap(c => [...c, 255]));
}
describe('cropped banner palette extraction', () => {
  it('uses a dominant purple hue but produces a light surface and AA-dark text', () => {
    const colors: [number,number,number][] = [];
    for(let i=0;i<400;i++) colors.push(i<340?[168,116,206]:[32,187,99]);
    const palette=paletteFromPixels(pixels(colors),20,20);
    expect(validateBannerPalette(palette)).toBeNull();
    expect(palette.background_color).not.toEqual(FALLBACK_PALETTE.background_color);
    for(const key of ['heading_color','body_color','outline_color'] as const) {
      expect(contrastRatio(palette.background_color!,palette[key]!)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('falls back to approved colors for a colorless or unreadable image', () => {
    expect(paletteFromPixels(pixels(Array.from({length:400},()=>[241,241,241])),20,20))
      .toEqual(FALLBACK_PALETTE);
  });
  it('rejects dark backgrounds, incomplete palettes, and invisible manual overrides', () => {
    expect(validateBannerPalette({...FALLBACK_PALETTE,background_color:'#111111'})).toMatch(/light/);
    expect(validateBannerPalette({...FALLBACK_PALETTE,heading_color:null})).toMatch(/four/);
    expect(validateBannerPalette({...FALLBACK_PALETTE,heading_color:'#EAF2FF'})).toMatch(/contrast/);
  });
});
