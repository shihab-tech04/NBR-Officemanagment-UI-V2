import type { CSSProperties } from 'react';
import { WalletCards } from 'lucide-react';
import type { BannerPalette } from './bannerPalette';

type BannerPreviewData = BannerPalette & {
  service_code: string | null;
  heading_en: string; heading_bn: string; description_en: string; description_bn: string;
  mobile_heading_en: string; mobile_heading_bn: string;
  mobile_description_en: string; mobile_description_bn: string;
  action_en: string; action_bn: string;
};

/* Match TaxPay's published service tokens for records created before
 * custom palettes existed. Image-derived colors always take precedence. */
export const TAXPAY_BANNER_FALLBACK_THEMES: Record<string, readonly [string, string, string, string]> = {
  intro: ['#EAF2FF','#172033','#5F6B7A','#2C5EAD'],
  TAX_WITH_RETURN: ['#EEF4FF','#214887','#4D6486','#315DAA'],
  ADVANCE_TAX: ['#FFF6EC','#80420D','#765334','#A65B19'],
  SOURCE_TAX_DEPOSIT: ['#F6F1FC','#4E327B','#5A4673','#6D4BA8'],
  TRAVEL_TAX: ['#ECF8FC','#07516B','#316078','#0C6D8D'],
};
export type BannerPreviewDevice = 'desktop' | 'mobile';
export type BannerPreviewLanguage = 'en' | 'bn';

export function BannerFullPreview({banner,imageSrc,device,language,travelAction}:{
  banner:BannerPreviewData;
  imageSrc:string|null;
  device:BannerPreviewDevice;
  language:BannerPreviewLanguage;
  travelAction:string;
}) {
  const fallback=TAXPAY_BANNER_FALLBACK_THEMES[banner.service_code || 'intro'] || TAXPAY_BANNER_FALLBACK_THEMES.intro;
  const theme={
    '--preview-bg':banner.background_color || fallback[0],
    '--preview-heading':banner.heading_color || fallback[1],
    '--preview-body':banner.body_color || fallback[2],
    '--preview-outline':banner.outline_color || fallback[3],
  } as CSSProperties;
  const isMain=!banner.service_code;
  const isMobile=device==='mobile';
  const bn=language==='bn';
  const title=isMobile?(bn?banner.mobile_heading_bn:banner.mobile_heading_en):(bn?banner.heading_bn:banner.heading_en);
  const body=isMobile?(bn?banner.mobile_description_bn:banner.mobile_description_en):(bn?banner.description_bn:banner.description_en);
  const action=bn?banner.action_bn:banner.action_en;
  return <section className={"cms-theme-preview cms-theme-preview--"+device}
    data-payment-service={banner.service_code || undefined}
    data-preview-palette={banner.background_color && banner.heading_color && banner.body_color && banner.outline_color ? 'image' : 'fallback'}
    style={theme} role="img" aria-label={"Unpublished "+device+" banner preview: "+title}>
    <div className="cms-theme-preview__copy">
      <h3>{title}</h3>
      <p>{body}</p>
      <div className="cms-theme-preview__actions" aria-hidden="true">
        <span className={isMain?'cms-theme-preview__primary':'cms-theme-preview__outline'}>
          <WalletCards size={16}/>{action}
        </span>
        {isMain && <span className="cms-theme-preview__outline"><WalletCards size={16}/>{travelAction}</span>}
      </div>
    </div>
    <div className="cms-theme-preview__media" aria-hidden="true">
      {imageSrc && <img src={imageSrc} alt=""/>}
    </div>
  </section>;
}
