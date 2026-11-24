import { describe, it, expect } from 'vitest';
import type { StoryPayment } from '../story1OfficeApi';
import { getOfficePaymentItems, officeMoney, parseOfficeMoneyMinor } from '../officeTransactionDetails';
import { buildDisplayedOfficeReceiptDocument } from '../OfficeReceiptModal';

const transaction: StoryPayment = {
  id: 'e4e43b06-0be4-4cfe-96eb-b75b7176d86e', service: 'OTHER_TAX_PAYMENT',
  amountMinor: 17375, status: 'SIMULATED_SUCCESS', createdAt: '2026-10-29T05:48:25Z',
  details: { payerId: 'user6', lines: [
    { beneficiary: 'user6', category: 'TAX_WITH_RETURN', assessmentYear: '2026-27', amountMinor: 15025 },
    { beneficiary: 'user7', category: 'PENALTY', assessmentYear: '2025-26', amountMinor: 2350 },
  ] },
};

describe('Office-native transaction record and receipt', () => {
  it('formats readable, exact beneficiary allocations instead of raw JSON', () => {
    const items = getOfficePaymentItems(transaction);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ taxpayer: 'user6', service: 'Tax with Return', assessmentYear: '2026-27', amountMinor: 15025 });
    expect(items[1]).toMatchObject({ taxpayer: 'user7', service: 'Penalty Payment', assessmentYear: '2025-26', amountMinor: 2350 });
    expect(officeMoney(items[0].amountMinor)).toBe('৳150.25');
    expect(officeMoney(17375)).toBe('৳173.75');
  });

  it('reconciles the same exact receipt amount in English and Bengali without inventing credits', () => {
    expect(officeMoney(17375, 'en')).toBe('৳173.75');
    expect(officeMoney(17375, 'bn')).toBe('৳১৭৩.৭৫');
    expect(parseOfficeMoneyMinor(officeMoney(17375, 'en'))).toBe(17375);
    expect(parseOfficeMoneyMinor(officeMoney(17375, 'bn'))).toBe(17375);
    expect(parseOfficeMoneyMinor('৳ ১,২৩৪.৫০')).toBe(123450);
    expect(parseOfficeMoneyMinor('৳1,234.50')).toBe(123450);
    expect(parseOfficeMoneyMinor('৳১,২৩৪.৫০') === getOfficePaymentItems(transaction)[0].amountMinor).toBe(false);
    for (const invalid of [null, undefined, 1234, '—', '123.45', '৳১,২৩,৪.৫০',
      '৳১,২৩৪.৫০১', '৳-১.০০', '৳১২.১২৩', '৳৯৯৯৯৯৯৯৯৯৯৯৯৯৯৯৯']) {
      expect(parseOfficeMoneyMinor(invalid)).toBeNull();
    }
  });

  it('never attributes unreconciled amounts or mixed beneficiary formats', () => {
    expect(getOfficePaymentItems({ ...transaction, amountMinor: 17376 })).toEqual([]);
    expect(getOfficePaymentItems({ ...transaction, details: { ...transaction.details,
      allocations: [{ taxpayerTin: '6666666666666', headId: 121, assessmentYear: '2026-27', amountMinor: 17375 }] } })).toEqual([]);
  });

  it('renders explicit reconciled TIN/head allocations with the matching head label', () => {
    const record: StoryPayment = { ...transaction, amountMinor: 5000, details: {
      lines: [{ headId: 122, headNameEn: 'Advance Tax', economicCode: '68A' }],
      allocations: [
        { taxpayerTin: '123456789012', headId: 122, amountMinor: 1500, assessmentYear: '2026-27' },
        { taxpayerTin: '234567890123', headId: 122, amountMinor: 3500, assessmentYear: '2025-26' },
      ],
    } };
    expect(getOfficePaymentItems(record)).toMatchObject([
      { taxpayer: 'TIN 123456789012', service: 'Advance Tax', amountMinor: 1500, economicCode: '68A' },
      { taxpayer: 'TIN 234567890123', service: 'Advance Tax', amountMinor: 3500 },
    ]);
  });

  it('attributes repeated head metadata to its own allocation, never first same-ID head', () => {
    const payment: StoryPayment = { ...transaction, amountMinor: 5000, details: {
      lines: [
        { headId: 122, headNameEn: 'Advance Tax', economicCode: '68A' },
        { headId: 122, headNameEn: 'Advance Tax', economicCode: '68A-SECOND' },
      ],
      allocations: [
        { taxpayerTin: '123456789012', headId: 122, amountMinor: 1500, assessmentYear: '2026-27' },
        { taxpayerTin: '234567890123', headId: 122, amountMinor: 3500, assessmentYear: '2025-26' },
      ],
    }};
    const items=getOfficePaymentItems(payment);
    expect(items).toHaveLength(2);
    expect(items.map(item=>item.economicCode)).toEqual(['68A','68A-SECOND']);
    expect(items.map(item=>item.amountMinor)).toEqual([1500,3500]);
    expect(getOfficePaymentItems(payment,{taxpayerTin:'234567890123'}))
      .toMatchObject([{economicCode:'68A-SECOND',amountMinor:3500,assessmentYear:'2025-26'}]);
  });

  it('fails closed when line order cannot be reconciled to the explicit allocation heads', () => {
    const record: StoryPayment={ ...transaction,amountMinor:5000,details:{
      lines:[{headId:123,headNameEn:'Different tax head',economicCode:'73A'}],
      allocations:[{taxpayerTin:'123456789012',headId:122,amountMinor:5000,assessmentYear:'2026-27'}],
    }};
    expect(getOfficePaymentItems(record)).toEqual([]);
  });

  it('attributes all 30 synthetic taxpayers using the existing shared TIN mapping',()=>{
    for (let id=1;id<=30;id++) {
      const user='user'+id;
      const payment:StoryPayment={...transaction,amountMinor:100,
        details:{lines:[{beneficiary:user,category:'ADVANCE_TAX',assessmentYear:'2026-27',amountMinor:100}]}};
      const items=getOfficePaymentItems(payment);
      expect(items).toHaveLength(1);
      expect(items[0].taxpayerTin).toMatch(/^\d{12,13}$/);
      expect(getOfficePaymentItems(payment,{taxpayerTin:items[0].taxpayerTin!})).toHaveLength(1);
      expect(getOfficePaymentItems(payment,{taxpayerTin:'999999999999'})).toEqual([]);
    }
    const person11={...transaction,amountMinor:100,details:{lines:[
      {beneficiary:'user11',category:'PENALTY',assessmentYear:'2025-26',amountMinor:100}]}};
    expect(getOfficePaymentItems(person11).map(x=>x.taxpayerTin)).toEqual(['9000000000011']);
  });

  it('shows every reconciled Travel Tax passenger amount without inventing TIN or AY', () => {
    const travel:StoryPayment={id:'travel-parent',service:'TRAVEL_TAX',status:'SIMULATED_SUCCESS',
      amountMinor:12000,createdAt:'2026-11-13T10:00:00Z',details:{
        payerId:'user1',travelDate:'2026-11-13',passportNumberMasked:'••••1234',
        lines:[{amountMinor:12000,note:'Passport: NEVER-IN-PASSENGER-DETAIL'}],
        passengers:[
          {passengerName:'Passenger A',passportNumberMasked:'••••1234',amountMinor:6000},
          {passengerName:'Passenger B',passportNumberMasked:'••••5678',amountMinor:6000},
        ],
      }};
    const rows=getOfficePaymentItems(travel);
    expect(rows).toEqual([
      {taxpayer:'Passenger A',service:'Travel Tax',assessmentYear:'—',amountMinor:6000},
      {taxpayer:'Passenger B',service:'Travel Tax',assessmentYear:'—',amountMinor:6000},
    ]);
    expect(rows.reduce((total,row)=>total+row.amountMinor,0)).toBe(travel.amountMinor);
    expect(JSON.stringify(rows)).not.toContain('NEVER-IN-PASSENGER-DETAIL');
    expect(JSON.stringify(rows)).not.toContain('••••1234');
    // Current approved TravelTax.tsx persists receipt passengers as
    // {name, amount} in taka, while older isolated SQL uses amountMinor.
    const actualSourceShape:StoryPayment={...travel,details:{...travel.details,
      lines:[{headId:155,totalAmount:60},{headId:156,totalAmount:60}],
      passengers:[{name:'Passenger A',amount:60},{name:'Passenger B',amount:60}],
    }};
    expect(getOfficePaymentItems(actualSourceShape)).toEqual(rows);
    // A matching parent sum cannot conceal amounts assigned to the wrong
    // passenger; each source receipt line must reconcile by its passenger.
    const mismatchedPassengerLines:StoryPayment={...actualSourceShape,details:{
      ...actualSourceShape.details,lines:[{headId:155,totalAmount:59},{headId:156,totalAmount:61}],
    }};
    expect(getOfficePaymentItems(mismatchedPassengerLines)).toEqual([]);
    const zeroTaxPassenger:StoryPayment={...travel,details:{...travel.details,
      passengers:[{name:'Passenger A',amount:120},{name:'Exempt passenger',amount:0}],
    }};
    expect(getOfficePaymentItems(zeroTaxPassenger).map(item=>item.amountMinor)).toEqual([12000,0]);
    expect(getOfficePaymentItems({...travel,details:{...travel.details,
      passengers:[{name:'Passenger A',amount:60,amountMinor:6001},
        {name:'Passenger B',amount:60}],
    }})).toEqual([]);
    expect(getOfficePaymentItems(travel,{taxpayerTin:'222222222222'})).toEqual([]);
    expect(getOfficePaymentItems({...travel,amountMinor:12001})).toEqual([]);
    expect(getOfficePaymentItems({...travel,details:{...travel.details,
      passengers:[{passengerName:'Passenger A',amountMinor:6000},
        {passengerName:'Passenger B'}]}})).toEqual([]);
  });

  it('exports exactly the visible shared-modal receipt paper, not a duplicate receipt template', () => {
    const paper = document.createElement('article');
    paper.className = 'office-receipt__paper';
    paper.setAttribute('lang', 'en');
    paper.textContent = 'user6, user7 · Tax with Return · ৳173.75 <script>alert(1)</script>';
    const html = buildDisplayedOfficeReceiptDocument(paper, 'Office payment receipt');
    expect(html).toContain(paper.outerHTML);
    expect(html).toContain('office-receipt__paper');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('nbr-taxpay');
  });
});


