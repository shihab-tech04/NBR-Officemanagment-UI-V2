import {describe,expect,it} from 'vitest';
import {officePaymentAnalytics} from '../officePaymentAnalytics';
import type {StoryPayment} from '../story1OfficeApi';
const base:StoryPayment={id:'p1',service:'OTHER_TAX_PAYMENT',status:'SIMULATED_SUCCESS',
  amountMinor:1500,createdAt:'2026-11-05T06:10:00Z',details:{assessmentYear:'2026-27',paymentMethod:'BKASH'}};
const failed:StoryPayment={id:'p2',service:'TRAVEL_TAX',status:'FAILED',
  amountMinor:3500,createdAt:'2026-11-05T06:11:00Z',details:{assessmentYear:'2025-26'}};
const multiYear:StoryPayment={id:'p-multi',service:'OTHER_TAX_PAYMENT',status:'SIMULATED_SUCCESS',
  amountMinor:6000,createdAt:'2026-11-05T06:12:00Z',details:{
    assessmentYear:'2025-26, 2026-27',
    allocations:[
      {taxpayerTin:'123456789012',taxpayerName:'Taxpayer A',headId:68,amountMinor:1000,assessmentYear:'2025-26'},
      {taxpayerTin:'234567890123',taxpayerName:'Taxpayer B',headId:68,amountMinor:2000,assessmentYear:'2025-26'},
      {taxpayerTin:'123456789012',taxpayerName:'Taxpayer A',headId:68,amountMinor:3000,assessmentYear:'2026-27'},
    ],
    // One recorded head description can serve repeated allocation lines.
    lines:[{headId:68,headNameEn:'Advance Tax'}],
  }};

describe('Office Payments Analytics: source-backed metrics',()=>{
  it('counts only observed payment records, never hardcoded sample benchmark totals',()=>{
    const report=officePaymentAnalytics([base,failed]);
    expect(report.total).toBe(2);
    expect(report.saved).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.pending).toBe(0);
    expect(report.services).toEqual([['Other Tax Payment',1],['Travel Tax',1]]);
    expect(Object.fromEntries(report.methods)).toEqual({'Not recorded':1,bKash:1});
  });
  it('does not misrepresent failed or invalid amounts as fully recorded totals',()=>{
    expect(officePaymentAnalytics([base,failed]).amountMinor).toBeNull();
    expect(officePaymentAnalytics([{...base,amountMinor:Number.MAX_SAFE_INTEGER+1}]).amountMinor).toBeNull();
  });
  it('uses the same assessment-year scope as the transactions feed',()=>{
    const report=officePaymentAnalytics([base,failed],'2026-27');
    expect(report.total).toBe(1);
    expect(report.saved).toBe(1);
    expect(report.amountMinor).toBe(1500);
    expect(report.methods).toEqual([['bKash',1]]);
  });
  it('allocates a multi-year parent amount by reconciled year lines and counts the parent once',()=>{
    const all=officePaymentAnalytics([multiYear]);
    const prior=officePaymentAnalytics([multiYear],'2025-26');
    const current=officePaymentAnalytics([multiYear],'2026-27');
    expect(all.total).toBe(1);
    expect(all.amountMinor).toBe(6000);
    expect(prior.total).toBe(1);
    expect(prior.amountMinor).toBe(3000);
    expect(current.total).toBe(1);
    expect(current.amountMinor).toBe(3000);
  });
  it('sums repeated-head beneficiary allocations without selecting only the first matching head',()=>{
    const report=officePaymentAnalytics([multiYear],'2025-26');
    expect(report.amountMinor).toBe(3000);
  });
  it('fails closed when allocation amounts do not reconcile to the immutable parent',()=>{
    const mismatch={...multiYear,amountMinor:6001};
    const report=officePaymentAnalytics([mismatch],'2025-26');
    expect(report.total).toBe(1);
    expect(report.amountMinor).toBeNull();
  });
  it('shows an actual empty feed as empty, not a fictional funnel or channel success rate',()=>{
    expect(officePaymentAnalytics([])).toEqual({total:0,saved:0,failed:0,pending:0,other:0,amountMinor:0,methods:[],services:[]});
  });
});
