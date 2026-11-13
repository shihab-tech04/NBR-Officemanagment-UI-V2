import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BannerFullPreview, TAXPAY_BANNER_FALLBACK_THEMES } from './BannerFullPreview';

const slide = {
  service_code: 'TAX_WITH_RETURN',
  heading_en: 'Tax with Return', heading_bn: 'রিটার্নের সঙ্গে কর',
  mobile_heading_en: 'Tax with Return', mobile_heading_bn: 'রিটার্নের কর',
  description_en: 'Pay return tax', description_bn: 'রিটার্নের কর দিন',
  mobile_description_en: 'Pay return tax', mobile_description_bn: 'রিটার্নের কর দিন',
  action_en: 'Pay Tax with Return', action_bn: 'রিটার্নের কর দিন',
  background_color:'#F1F6FA', heading_color:'#234868',
  body_color:'#375977', outline_color:'#265D79',
};
const fixedCopy = {
  heading_en:'Tax payments, without the confusion', heading_bn:'কর পরিশোধে আর বিভ্রান্তি নয়।',
  mobile_heading_en:'Pay tax with confidence', mobile_heading_bn:'কর পরিশোধ সহজ করুন',
  description_en:'Choose the payment you need.', description_bn:'আপনার প্রয়োজনীয় পেমেন্ট বেছে নিন।',
  mobile_description_en:'Choose, pay and keep your record.', mobile_description_bn:'কর দিন, পেমেন্টের তথ্য রাখুন।',
  action_en:'Pay Tax', action_bn:'কর পরিশোধ',
};

