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

describe('CMS preview is faithful to the TaxPay persisted palette', () => {
  it('uses all four saved colors on the full desktop banner, rather than fixed service colors', () => {
    const { container } = render(<BannerFullPreview banner={slide} imageSrc="/cropped-art.png" device="desktop"
      language="en" travelAction="Pay Travel Tax" />);
    const preview = screen.getByRole('img', {name:/Unpublished desktop banner preview/});
    expect(preview.getAttribute('data-preview-palette')).toBe('image');
    expect(preview.getAttribute('data-payment-service')).toBe('TAX_WITH_RETURN');
    expect(preview.getAttribute('style')).toContain('--preview-bg: #F1F6FA');
    expect(preview.getAttribute('style')).toContain('--preview-heading: #234868');
    expect(preview.getAttribute('style')).toContain('--preview-body: #375977');
    expect(preview.getAttribute('style')).toContain('--preview-outline: #265D79');
    expect(preview.getAttribute('style')).toContain('--preview-outline-text: #265D79');
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/cropped-art.png');
    expect(screen.getByText('Tax with Return')).toBeInTheDocument();
    expect(screen.getByText('Pay Tax with Return')).toBeInTheDocument();
  });
  it('switches to exact mobile and Bangla text without changing colors or image', () => {
    const { container } = render(<BannerFullPreview banner={slide} imageSrc="/cropped-art.png" device="mobile"
      language="bn" travelAction="ভ্রমণ কর পরিশোধ" />);
    expect(screen.getByRole('img',{name:/Unpublished mobile banner preview/}).getAttribute('style')).toContain('--preview-bg: #F1F6FA');
    expect(container.querySelector('.cms-theme-preview--mobile')).toBeInTheDocument();
    expect(container.querySelector('.cms-theme-preview__media img')?.getAttribute('src')).toBe('/cropped-art.png');
    expect(screen.getByText('রিটার্নের কর')).toBeInTheDocument();
    expect(screen.getAllByText('রিটার্নের কর দিন').length).toBeGreaterThan(0);
  });
  it('keeps the main banner primary and outlined actions paired in desktop and mobile previews', () => {
    const intro={...slide,service_code:null,action_en:'Pay Tax',action_bn:'কর দিন'};
    for(const device of ['desktop','mobile'] as const) {
      const {container,unmount}=render(<BannerFullPreview banner={intro} imageSrc="/intro.png"
        device={device} language="en" travelAction="Pay Travel Tax" />);
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
});
