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
  it('chooses the painted blue/teal scene over the warm paper text area', () => {
    const colors: [number,number,number][] = [];
    for(let y=0;y<20;y++) for(let x=0;x<50;x++) {
      colors.push(x < 23 ? [219,189,146] : [93,165,185]);
    }
    const palette=paletteFromPixels(pixels(colors),50,20);
    expect(validateBannerPalette(palette)).toBeNull();
    // Blue/teal hues produce visibly cool dark text and a pale cyan surface.
    const background=palette.background_color!;
    const dark=palette.heading_color!;
    const b=parseInt(background.slice(5,7),16),r=parseInt(background.slice(1,3),16);
    expect(b).toBeGreaterThan(r);
    expect(parseInt(dark.slice(5,7),16)).toBeGreaterThan(parseInt(dark.slice(1,3),16));
  });
  it('keeps the intended warm hue when the painted motif really is amber', () => {
    const colors: [number,number,number][]=[];
    for(let y=0;y<20;y++)for(let x=0;x<50;x++) colors.push(x<23?[229,226,212]:[182,113,40]);
    const palette=paletteFromPixels(pixels(colors),50,20);
    expect(validateBannerPalette(palette)).toBeNull();
    expect(parseInt(palette.heading_color!.slice(1,3),16)).toBeGreaterThan(
      parseInt(palette.heading_color!.slice(5,7),16));
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