describe('CMS preview is faithful to the TaxPay persisted palette', () => {
  it('keeps the uploaded panorama full-bleed across the desktop preview, like TaxPay', () => {
    // Protect the geometry itself: DOM-only tests cannot catch image scaling
    // when the preview shows a 50%-width media frame.
    const css=readFileSync(resolve(process.cwd(),'src/styles/content-management.css'),'utf8');
    expect(css).toMatch(/\.cms-theme-preview__media\s*\{[^}]*inset:\s*0;/);
    expect(css).toMatch(/\.cms-theme-preview__media img\s*\{[^}]*width:100%;height:100%;object-fit:contain/);
    expect(css).toMatch(/\.cms-theme-preview--mobile \.cms-theme-preview__media\s*\{[^}]*position:relative;inset:auto/);
    expect(css).not.toContain('inset:0 0 0 50%');
  });

  it('uses all four saved colors on the full desktop banner, rather than fixed service colors', () => {
    const { container } = render(<BannerFullPreview banner={slide} imageSrc="/cropped-art.png" device="desktop"
      language="en" travelAction="Pay Travel Tax" fixedCopy={fixedCopy} />);
    const preview = screen.getByRole('img', {name:/Unpublished desktop banner preview/});
    expect(preview).toHaveAccessibleName(
      'Unpublished desktop banner preview. Tax payments, without the confusion. Choose the payment you need. Actions shown: Pay Tax; Pay Travel Tax.',
    );
    expect(preview.getAttribute('data-preview-palette')).toBe('image');
    expect(preview.getAttribute('data-payment-service')).toBe('TAX_WITH_RETURN');
    expect(preview.getAttribute('style')).toContain('--preview-bg: #F1F6FA');
    expect(preview.getAttribute('style')).toContain('--preview-heading: #234868');
    expect(preview.getAttribute('style')).toContain('--preview-body: #375977');
    expect(preview.getAttribute('style')).toContain('--preview-outline: #265D79');
    expect(preview.getAttribute('style')).toContain('--preview-outline-text: #265D79');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/cropped-art.png');
    expect(screen.getByText('Tax payments, without the confusion')).toBeInTheDocument();
    expect(screen.getByText('Choose the payment you need.')).toBeInTheDocument();
    expect(screen.getByText('Pay Tax')).toBeInTheDocument();
    expect(screen.getByText('Pay Travel Tax')).toBeInTheDocument();
    expect(container.querySelectorAll('.cms-theme-preview__actions span')).toHaveLength(2);
  });
  it('switches to exact mobile and Bangla text without changing colors or image', () => {
    const { container } = render(<BannerFullPreview banner={slide} imageSrc="/cropped-art.png" device="mobile"
      language="bn" travelAction="ভ্রমণ কর পরিশোধ" fixedCopy={fixedCopy} />);
    const preview=screen.getByRole('img',{name:/Unpublished mobile banner preview/});
    expect(preview).toHaveAccessibleName(
      'Unpublished mobile banner preview. কর পরিশোধ সহজ করুন. কর দিন, পেমেন্টের তথ্য রাখুন। Actions shown: কর পরিশোধ; ভ্রমণ কর পরিশোধ.',
    );
    expect(preview.getAttribute('style')).toContain('--preview-bg: #F1F6FA');
    expect(container.querySelector('.cms-theme-preview--mobile')).toBeInTheDocument();
    expect(container.querySelector('.cms-theme-preview__media img')?.getAttribute('src')).toBe('/cropped-art.png');
    expect(screen.getByText('কর পরিশোধ সহজ করুন')).toBeInTheDocument();
    expect(screen.getByText('কর দিন, পেমেন্টের তথ্য রাখুন।')).toBeInTheDocument();
    expect(screen.getByText('কর পরিশোধ')).toBeInTheDocument();
    expect(screen.getByText('ভ্রমণ কর পরিশোধ')).toBeInTheDocument();
  });
  it('keeps the main banner primary and outlined actions paired in desktop and mobile previews', () => {
    const intro={...slide,service_code:null,action_en:'Pay Tax',action_bn:'কর দিন'};
    for(const device of ['desktop','mobile'] as const) {
      const {container,unmount}=render(<BannerFullPreview banner={intro} imageSrc="/intro.png"
        device={device} language="en" travelAction="Pay Travel Tax" fixedCopy={intro} />);
      const preview=container.querySelector('.cms-theme-preview')!;
      expect(preview).not.toHaveAttribute('data-payment-service');
      expect(preview.querySelectorAll('.cms-theme-preview__actions span')).toHaveLength(2);
      expect(preview.querySelector('.cms-theme-preview__primary')).toHaveTextContent('Pay Tax');
      expect(preview.querySelector('.cms-theme-preview__outline')).toHaveTextContent('Pay Travel Tax');
      expect(preview.querySelector('.cms-theme-preview__media img')?.getAttribute('src')).toBe('/intro.png');
      unmount();
    }
  });
  it('matches TaxPay service tokens when no custom palette was published', () => {
    const withoutPalette={...slide,background_color:null,heading_color:null,body_color:null,outline_color:null};
    const { container }=render(<BannerFullPreview banner={withoutPalette} imageSrc={null} device="desktop"
      language="en" travelAction="Pay Travel Tax" />);
    const preview=container.querySelector('.cms-theme-preview')!;
    expect(preview.getAttribute('data-preview-palette')).toBe('fallback');
    const fallback=TAXPAY_BANNER_FALLBACK_THEMES.TAX_WITH_RETURN;
    expect(preview.getAttribute('style')).toContain('--preview-bg: '+fallback[0]);
    expect(preview.getAttribute('style')).toContain('--preview-heading: '+fallback[1]);
    expect(preview.getAttribute('style')).toContain('--preview-outline: '+fallback[3]);
    expect(preview.getAttribute('style')).toContain('--preview-outline-text: '+fallback[1]);
    expect(TAXPAY_BANNER_FALLBACK_THEMES.ADVANCE_TAX[3]).toBe('#A65B19');
    expect(TAXPAY_BANNER_FALLBACK_THEMES.SOURCE_TAX_DEPOSIT[3]).toBe('#6D4BA8');
    expect(TAXPAY_BANNER_FALLBACK_THEMES.TRAVEL_TAX[3]).toBe('#0C6D8D');
  });
  it('falls back as a complete theme if any saved palette color is invalid', () => {
    const partial={...slide,body_color:'invalid'};
    const {container}=render(<BannerFullPreview banner={partial} imageSrc={null} device="desktop"
      language="en" travelAction="Pay Travel Tax" fixedCopy={fixedCopy} />);
    const preview=container.querySelector('.cms-theme-preview')!;
    const fallback=TAXPAY_BANNER_FALLBACK_THEMES.TAX_WITH_RETURN;
    expect(preview).toHaveAttribute('data-preview-palette','fallback');
    expect(preview.getAttribute('style')).toContain('--preview-bg: '+fallback[0]);
    expect(preview.getAttribute('style')).toContain('--preview-heading: '+fallback[1]);
    expect(preview.getAttribute('style')).toContain('--preview-body: '+fallback[2]);
    expect(preview.getAttribute('style')).toContain('--preview-outline: '+fallback[3]);
  });
});
