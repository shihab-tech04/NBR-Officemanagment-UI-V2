/**
 * Read-only pixel audit of the five already-published TaxPay banners.
 * No Office authentication and absolutely no SQL/storage writes.
 */
import sharp from 'sharp';
import { paletteFromPixels, validateBannerPalette, backgroundFromArtworkLeft } from '../src/app/pages/administration-requests/bannerPalette.ts';

const BUCKET='https://eyqhoavnitkrajvyqvxn.supabase.co/storage/v1/object/public/taxpay-banners/';
const artwork=[
 ['intro','banners/intro/c6bd8f1e-611d-4691-932f-9b6812f46085.jpg','#F7F5E6','#65531B','#6D5F31','#7A651F'],
 ['return','banners/return/ffa907f6-1ee0-4ebb-86a1-f75392849905.png','#ECF8FC','#1B4D65','#315A6D','#1F5D7A'],
 ['advance','banners/advance/4ecafe03-442a-4b58-9da8-ca577d34b3a1.png','#FAF1DD','#65501B','#6D5C31','#7A611F'],
 ['withholding','banners/withholding/1affb273-1f0e-4cdf-bcb4-e06d5c1e15e8.png','#F8E7F6','#651B63','#6D316C','#7A1F78'],
 ['travel','banners/travel/5a02e106-bcc0-4aba-8021-6520d289c009.png','#ECF8FC','#07516B','#316078','#0C6D8D'],
];
const output=[];
const dist=(x,y)=>Math.round(Math.hypot(...[1,3,5].map(i=>parseInt(x.slice(i,i+2),16)-parseInt(y.slice(i,i+2),16))));
for(const [id,path,bg,heading,body,outline] of artwork){
  const response=await fetch(BUCKET+path,{signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error('Cannot download published '+id+': '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  const info=await sharp(bytes).metadata();
  const sampleHeight=Math.max(1,Math.min(144,Math.round(144*info.height/info.width)));
  const {data,info:rawInfo}=await sharp(bytes).resize(144,sampleHeight,{fit:'fill'}).removeAlpha().ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const pixels=new Uint8ClampedArray(data);
  const derived=paletteFromPixels(pixels,rawInfo.width,rawInfo.height);
  const edge=backgroundFromArtworkLeft(pixels,rawInfo.width,rawInfo.height);
  const audit={id,pixelDimensions:[info.width,info.height],bytes:bytes.length,edge,
    saved:{background_color:bg,heading_color:heading,body_color:body,outline_color:outline},
    computed:derived,
    colorError:validateBannerPalette(derived),
    difference:{bg:dist(bg,derived.background_color),heading:dist(heading,derived.heading_color),body:dist(body,derived.body_color),outline:dist(outline,derived.outline_color)},
    sourcePath:path};
  output.push(audit);
  console.log('IMAGE_AUDIT '+JSON.stringify(audit));
}
await (await import('node:fs/promises')).writeFile('banner-live-pixel-audit.json',JSON.stringify(output,null,2));
console.log('ALL_FIVE_IMAGES_FETCHED '+output.length);