describe('Gift Tax SQL parent projection',()=>{
 it('uses donor TIN, not the donee or synthetic payer alias, and reconciles tax rather than gift amount',()=>{
 const gift={donor:{tin:'111111111111',name:'User 1'},donee:{tin:'222222222222',name:'User 2',tag:'friends_family',relationship:'father',otherLabel:null},giftAmountMinor:250000000,estimatedTaxMinor:27200000,giftDate:'2025-01-15',description:'Gift',remarks:'Exact remarks'};
 const payment:StoryPayment={...transaction,service:'GIFT_TAX',amountMinor:27200000,details:{payerId:'user1',payerName:'Sample Payer',taxpayerTin:gift.donor.tin,taxpayerName:gift.donor.name,assessmentYear:'2025-26',receiptReference:'SIM-GIFT-example',giftDetails:gift,challanRemarks:gift.remarks,lines:[{beneficiary:'user1',category:'GIFT_TAX',amountMinor:27200000,assessmentYear:'2025-26'}],receiptSnapshot:{paymentCategory:'GIFT_TAX',totalAmount:272000,challanNo:'SIM-GIFT-example',giftDetails:gift}}};
 expect(getOfficePaymentItems(payment)).toEqual([{taxpayer:'User 1',taxpayerTin:gift.donor.tin,service:'Gift Tax',assessmentYear:'2025-26',amountMinor:27200000}]);
 expect(getOfficePaymentItems(payment,{taxpayerTin:gift.donee.tin})).toEqual([]);
 expect(getOfficePaymentItems({...payment,amountMinor:27200001})).toEqual([]);
 });
});


