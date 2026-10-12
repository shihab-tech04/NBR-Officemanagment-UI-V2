import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path:string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const payment=read('src/app/pages/payments/PaymentModulePage.tsx');
const list=read('src/app/pages/payments/PaymentRecordList.tsx');
const css=read('src/styles/payment.css');

/** Original screenshot/design requirements, adapted to standard Office Management composition. */
describe('Payments UI consistency', () => {
  it('does not render developer banners or tax posting diagnostics', () => {
    for (const code of ["t('referenceBanner')","t('analyticsDisclaimer')","t('modalNotice')","t('postingDisabled')","t('fictionalChannel')"]) {
      expect(payment).not.toContain(code);
    }
  });
  it('uses Office Management page, table, modal and drawer primitives', () => {
    for (const name of ['table-page__header','table-page__title','PaymentRecordList','DynamicDetailsDrawer','AppModal','TabBar','CollapsibleKpiSection']) {
      expect(payment).toContain(name);
    }
    for (const name of ['table-card__toolbar','ResponsiveTable','AppSearchField','MobileSearchFilter','FilterPanel','MobileFilterOverlay','Pagination']) {
      expect(list).toContain(name);
    }
    expect(payment).toContain('table-card__toolbar-btn--primary');
    expect(payment).toContain('<SecondaryButton');
  });
  it('fills the workspace and does not truncate KPI totals by default', () => {
    expect(payment).toContain('className="table-page payment-module"');
    expect(css).toContain('width:100%; min-width:0;');
    expect(css).toContain('overflow:visible;');
    expect(css).toContain('overflow-wrap:anywhere;');
    expect(payment).toContain('CollapsibleKpiSection');
    expect(css).toContain('dashboard-kpi-grid--1row');
  });
  it('adds draft rows in memory without payment or credit operations', () => {
    expect(payment).toContain('moduleDrafts[draftKind]');
    expect(payment).toContain('setLocalRecords({...moduleDrafts})');
    expect(payment).toContain("status:'Draft'");
    expect(payment).toContain('draftPreview?saveDraft:previewDraft');
    expect(payment).not.toContain('fetch(');
    expect(payment).not.toContain('axios.');
  });
});
