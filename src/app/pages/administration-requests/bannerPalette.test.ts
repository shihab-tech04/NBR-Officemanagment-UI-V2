import { describe, expect, it } from 'vitest';
import { FALLBACK_PALETTE, backgroundFromArtworkLeft, harmonizedBannerBackground, contrastRatio, paletteHueDistance, paletteFromPixels, validateBannerPalette } from './bannerPalette';

function pixels(colors: [number, number, number][]): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flatMap(c => [...c, 255]));
}
describe('cropped banner palette extraction', () => {
  it('does not mix a cool paper backdrop with an unrelated warm illustrated theme', () => {
    const colors:[number,number,number][]=[];
    for(let y=0;y<30;y++) for(let x=0;x<70;x++) {
      colors.push(x<15 ? [225,238,247] : [180,105,44]);
    }
    const bytes=pixels(colors),palette=paletteFromPixels(bytes,70,30);
    expect(backgroundFromArtworkLeft(bytes,70,30)).toBe('#E1EEF7');
    expect(palette.background_color).not.toBe('#E1EEF7');
    // Both light surface and dark text belong to the dominant amber motif.
    expect(parseInt(palette.background_color!.slice(1,3),16)).toBeGreaterThan(
      parseInt(palette.background_color!.slice(5,7),16));
    // Amber illustrated motif retains darker warm colors: no hard-coded blue.
    expect(parseInt(palette.heading_color!.slice(1,3),16)).toBeGreaterThan(
      parseInt(palette.heading_color!.slice(5,7),16));
    expect(validateBannerPalette(palette)).toBeNull();
  });
  it('keeps the exact pale image edge when its hue agrees with the motif', () => {
    expect(harmonizedBannerBackground('#E0F1F6',190,'#EFF9FA')).toBe('#E0F1F6');
    expect(harmonizedBannerBackground('#F2DFB8',190,'#EFF9FA')).toBe('#EFF9FA');
    expect(harmonizedBannerBackground(null,190,'#EFF9FA')).toBe('#EFF9FA');
  });
  it('ignores left-side dark ink and transparent pixels rather than tinting from them', () => {
    const colors:[number,number,number][]=[];
    for(let y=0;y<20;y++) for(let x=0;x<50;x++) colors.push(x<10?[33,33,33]:[65,141,183]);
    expect(backgroundFromArtworkLeft(pixels(colors),50,20)).toBeNull();
  });
  it('takes a broad pale purple watercolor wash instead of small strong olive props', () => {
    const colors: [number,number,number][] = [];
    for(let y=0;y<40;y++) for(let x=0;x<120;x++) {
      const purpleSky=x>22 && x<103 && y<28;
      colors.push(purpleSky ? [222,192,232] : [147,125,48]);
    }
    const theme=paletteFromPixels(pixels(colors),120,40);
    expect(validateBannerPalette(theme)).toBeNull();
    // Purple/blue ink is darker and more prominent than the green/yellow accent.
    const text=theme.heading_color!;
    expect(parseInt(text.slice(5,7),16)).toBeGreaterThan(parseInt(text.slice(3,5),16));
    expect(parseInt(text.slice(1,3),16)).toBeGreaterThan(parseInt(text.slice(3,5),16));
  });
  it('picks a broad warm travel watercolor even when it has small teal details', () => {
    const colors:[number,number,number][]=[];
    for(let y=0;y<40;y++)for(let x=0;x<120;x++) {
      const warmSky=x>22 && x<103 && y<28;
      colors.push(warmSky?[243,227,195]:[31,137,166]);
    }
    const theme=paletteFromPixels(pixels(colors),120,40);
    expect(validateBannerPalette(theme)).toBeNull();
    expect(parseInt(theme.heading_color!.slice(1,3),16))
      .toBeGreaterThan(parseInt(theme.heading_color!.slice(5,7),16));
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
  it('rejects unrelated manually selected hues even when their contrast is accessible', () => {
    const mismatched={background_color:'#F2EAD7', heading_color:'#164D7A',
      body_color:'#285B82',outline_color:'#164D7A'};
    expect(validateBannerPalette(mismatched)).toMatch(/one color family/);
    expect(paletteHueDistance('#F2EAD7','#164D7A')).toBeGreaterThan(35);
    const coordinated={...mismatched,background_color:'#E8F3FB'};
    expect(validateBannerPalette(coordinated)).toBeNull();
  });
  it('rejects dark backgrounds, incomplete palettes, and invisible manual overrides', () => {
    expect(validateBannerPalette({...FALLBACK_PALETTE,background_color:'#111111'})).toMatch(/light/);
    expect(validateBannerPalette({...FALLBACK_PALETTE,heading_color:null})).toMatch(/four/);
    expect(validateBannerPalette({...FALLBACK_PALETTE,heading_color:'#EAF2FF'})).toMatch(/contrast/);
  });
});
