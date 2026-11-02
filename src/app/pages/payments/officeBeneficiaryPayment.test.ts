import { describe,it,expect } from 'vitest';
import { getOfficePaymentItems } from './officeTransactionDetails';
import type { StoryPayment } from './story1OfficeApi';

const original:StoryPayment = {
  id:'eae7a3e9-8b6b-423d-9618-3cc8f1f14401',
  service:'OTHER_TAX_PAYMENT',amountMinor:5000,status:'SIMULATED_SUCCESS',
  createdAt:'2026-11-02T05:00:00Z',
  details:{
    payerName:'Payer',batchId:'0bca2394-3b29-4a52-987c-633a8620aa11',
    batchItemIndex:1,batchItemCount:2,
    lines:[
      {headId:68,headNameEn:'Income tax',economicCode:'1-1141-0000-0101'},
      {headId:69,headNameEn:'Advance tax',economicCode:'1-1141-0000-0102'},
    ],
    allocations:[
      {taxpayerTin:'001234567890',taxpayerName:'Beneficiary A',headId:68,
       assessmentYear:'2026-27',amountMinor:1500},
      {taxpayerTin:'009876543210',taxpayerName:'Beneficiary B',headId:69,
       assessmentYear:'2025-26',amountMinor:3500}
    ]
  }
};
describe('Office beneficiary payment receipt and 360 source reconciliation',()=>{
  it('shows the full reconciled transaction with individual TIN, head, year and amount',()=>{
    const items=getOfficePaymentItems(original);
    expect(items).toHaveLength(2);
    expect(items.map(x=>x.amountMinor)).toEqual([1500,3500]);
    expect(items.map(x=>x.taxpayerTin)).toEqual(['001234567890','009876543210']);
    expect(items.map(x=>x.assessmentYear)).toEqual(['2026-27','2025-26']);
    expect(items.map(x=>x.economicCode)).toEqual(['1-1141-0000-0101','1-1141-0000-0102']);
  });
  it('isolates the selected taxpayer and assessment year in Taxpayer 360',()=>{
    const filtered=getOfficePaymentItems(original,{
      taxpayerTin:'009876543210',assessmentYear:'2025-26'
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].amountMinor).toBe(3500);
    expect(filtered[0].taxpayerTin).toBe('009876543210');
    expect(getOfficePaymentItems(original,{
      taxpayerTin:'009876543210',assessmentYear:'2026-27'
    })).toEqual([]);
  });
  it('fails closed when the total differs from SQL, not misattributing money',()=>{
    expect(getOfficePaymentItems({...original,amountMinor:5001})).toEqual([]);
    expect(getOfficePaymentItems(original,{taxpayerTin:'000000000000'})).toEqual([]);
  });
});