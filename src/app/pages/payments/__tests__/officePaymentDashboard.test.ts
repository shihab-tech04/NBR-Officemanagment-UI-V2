import {describe,expect,it} from 'vitest';
import type {StoryPayment} from '../story1OfficeApi';
import {buildOfficePaymentDashboard} from '../officePaymentDashboard';

const base:StoryPayment={
  id:'pay-1',service:'TAX_WITH_RETURN',status:'SIMULATED_SUCCESS',
  amountMinor:1500,createdAt:'2026-11-05T08:00:00Z',
  details:{taxpayerTin:'001234567890',taxpayerName:'Taxpayer A',
    assessmentYear:'2026-27',paymentMethod:'BKASH',receiptReference:'test-external-ref'}
};
const failed:StoryPayment={
  ...base,id:'pay-2',service:'TRAVEL_TAX',status:'FAILED',
  createdAt:'2026-11-05T09:00:00Z',
  details:{taxpayerTin:'009876543210',assessmentYear:'2025-26'}
};

describe('Payments Audit-style dashboard — same source as Transactions',()=>{
  it('does not invent records, financial events, or QA warnings when source is empty',()=>{
    const view=buildOfficePaymentDashboard([]);
    expect(view.total).toBe(0);
    expect(view.recent).toEqual([]);
    expect(view.services).toEqual([]);
    expect(view.years).toEqual([]);
    expect(view.noTaxpayerTin).toBe(0);
    expect(view.noExternalReceiptReference).toBe(0);
  });
  it('shows source-record status and chronological activity without calling a saved record settled',()=>{
    const view=buildOfficePaymentDashboard([base,failed]);
    expect(view.total).toBe(2);
    expect([view.saved,view.pending,view.failed,view.other]).toEqual([1,0,1,0]);
    expect(view.recent.map(p=>p.id)).toEqual(['pay-2','pay-1']);
    expect(view.services.map(p=>p.count)).toEqual([1,1]);
    expect(view.noExternalReceiptReference).toBe(1);
    expect(view.noPaymentMethod).toBe(1);
  });
  it('filters all drill-down counts, recent activity and completeness indicators by assessment year',()=>{
    const view=buildOfficePaymentDashboard([base,failed],'2026-27');
    expect(view.total).toBe(1);
    expect(view.saved).toBe(1);
    expect(view.failed).toBe(0);
    expect(view.recent.map(p=>p.id)).toEqual(['pay-1']);
    expect(view.years).toEqual([{label:'2026-27',count:1}]);
    expect(view.noPaymentMethod).toBe(0);
  });
  it('counts one multi-year transaction in each year without duplicating within the same year',()=>{
    const multi:StoryPayment={...base,id:'multi',amountMinor:6000,
      details:{payerName:'Payer',lines:[{headId:1,headNameEn:'Tax'}],
        allocations:[
          {taxpayerTin:'001234567890',assessmentYear:'2026-27',headId:1,amountMinor:1000},
          {taxpayerTin:'001234567890',assessmentYear:'2026-27',headId:1,amountMinor:2000},
          {taxpayerTin:'001234567890',assessmentYear:'2025-26',headId:1,amountMinor:3000}
        ]}};
    const view=buildOfficePaymentDashboard([multi]);
    expect(view.total).toBe(1);
    expect(Object.fromEntries(view.years.map(y=>[y.label,y.count]))).toEqual({'2026-27':1,'2025-26':1});
    expect(buildOfficePaymentDashboard([multi],'2025-26').total).toBe(1);
  });
  it('flags absent taxpayer identifiers but never treats an unverified identifier as an official identity',()=>{
    const unlinked:StoryPayment={...base,id:'unlinked',details:{assessmentYear:'2026-27'}};
    const view=buildOfficePaymentDashboard([unlinked]);
    expect(view.total).toBe(1);
    expect(view.noTaxpayerTin).toBe(1);
    expect(view.noExternalReceiptReference).toBe(1);
    expect(view.noPaymentMethod).toBe(1);
  });
  it('sorts valid dated activity ahead of unknown dates, without synthesizing missing dates',()=>{
    const unknown:StoryPayment={...base,id:'unknown',createdAt:'invalid date'};
    const view=buildOfficePaymentDashboard([unknown,failed,base]);
    expect(view.recent.map(x=>x.id)).toEqual(['pay-2','pay-1','unknown']);
  });
});
