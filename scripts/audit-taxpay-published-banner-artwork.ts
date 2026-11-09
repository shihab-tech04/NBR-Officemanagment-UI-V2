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

/**
 * Verify real computed public TaxPay colors, not merely SQL or CSS variables.
 * Read-only. No sign-in, payment, publishing, or UI state modification.
 */
const liveBrowser=await chromium.launch({headless:true});
const verifiedScreens=[];
try{
  const page=await liveBrowser.newPage({viewport:{width:1280,height:820}});
  await page.goto('https://shihab-tech04.github.io/nbr-taxpay/?action=landing',
    {waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>
    document.querySelectorAll('.public-hero-carousel__slide[data-banner-palette="image"]').length===5,
    {timeout:45000});
  for(const width of [1280,390]){
    await page.setViewportSize({width,height:820});
    const observed=await page.evaluate(()=>{
      const slides=[...document.querySelectorAll('.public-hero-carousel__slide')] as HTMLElement[];
      return slides.map(slide=>{
        const heading=slide.querySelector('h1,h2') as HTMLElement | null;
        const body=slide.querySelector('.citizen-public-hero__copy > p') as HTMLElement | null;
        const button=slide.querySelector(
          slide.dataset.bannerKind==='intro' ? '.public-hero-carousel__travel' : '.citizen-public-primary'
        ) as HTMLElement | null;
        const art=slide.querySelector('img') as HTMLElement | null;
        return {
          id:slide.dataset.bannerService,
          background:getComputedStyle(slide).backgroundColor,
          heading:heading?getComputedStyle(heading).color:null,
          body:body?getComputedStyle(body).color:null,
          outline:border(button),
          buttonText:button?getComputedStyle(button).color:null,
          imageFit:art?getComputedStyle(art).objectFit:null,
          palette:slide.dataset.bannerPalette,
        };
        function border(node:HTMLElement|null){return node?getComputedStyle(node).borderTopColor:null;}
      });
    });
    if(observed.length!==banners.length)throw Error('Unexpected live carousel count at '+width);
    const toRgb=(hex:string|null)=>{
      if(!hex)return null;
      const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
      return 'rgb('+v.join(', ')+')';
    };
    for(const row of banners){
      const live=observed.find(z=>z.id===row.id);
      if(!live)throw Error(row.id+' missing in live DOM at '+width);
      const expected={
        background:toRgb(row.background_color),heading:toRgb(row.heading_color),
        body:toRgb(row.body_color),outline:toRgb(row.outline_color),
      };
      for(const [key,value] of Object.entries(expected)){
        const actual=live[key as keyof typeof expected];
        if(actual!==value)throw Error(row.id+' '+width+'px '+key+' CSS mismatch: '+actual+' vs SQL '+value);
      }
      if(live.buttonText!==expected.outline||live.imageFit!=='contain'||live.palette!=='image')
        throw Error(row.id+' '+width+'px CTA or image fit mismatch: '+JSON.stringify(live));
    }
    console.log('LIVE_TAXPAY_COMPUTED_COLORS_PASS '+width+'px '+banners.length+' banners');
    verifiedScreens.push({width,banners:observed});
  }
}finally {await liveBrowser.close();}
await writeFile('banner-live-dom-color-readback.json',JSON.stringify({
  checkedAt:new Date().toISOString(),website:'https://shihab-tech04.github.io/nbr-taxpay/',
  matchingPublishedSql:true,screens:verifiedScreens,
},null,2)+'\n');

console.log('READ_ONLY_AUDIT_COMPLETED '+report.length+' banners, all saved and derived palettes valid');
