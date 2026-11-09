/**
 * Read-only production image→palette verification.
 * Fetches only PUBLIC banner rows/artwork; no privileged token, writes, or login.
 * Uses Chromium image decoding and the SAME paletteFromPixels implementation
 * that Office CMS runs on the uploaded/cropped artwork.
 */
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  backgroundFromArtworkLeft, paletteFromPixels, paletteHueDistance, validateBannerPalette,
  type BannerPalette,
} from '../src/app/pages/administration-requests/bannerPalette.ts';

const projectUrl='https://eyqhoavnitkrajvyqvxn.supabase.co';
const publicKey=process.env.TAXPAY_PUBLIC_KEY;
if(!publicKey) throw new Error('Missing publishable public read key');
type BannerRow=BannerPalette&{
 id:string;version:number;desktop_image_path:string|null;published:boolean;
};
const restUrl=projectUrl+'/rest/v1/taxpay_site_banners?select=id,version,published,desktop_image_path,background_color,heading_color,body_color,outline_color&published=eq.true&order=sort_order.asc';
const response=await fetch(restUrl,{headers:{apikey:publicKey,'Accept':'application/json'}});
if(!response.ok) throw Error('Public published banner read failed: '+response.status+' '+(await response.text()).slice(0,160));
const banners=await response.json() as BannerRow[];
if(banners.length!==5) throw Error('Expected five currently published banners; received '+banners.length);
const browser=await chromium.launch({headless:true});
const report=[];
await mkdir('banner-audit-images',{recursive:true});
try {
  const page=await browser.newPage();
  for(const row of banners) {
    if(!row.desktop_image_path) throw Error(row.id+': published image missing');
    const url=projectUrl+'/storage/v1/object/public/taxpay-banners/'+row.desktop_image_path;
    const asset=await fetch(url,{headers:{Accept:'image/avif,image/webp,image/png,image/jpeg,*/*'}});
    if(!asset.ok) throw Error(row.id+': public image read failed HTTP '+asset.status);
    const bin=Buffer.from(await asset.arrayBuffer());
    const mime=asset.headers.get('content-type')?.split(';')[0]||
      (row.desktop_image_path.endsWith('.png')?'image/png':'image/jpeg');
    // Audit-only copies of these already public images allow exact pixel analysis.
    await writeFile('banner-audit-images/'+row.id+(mime==='image/png'?'.png':'.jpg'),bin);
    const decoded=await page.evaluate(async({base64,mime})=>{
      const img=new Image();
      img.src='data:'+mime+';base64,'+base64;
      await img.decode();
      const canvas=document.createElement('canvas');
      canvas.width=144;
      canvas.height=Math.max(1,Math.min(144,Math.round(144*img.naturalHeight/img.naturalWidth)));
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      if(!ctx)throw Error('Canvas unavailable');
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      return {width:canvas.width,height:canvas.height,pixels:Array.from(ctx.getImageData(0,0,canvas.width,canvas.height).data),
        originalWidth:img.naturalWidth,originalHeight:img.naturalHeight};
    },{base64:bin.toString('base64'),mime});
    const pixels=Uint8ClampedArray.from(decoded.pixels);
    const generated=paletteFromPixels(pixels,decoded.width,decoded.height);
    const saved:BannerPalette={
      background_color:row.background_color,heading_color:row.heading_color,
      body_color:row.body_color,outline_color:row.outline_color,
    };
    function rgbDistance(a:string|null,b:string|null):number|null {
      if(!a||!b)return null;
      const aa=[1,3,5].map(i=>parseInt(a.slice(i,i+2),16));
      const bb=[1,3,5].map(i=>parseInt(b.slice(i,i+2),16));
      return Math.round(Math.hypot(...aa.map((x,i)=>x-bb[i])));
    }
    const colorDiff=Object.keys(generated).map(key=>{
      const k=key as keyof BannerPalette;
      return {key:k,published:saved[k],imageDerived:generated[k],
        rgbDistance:rgbDistance(saved[k],generated[k])};
    });
    const rec={
      id:row.id,version:row.version,path:row.desktop_image_path,
      sha256:createHash('sha256').update(bin).digest('hex'),
      fileBytes:bin.length,imageDimensions:[decoded.originalWidth,decoded.originalHeight],
      actualPaleEdge:backgroundFromArtworkLeft(pixels,decoded.width,decoded.height),
      published:saved,imageDerived:generated,
      publishedValidation:validateBannerPalette(saved),
      generatedValidation:validateBannerPalette(generated),
      backgroundHeadingHueDistance:paletteHueDistance(saved.background_color||'',saved.heading_color||''),
      colorDiff,
    };
    report.push(rec);
    console.log('BANNER_AUDIT '+JSON.stringify(rec));
  }
} finally { await browser.close(); }
await writeFile('banner-palette-live-audit.json',JSON.stringify({
  checkedAt:new Date().toISOString(),source:projectUrl,mode:'read-only',
  algorithms:'Office CMS production bannerPalette.ts',banners:report,
},null,2)+'\n');
if(report.some(row=>row.publishedValidation||row.generatedValidation))
 throw Error('At least one palette failed current accessibility/hue validation');
console.log('READ_ONLY_AUDIT_COMPLETED '+report.length+' banners, all saved and derived palettes valid');