describe('Canonical combined certificate allocation prerequisite',()=>{
  it('reconciles v5 accounting rows, snapshot and recipient scope, rejects tampering',()=>{
    const heads=[{headId:122,headNameEn:'Advance Tax',economicCode:'68A',totalAmount:15},
      {headId:122,headNameEn:'Advance Tax',economicCode:'68B',totalAmount:35}];
    const allocations=[{allocationId:'allocation-1',taxpayerTin:'123456789012',taxpayerName:'One',headId:122,amountMinor:1500,assessmentYear:'2026-27'},
      {allocationId:'allocation-2',taxpayerTin:'234567890123',taxpayerName:'Two',headId:122,amountMinor:3500,assessmentYear:'2025-26'}];
    const details={allocationContractVersion:5,receiptLines:heads,allocations,
      lines:allocations.map(a=>({beneficiary:'SAVED_TIN:'+a.taxpayerTin,category:'OTHER_TAX_PAYMENT',amountMinor:a.amountMinor,assessmentYear:a.assessmentYear,headId:a.headId,taxpayerTin:a.taxpayerTin})),
      receiptSnapshot:{paymentCategory:'OTHER_TAX_PAYMENT',totalAmount:50,items:heads,
        allocationItems:allocations.map((a,i)=>({...a,paymentServiceEn:heads[i].headNameEn,economicCode:heads[i].economicCode}))}};
    const payment:StoryPayment={...transaction,amountMinor:5000,details};
    expect(getOfficePaymentItems(payment).map(x=>[x.taxpayerTin,x.amountMinor,x.economicCode])).toEqual([['123456789012',1500,'68A'],['234567890123',3500,'68B']]);
    expect(getOfficePaymentItems(payment,{taxpayerTin:'234567890123'}).map(x=>x.amountMinor)).toEqual([3500]);
    expect(getOfficePaymentItems(payment,{taxpayerTin:'999999999999'})).toEqual([]);
    const swapped=structuredClone(details);swapped.receiptLines.reverse();
    expect(getOfficePaymentItems({...payment,details:swapped})).toEqual([]);
    const duplicate=structuredClone(details);duplicate.allocations[1].allocationId=duplicate.allocations[0].allocationId;
    expect(getOfficePaymentItems({...payment,details:duplicate})).toEqual([]);
    const fractional=structuredClone(details);fractional.receiptLines[0].totalAmount=15.001;
    expect(getOfficePaymentItems({...payment,details:fractional})).toEqual([]);
    expect(getOfficePaymentItems({...payment,details:{...details,receiptSnapshot:undefined}})).toEqual([]);
  });
});
