import {describe,expect,it} from 'vitest';
import type {StoryNotice,StoryPayment} from '../story1OfficeApi';
import {summarizeTaxpayerRecordedActivity} from '../officeTaxpayerActivity';

const payer='001234567890',beneficiary='009876543210';
const allocated:StoryPayment={
  id:'payment-batch',service:'OTHER_TAX_PAYMENT',status:'SIMULATED_SUCCESS',
  amountMinor:5000,createdAt:'2026-11-05T06:00:00Z',
  details:{payerName:'Example payer',payerMode:'OTHER',
    lines:[{headId:1,headNameEn:'Income tax',economicCode:'1-1141-0000-0101'}],
    allocations:[
      {taxpayerTin:payer,taxpayerName:'Example A',headId:1,assessmentYear:'2026-27',amountMinor:1500},
      {taxpayerTin:beneficiary,taxpayerName:'Example B',headId:1,assessmentYear:'2025-26',amountMinor:3500}
    ]}
};
const savedDirect:StoryPayment={
  id:'direct',service:'TRAVEL_TAX',amountMinor:3000,status:'SIMULATED_SUCCESS',
  createdAt:'2026-11-05T07:00:00Z',
  details:{taxpayerTin:payer,taxpayerName:'Example A',assessmentYear:'2026-27',payerMode:'SELF'}
};
const notices:StoryNotice[]=[
  {id:1,paymentId:'payment-batch',type:'PAYMENT_RECORDED',createdAt:'2026-11-05T06:10:00Z'},
  {id:2,paymentId:'direct',type:'PAYMENT_RECORDED',createdAt:'2026-11-05T07:10:00Z'},
  {id:3,paymentId:'other',type:'IRRELEVANT',createdAt:'2026-11-05T07:12:00Z'}
];

describe('Taxpayer 360 — SQL-mirrored taxpayer record and notice scope',()=>{
  it('never attributes another beneficiary’s allocation to the selected taxpayer',()=>{
    const a=summarizeTaxpayerRecordedActivity([allocated],notices,payer);
    const b=summarizeTaxpayerRecordedActivity([allocated],notices,beneficiary);
    expect(a.recordedSavedAmountMinor).toBe(1500);
    expect(b.recordedSavedAmountMinor).toBe(3500);
    expect(a.rows).toHaveLength(1);
    expect(b.rows).toHaveLength(1);
    expect(a.rows[0].row.tin).toBe(payer);
    expect(b.rows[0].row.tin).toBe(beneficiary);
  });
  it('filters all financial and notice summaries to the selected taxpayer AND year',()=>{
    const a=summarizeTaxpayerRecordedActivity([allocated,savedDirect],notices,payer,'2026-27');
    expect(a.linkedRecords).toBe(2);
    expect(a.savedRecords).toBe(2);
    expect(a.recordedSavedAmountMinor).toBe(4500);
    expect(a.notices.map(n=>n.id)).toEqual([2,1]);
    expect(a.payerContext).toEqual({self:1,other:1,unspecified:0});
    const b=summarizeTaxpayerRecordedActivity([allocated,savedDirect],notices,beneficiary,'2026-27');
    expect(b.linkedRecords).toBe(0);
    expect(b.notices).toEqual([]);
  });
  it('preserves original parent payment and scoped allocation amounts separately',()=>{
    const scoped=summarizeTaxpayerRecordedActivity([allocated],notices,payer,'2026-27');
    expect(scoped.rows[0].payment.amountMinor).toBe(5000);
    expect(scoped.rows[0].row.amount).toBe('৳15');
    expect(scoped.recordedSavedAmountMinor).toBe(1500);
  });
  it('records no unsupported official receipt or credit, and does not sum failed submissions',()=>{
    const failed:StoryPayment={...savedDirect,id:'failed',status:'FAILED',amountMinor:7000};
    const summary=summarizeTaxpayerRecordedActivity([savedDirect,failed],[],payer);
    expect(summary.linkedRecords).toBe(2);
    expect(summary.savedRecords).toBe(1);
    expect(summary.recordedSavedAmountMinor).toBe(3000);
  });
  it('fails closed when payment allocations are incomplete or do not reconcile',()=>{
    const invalid:StoryPayment={...allocated,amountMinor:5001};
    const report=summarizeTaxpayerRecordedActivity([invalid],notices,payer);
    expect(report.linkedRecords).toBe(0);
    expect(report.recordedSavedAmountMinor).toBe(0);
    expect(report.notices).toEqual([]);
  });
  it('rejects invalid taxpayer identifiers and does not leak notifications or other payers',()=>{
    const report=summarizeTaxpayerRecordedActivity([allocated,savedDirect],notices,'invalid-tin');
    expect(report.linkedRecords).toBe(0);
    expect(report.notices).toEqual([]);
    expect(report.services).toEqual([]);
  });
  it('orders recent linked payments newest-first and counts their years and services',()=>{
    const report=summarizeTaxpayerRecordedActivity([allocated,savedDirect],notices,payer);
    expect(report.rows.map(x=>x.payment.id)).toEqual(['direct','payment-batch']);
    expect(report.latestRecordedAt).toBe('2026-11-05T07:00:00.000Z');
    expect(report.assessmentYears).toEqual([{label:'2026-27',count:2}]);
    expect(report.services.reduce((sum,x)=>sum+x.count,0)).toBe(2);
  });
});
