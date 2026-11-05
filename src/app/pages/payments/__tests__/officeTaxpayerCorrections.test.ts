import {describe,expect,it} from 'vitest';
import type {StoryPayment} from '../story1OfficeApi';
import type {OfficeCorrectionInquiry} from '../correctionReviewApi';
import {linkedTaxpayerCorrections} from '../officeTaxpayerCorrections';
const payment:StoryPayment={
  id:'payment-A',service:'OTHER_TAX_PAYMENT',status:'SIMULATED_SUCCESS',
  amountMinor:5000,createdAt:'2026-11-05T08:00:00Z',
  details:{receiptReference:'receipt-A',payerName:'Payer',
    lines:[{headId:1,headNameEn:'Tax'}],
    allocations:[
      {taxpayerTin:'001234567890',taxpayerName:'Person A',assessmentYear:'2026-27',headId:1,amountMinor:1500},
      {taxpayerTin:'009876543210',taxpayerName:'Person B',assessmentYear:'2025-26',headId:1,amountMinor:3500}
    ]}
};
const inquiry:OfficeCorrectionInquiry={
  requestId:'case-A',originalReference:'payment-A',reason:'Incorrect payment information',
  requestedOutcome:'Review',evidenceState:'PENDING_EVIDENCE',changeKind:null,oldValue:null,
  newValue:null,createdAt:'2026-11-05T08:30:00Z',reviewState:'PENDING',reviewRevision:1,
  reviewUpdatedAt:'2026-11-05T08:30:00Z',pendingDelivery:false,deliveryState:null,
  lastDeliveryError:null,availableActions:[]
};
describe('Taxpayer 360 authorized correction-case linking',()=>{
  it('links a case to one taxpayer only after exact payment and reconciled allocation match',()=>{
    const results=linkedTaxpayerCorrections([inquiry],[payment],'001234567890');
    expect(results).toHaveLength(1);
    expect(results[0].taxpayerName).toContain('Person A');
  });
  it('respects assessment year on a multi-taxpayer payment',()=>{
    expect(linkedTaxpayerCorrections([inquiry],[payment],'001234567890','2025-26')).toEqual([]);
    expect(linkedTaxpayerCorrections([inquiry],[payment],'009876543210','2025-26')).toHaveLength(1);
  });
  it('can link an exact uniquely recorded external receipt reference',()=>{
    expect(linkedTaxpayerCorrections([{...inquiry,originalReference:'receipt-A'}],[payment],'001234567890')).toHaveLength(1);
  });
  it('refuses ambiguous receipt-reference collision across two payments',()=>{
    const duplicate={...payment,id:'payment-B'};
    expect(linkedTaxpayerCorrections([{...inquiry,originalReference:'receipt-A'}],
      [payment,duplicate],'001234567890')).toEqual([]);
  });
  it('does not link case by guessed name or prefix, or invalid TIN',()=>{
    expect(linkedTaxpayerCorrections([{...inquiry,originalReference:'Person A'}],[payment],'001234567890')).toEqual([]);
    expect(linkedTaxpayerCorrections([{...inquiry,originalReference:'payment'}],[payment],'001234567890')).toEqual([]);
    expect(linkedTaxpayerCorrections([inquiry],[payment],'123')).toEqual([]);
  });
  it('rejects unreconciled payment allocations and deduplicates repeated case IDs',()=>{
    expect(linkedTaxpayerCorrections([inquiry],[{...payment,amountMinor:5001}],'001234567890')).toEqual([]);
    expect(linkedTaxpayerCorrections([inquiry,inquiry],[payment],'001234567890')).toHaveLength(1);
  });
});
