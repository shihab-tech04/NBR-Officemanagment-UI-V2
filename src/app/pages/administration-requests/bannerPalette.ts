/**
 * Turn the ACTUAL cropped upload pixels into a gentle accessible banner theme.
 * No external image service, upload, API key, or change to the original crop.
 */
export type BannerPalette = {
  background_color: string | null;
  heading_color: string | null;
  body_color: string | null;
  outline_color: string | null;
};
export type PaletteKey = keyof BannerPalette;

export const PALETTE_KEYS: PaletteKey[] = [
  'background_color', 'heading_color', 'body_color', 'outline_color',
];
export const EMPTY_PALETTE: BannerPalette = {
  background_color: null, heading_color: null, body_color: null, outline_color: null,
};
export const FALLBACK_PALETTE: BannerPalette = {
  background_color: '#EAF2FF', heading_color: '#1E4484',
  body_color: '#354F75', outline_color: '#1E4484',
};

function toHex(n: number): string {
  return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0').toUpperCase();
}
function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = saturation / 100, l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const secondary = chroma * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - chroma / 2;
  const pairs = [
    [chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary],
    [0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary],
  ];
  const [r, g, b] = pairs[Math.floor(h / 60) % 6];
  return '#' + toHex((r + m) * 255) + toHex((g + m) * 255) + toHex((b + m) * 255);
}
function luminance(hex: string): number {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
/** Match the tint and the readable ink to one color family, not just AA. */
export function paletteHue(hex: string): number | null {
  if(!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  if(delta<.025) return null; // near-neutral paper has no reliable hue
  let h=0;
  if(max===r) h=((g-b)/delta)%6;
  else if(max===g) h=(b-r)/delta+2;
  else h=(r-g)/delta+4;
  return ((h*60)%360+360)%360;
}
export function paletteHueDistance(a:string,b:string):number|null {
  const x=paletteHue(a),y=paletteHue(b);
  return x===null||y===null?null:Math.min(Math.abs(x-y),360-Math.abs(x-y));
}

export function validateBannerPalette(palette: BannerPalette): string | null {
  const values = PALETTE_KEYS.map(key => palette[key]);
  if (values.every(value => value == null)) return null; // historical banners
  if (values.some(value => typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)))
    return 'All four banner colors must be valid six-digit hex values.';
  const background = palette.background_color!;
  if (luminance(background) < .72) return 'The banner background must be a light shade.';
  if (PALETTE_KEYS.slice(1).some(key => contrastRatio(background, palette[key]!) < 4.5))
    return 'The heading, body, and outlined button need at least 4.5:1 contrast.';
  const heading=palette.heading_color!;
  // The light backdrop may be virtually neutral paper, which has no reliable
  // hue. Chromatic backdrops and all colored ink must be one visual family.
  const visualColors=[heading,palette.body_color!,palette.outline_color!];
  if(visualColors.some(color => {
    const distance=paletteHueDistance(heading,color);
    return distance!==null && distance>32;
  }) || visualColors.some(color => {
    const distance=paletteHueDistance(background,color);
    return distance!==null && distance>35;
  })) return 'The background, heading, body, and button must share one color family.';
  return null;
}

function fromHue(hue: number): BannerPalette {
  const background_color = hslToHex(hue, 45, 96);
  function dark(saturation: number, start: number): string {
    for (let light = start; light >= 8; light -= 2) {
      const candidate = hslToHex(hue, saturation, light);
      if (contrastRatio(background_color, candidate) >= 4.5) return candidate;
    }
    return '#172033';
  }
  return {
    background_color,
    heading_color: dark(58, 25),
    body_color: dark(38, 31),
    outline_color: dark(60, 30),
  };
}

/**
 * The canvas used by TaxPay is a panoramic illustration with space for copy
 * on the left. Matching the backdrop to those actual light pixels avoids
 * a visible strip/seam between the painting and the CSS color blend.
 *
 * Dark ink/objects and transparent pixels are ignored. Images without a
 * usable light edge retain the pre-existing hue-derived fallback.
 */
export function backgroundFromArtworkLeft(pixels: Uint8ClampedArray, width: number, height: number): string | null {
  if (width<=0 || height<=0 || pixels.length<width*height*4) return null;
  const edgeWidth=Math.max(1,Math.round(width*.14));
  let red=0, green=0, blue=0, samples=0;
  for(let y=0;y<height;y+=2) {
    for(let x=0;x<edgeWidth;x++) {
      const i=(y*width+x)*4;
      if(pixels[i+3]<210)continue;
      const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
      const max=Math.max(r,g,b), min=Math.min(r,g,b);
      // The paper/sky wash is bright; exclude foreground ink and landmarks.
      if((max+min)/2<190)continue;
      red+=r;green+=g;blue+=b;samples++;
    }
  }
  if(samples<Math.max(4,Math.ceil(height/2)*edgeWidth*.16))return null;
  let r=red/samples,g=green/samples,b=blue/samples;
  // Keep the original hue, brighten only when necessary for safe dark copy.
  let hex='#'+toHex(r)+toHex(g)+toHex(b);
  for(let step=0;step<16 && luminance(hex)<.72;step++){
    r=r*.90+255*.10;g=g*.90+255*.10;b=b*.90+255*.10;
    hex='#'+toHex(r)+toHex(g)+toHex(b);
  }
  return luminance(hex)>=.72?hex:null;
}

/**
 * A light surface and its dark heading must belong to the SAME image hue.
 * An exact pale left edge is used only when it belongs to the motif's hue
 * family. An unrelated watercolor-paper hue should not produce a mismatched
 * blue background with amber text (or vice versa).
 */
export function harmonizedBannerBackground(
  sampledEdge: string | null, motifHue: number, generatedBackground: string
): string {
  if (!sampledEdge) return generatedBackground;
  const c=[1,3,5].map(i=>parseInt(sampledEdge.slice(i,i+2),16)/255);
  const high=Math.max(...c),low=Math.min(...c),delta=high-low;
  if(delta<0.055) return generatedBackground;
  let edgeHue=0;
  if(high===c[0]) edgeHue=((c[1]-c[2])/delta)%6;
  else if(high===c[1]) edgeHue=(c[2]-c[0])/delta+2;
  else edgeHue=(c[0]-c[1])/delta+4;
  edgeHue=(edgeHue*60+360)%360;
  const diff=Math.abs(edgeHue-motifHue);
  // Only accept a close hue match; otherwise retain the motif-derived tint.
  return Math.min(diff,360-diff)<=24 ? sampledEdge : generatedBackground;
}

/** Exported pure function also permits tests without Canvas or a browser. */
export function paletteFromPixels(pixels: Uint8ClampedArray, width: number, height: number): BannerPalette {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) return FALLBACK_PALETTE;
  // Use broad, overlapping hue families. Highly detailed watercolors often
  // spread a cohesive blue/teal wash over adjacent fine hue bins while a
  // concentrated brown object wins any single narrow 15-degree bin.
  const bins = Array.from({ length: 12 }, () => ({ weight: 0, sin: 0, cos: 0 }));
  let sampled = 0;
  let colored = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] < 210) continue;
      sampled++;
      const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
      const high = Math.max(r, g, b), low = Math.min(r, g, b), delta = high - low;
      const light = (high + low) / 2;
      const sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));
      // The TaxPay artworks are panoramic ink-and-watercolor illustrations:
      // the left half is deliberately pale for text, while the painted
      // subject and its real theme are concentrated on the right.
      // Older extraction favored beige paper pixels and often selected brown
      // for blue-water/airport artwork. Include soft watercolor blues/teals
      // but exclude paper/black outlines and near-neutral tint.
      if (sat < .12 || light < .13 || light > .92 ||
          (light > .80 && delta < .16)) continue;
      colored++;
      let hue = 0;
      if (high === r) hue = ((g - b) / delta) % 6;
      else if (high === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue = (hue * 60 + 360) % 360;
      // Weight the illustrated half rather than the blank paper behind
      // the text. Favor a substantial painted wash over a tiny sharp accent;
      // no service-specific hardcoded hue or brand color is inferred.
      const motifWeight = x < width * .42 ? .18 : 1.9;
      // Ink/paper neutrals may cover much more area than painted water and
      // sky. Weight by actual pigment chroma without hardcoding a preferred
      // hue, so an amber painting still produces an amber banner.
      const chromaWeight = Math.pow(delta, 1.2) * (.65 + sat * .35);
      const weight = motifWeight * chromaWeight;
      const bin = bins[Math.floor(hue / 30) % bins.length];
      bin.weight += weight;
      bin.sin += Math.sin(hue * Math.PI / 180) * weight;
      bin.cos += Math.cos(hue * Math.PI / 180) * weight;
    }
  }
  if (colored < Math.max(4, sampled * .012)) return FALLBACK_PALETTE;
  // Two neighboring sectors form a 60-degree palette family. This captures
  // a blue/teal watercolor wash spread between hues 170–220 without making a
  // small isolated orange accent the whole banner's theme.
  const families = bins.map((item, index) => {
    const next = bins[(index + 1) % bins.length];
    return { weight: item.weight + next.weight, sin: item.sin + next.sin, cos: item.cos + next.cos };
  });
  const dominant = families.reduce((best, item) => item.weight > best.weight ? item : best, families[0]);
  if (dominant.weight <= 0) return FALLBACK_PALETTE;
  const hue = (Math.atan2(dominant.sin, dominant.cos) * 180 / Math.PI + 360) % 360;
  const huePalette = fromHue(hue);
  // Source-painted light left edge and dark motif hue serve different roles.
  // Use the actual artwork surface behind the copy rather than generating an
  // unrelated light tint from the colored objects on the right.
  const leftEdge = backgroundFromArtworkLeft(pixels, width, height);
  const background_color = harmonizedBannerBackground(leftEdge, hue, huePalette.background_color);
  const palette={...huePalette,background_color};
  return validateBannerPalette(palette) ? FALLBACK_PALETTE : palette;
}

export async function analyzeCroppedBanner(file: File): Promise<BannerPalette> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 144;
    canvas.height = Math.max(1, Math.min(144, Math.round(144 * bitmap.height / bitmap.width)));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Your browser cannot analyze banner colors.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    return paletteFromPixels(imageData.data, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
}
