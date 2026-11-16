import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import type {StoryPayment} from '../story1OfficeApi';
import {OfficePaymentDashboardInsights} from '../OfficePaymentDashboardInsights';

const saved:StoryPayment={
  id:'record-1',service:'OTHER_TAX_PAYMENT',status:'SIMULATED_SUCCESS',
  amountMinor:12000,createdAt:'2026-11-16T00:00:00Z',
  details:{taxpayerTin:'001234567890',assessmentYear:'2026-27',paymentMethod:'BKASH'}
};
const failed:StoryPayment={
  id:'record-2',service:'TRAVEL_TAX',status:'FAILED',
  amountMinor:1000,createdAt:'2026-11-16T01:00:00Z',
  details:{assessmentYear:'2025-26'}
};
const view=(payments:StoryPayment[],year='all',language:'en'|'bn'='en')=>
  renderToStaticMarkup(<OfficePaymentDashboardInsights
    payments={payments} year={year} language={language}
    formatCount={n=>String(n)} formatDate={date=>date}
    onOpenPayment={()=>{}} onViewTransactions={()=>{}} onSelectYear={()=>{}}
  />);

describe('Office payment monitoring content',()=>{
  it('shows operational review, recorded methods and evidence limitations in the shared cards',()=>{
    const html=view([saved,failed]);
    expect(html).toContain('Operational review');
    expect(html).toContain('Source and reconciliation evidence');
    expect(html).toContain('Recorded payment methods');
    expect(html).toContain('bKash');
    expect(html).toContain('Not verified here');
    expect(html).toContain('Evidence unavailable');
    expect(html).not.toContain('Treasury collections verified');
  });
  it('handles a genuinely empty read without inventing activity or a settlement result',()=>{
    const html=view([]);
    expect(html).toContain('No matching payment records.');
    expect(html).toContain('No recorded activity for this period.');
    expect(html).toContain('Not verified here');
  });
  it('keeps the complete dashboard structure visible when the secured source fails, without showing stale totals',()=>{
    const html=renderToStaticMarkup(<OfficePaymentDashboardInsights
      payments={[saved]} year="all" language="en"
      formatCount={n=>String(n)} formatDate={date=>date}
      loading={false} error="Office transactions temporarily unavailable"
      onRetry={()=>{}} onOpenPayment={()=>{}} onViewTransactions={()=>{}} onSelectYear={()=>{}}
    />);
    expect(html).toContain('data-source-state="unavailable"');
    expect(html).toContain('Operational review');
    expect(html).toContain('Source and reconciliation evidence');
    expect(html).toContain('Payments by service');
    expect(html).toContain('Record completeness');
    expect(html).toContain('Retry');
    expect(html).toContain('Unavailable');
    expect(html).toContain('Payment data unavailable.');
    expect(html).not.toContain('Read successful');
    expect(html).not.toContain('bKash');
    expect(html).not.toContain('record-1');
  });
  it('shows honest loading state with no retry action during refresh',()=>{
    const html=renderToStaticMarkup(<OfficePaymentDashboardInsights
      payments={[]} year="all" language="bn"
      formatCount={n=>String(n)} formatDate={date=>date}
      loading={true} onRetry={()=>{}} onOpenPayment={()=>{}} onViewTransactions={()=>{}} onSelectYear={()=>{}}
    />);
    expect(html).toContain('data-source-state="loading"');
    expect(html).toContain('লোড হচ্ছে');
    expect(html).not.toContain('Retry Office payments');
    expect(html).toContain('উৎস ও সমন্বয় যাচাই');
  });
  it('supports the approved Bengali layout and scopes record indicators to the selected year',()=>{
    const html=view([saved,failed],'2026-27','bn');
    expect(html).toContain('কার্যক্রম পর্যালোচনা');
    expect(html).toContain('উৎস ও সমন্বয় যাচাই');
    expect(html).not.toContain('record-2');
  });
});
