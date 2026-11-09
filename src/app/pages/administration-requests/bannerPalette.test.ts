import { describe, expect, it } from 'vitest';
import { FALLBACK_PALETTE, backgroundFromArtworkLeft, contrastRatio, paletteFromPixels, validateBannerPalette } from './bannerPalette';

function pixels(colors: [number, number, number][]): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flatMap(c => [...c, 255]));
}
describe('cropped banner palette extraction', () => {
  it('matches the real pale left side while choosing a different dominant illustration hue', () => {
    const colors:[number,number,number][]=[];
    for(let y=0;y<30;y++) for(let x=0;x<70;x++) {
      colors.push(x<15 ? [225,238,247] : [180,105,44]);
    }
    const bytes=pixels(colors),palette=paletteFromPixels(bytes,70,30);
    expect(backgroundFromArtworkLeft(bytes,70,30)).toBe('#E1EEF7');
    expect(palette.background_color).toBe('#E1EEF7');
    // Amber illustrated motif retains darker warm colors: no hard-coded blue.
    expect(parseInt(palette.heading_color!.slice(1,3),16)).toBeGreaterThan(
      parseInt(palette.heading_color!.slice(5,7),16));
    expect(validateBannerPalette(palette)).toBeNull();
  });
  it('ignores left-side dark ink and transparent pixels rather than tinting from them', () => {
    const colors:[number,number,number][]=[];
    for(let y=0;y<20;y++) for(let x=0;x<50;x++) colors.push(x<10?[33,33,33]:[65,141,183]);
    expect(backgroundFromArtworkLeft(pixels(colors),50,20)).toBeNull();
  });
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
  it('selects a distributed blue-teal illustration instead of a concentrated small brown accent', () => {
    const colors: [number, number, number][] = [];
    for(let y=0;y<24;y++)for(let x=0;x<60;x++) {
      if(x<27) colors.push([239,236,230]);
      else if(x<38) colors.push([174,124,70]); // narrow brown motif
      else if(x<48) colors.push([75,153,184]); // blue wash
      else colors.push([78,165,153]); // teal wash
    }
    const p=paletteFromPixels(pixels(colors),60,24);
    expect(validateBannerPalette(p)).toBeNull();
    const heading=p.heading_color!;
    // The two neighboring cool bands beat the isolated warm subject.
    expect(parseInt(heading.slice(5,7),16)).toBeGreaterThan(parseInt(heading.slice(1,3),16));
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
