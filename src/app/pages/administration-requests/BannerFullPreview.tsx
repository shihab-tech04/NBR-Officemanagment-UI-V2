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
export type BannerPreviewCopy = Pick<BannerPreviewData,
  'heading_en' | 'heading_bn' | 'description_en' | 'description_bn' |
  'mobile_heading_en' | 'mobile_heading_bn' | 'mobile_description_en' | 'mobile_description_bn' |
  'action_en' | 'action_bn'>;

const DEFAULT_FIXED_COPY: BannerPreviewCopy = {
  heading_en: 'Tax payments, without the confusion',
  heading_bn: 'কর পরিশোধে আর বিভ্রান্তি নয়।',
  mobile_heading_en: 'Pay tax with confidence',
  mobile_heading_bn: 'কর পরিশোধ সহজ করুন',
  description_en: 'Choose the payment you need, see what happens next, and keep the payment reference handy when you need it.',
  description_bn: 'যে কর পরিশোধ করতে চান, সেই সেবাটি বেছে নিন। ধাপে ধাপে এগিয়ে পেমেন্টের তথ্য সংরক্ষণ করুন।',
  mobile_description_en: 'Choose, pay and keep your record.',
  mobile_description_bn: 'কর দিন, পেমেন্টের তথ্য রাখুন।',
  action_en: 'Pay Tax',
  action_bn: 'কর পরিশোধ',
};

export function BannerFullPreview({banner,imageSrc,device,language,travelAction,fixedCopy=DEFAULT_FIXED_COPY}:{
  banner:BannerPreviewData;
  imageSrc:string|null;
  device:BannerPreviewDevice;
  language:BannerPreviewLanguage;
  travelAction:string;
  fixedCopy?:BannerPreviewCopy;
}) {
  const fallback=TAXPAY_BANNER_FALLBACK_THEMES[banner.service_code || 'intro'] || TAXPAY_BANNER_FALLBACK_THEMES.intro;
  const isMain=!banner.service_code;
  const customPalette=[banner.background_color,banner.heading_color,banner.body_color,banner.outline_color]
    .every(value=>typeof value==='string' && /^#[0-9a-fA-F]{6}$/.test(value));
  const theme={
    '--preview-bg':customPalette ? banner.background_color! : fallback[0],
    '--preview-heading':customPalette ? banner.heading_color! : fallback[1],
    '--preview-body':customPalette ? banner.body_color! : fallback[2],
    '--preview-outline':customPalette ? banner.outline_color! : fallback[3],
    '--preview-outline-text':customPalette ? banner.outline_color! : (isMain ? '#1E4484' : fallback[1]),
  } as CSSProperties;
  const isMobile=device==='mobile';
  const bn=language==='bn';
  const title=isMobile?(bn?fixedCopy.mobile_heading_bn:fixedCopy.mobile_heading_en):(bn?fixedCopy.heading_bn:fixedCopy.heading_en);
  const body=isMobile?(bn?fixedCopy.mobile_description_bn:fixedCopy.mobile_description_en):(bn?fixedCopy.description_bn:fixedCopy.description_en);
  const action=bn?fixedCopy.action_bn:fixedCopy.action_en;
  return <section className={"cms-theme-preview cms-theme-preview--"+device}
    data-payment-service={banner.service_code || undefined}
    data-fixed-left="true"
    data-preview-palette={customPalette ? 'image' : 'fallback'}
    style={theme} role="img" aria-label={
      "Unpublished "+device+" banner preview. "+title+". "+body+" Actions shown: "+action+"; "+travelAction+"."
    }>
    <div className="cms-theme-preview__copy">
      <h3>{title}</h3>
      <p>{body}</p>
      <div className="cms-theme-preview__actions" aria-hidden="true">
        <span className="cms-theme-preview__primary">
          <WalletCards size={16}/>{action}
        </span>
        <span className="cms-theme-preview__outline"><WalletCards size={16}/>{travelAction}</span>
      </div>
    </div>
    <div className="cms-theme-preview__media" aria-hidden="true">
      {imageSrc && <img src={imageSrc} alt=""/>}
    </div>
  </section>;
}
