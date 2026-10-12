import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const payment = readFileSync(new URL('../src/app/pages/payments/PaymentModulePage.tsx', root), 'utf8');
const css = readFileSync(new URL('../src/styles/payment.css', root), 'utf8');

/** Regression contracts derived from the Office Management screenshot/design audit. */
describe('Payments UI consistency', () => {
  it('does not render developer banners or tax posting diagnostics', () => {
    expect(payment).not.toContain("t('referenceBanner')");
    expect(payment).not.toContain("t('analyticsDisclaimer')");
    expect(payment).not.toContain("t('modalNotice')");
    expect(payment).not.toContain("t('postingDisabled')");
    expect(payment).not.toContain("t('fictionalChannel')");
  });
  it('uses Office Management page, table, modal and drawer primitives', () => {
    for (const name of ['table-page__header','table-page__title','table-card__toolbar','ResponsiveTable','DynamicDetailsDrawer','AppModal','TabBar','StatCard']) {
      expect(payment).toContain(name);
    }
    expect(payment).toContain('size="sm" icon={FilePlus2}');
    expect(payment).toContain('<SecondaryButton size="sm"');
  });
  it('fills the workspace and does not truncate KPI totals by default', () => {
    expect(css).toContain('flex:1 1 0; width:100%; min-width:0;');
    expect(css).toContain('white-space:normal; overflow:visible; text-overflow:clip');
    expect(css).toContain('grid-template-columns:repeat(3,minmax(0,1fr))');
  });
  it('adds draft rows in memory without payment or credit operations', () => {
    expect(payment).toContain('setLocalRecords(prev=>');
    expect(payment).toContain("status:t('draft')");
    expect(payment).toContain('draftPreview?saveDraft:previewDraft');
    expect(payment).not.toContain('fetch(');
  });
});