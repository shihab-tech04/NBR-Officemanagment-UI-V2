import {describe,expect,it} from 'vitest';
import {groupOfficePaymentReport,officePaymentAnalytics,projectOfficePaymentReport} from '../officePaymentAnalytics';
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

const reportingPayment:StoryPayment={...multiYear,details:{...multiYear.details,payerId:'payer-1',payerName:'Payer Example'}};

describe('allocation-backed report grouping',()=>{
  it('projects reconciled allocation lines with original parent and payer identities',()=>{
    const result=projectOfficePaymentReport([reportingPayment]);
    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows.map(row=>row.parentId)).toEqual(['p-multi','p-multi','p-multi']);
    expect(result.rows.reduce((sum,row)=>sum+row.amountMinor,0)).toBe(6000);
    expect(result.rows.map(row=>row.assessmentYear)).toEqual(['2025-26','2025-26','2026-27']);
    expect(result.rows.map(row=>row.headId)).toEqual([68,68,68]);
    expect(result.rows.map(row=>row.payerId)).toEqual(['payer-1','payer-1','payer-1']);
  });
  it('groups by year, head, payer and beneficiary without multiplying parent totals',()=>{
    const {rows}=projectOfficePaymentReport([reportingPayment]);
    const years=groupOfficePaymentReport(rows,'assessmentYear');
    expect(years.map(({label,parentCount,amountMinor})=>({label,parentCount,amountMinor})))
      .toEqual([{label:'2025-26',parentCount:1,amountMinor:3000},{label:'2026-27',parentCount:1,amountMinor:3000}]);
    expect(groupOfficePaymentReport(rows,'head')).toEqual([{
      key:'head:68',label:'Advance Tax',parentCount:1,lineCount:3,amountMinor:6000,parentIds:['p-multi']
    }]);
    expect(groupOfficePaymentReport(rows,'payer')[0]).toMatchObject({
      key:'payer:payer-1',label:'Payer Example',parentCount:1,lineCount:3,amountMinor:6000
    });
    const beneficiaries=groupOfficePaymentReport(rows,'beneficiary');
    expect(beneficiaries.map(({key,parentCount,amountMinor})=>({key,parentCount,amountMinor})))
      .toEqual([
        {key:'beneficiary:123456789012',parentCount:1,amountMinor:4000},
        {key:'beneficiary:234567890123',parentCount:1,amountMinor:2000},
      ]);
  });
  it('does not merge two unverified payer names into one payer identity',()=>{
    const {rows,issues}=projectOfficePaymentReport([
      {...reportingPayment,id:'p-one',details:{...multiYear.details,payerName:'Payer Example'}},
      {...reportingPayment,id:'p-two',details:{...multiYear.details,payerName:'Payer Example'}},
    ]);
    expect(issues.filter(issue=>issue.reason==='PAYER_ID_MISSING')).toHaveLength(2);
    const payers=groupOfficePaymentReport(rows,'payer');
    expect(payers).toHaveLength(2);
    expect(payers.map(({label,parentCount,lineCount,amountMinor})=>({label,parentCount,lineCount,amountMinor})))
      .toEqual([
        {label:'Payer not verified · p-one',parentCount:1,lineCount:3,amountMinor:6000},
        {label:'Payer not verified · p-two',parentCount:1,lineCount:3,amountMinor:6000},
      ]);
  });
  it('fails closed on an allocation mismatch instead of publishing a guessed report amount',()=>{
    const {rows,issues}=projectOfficePaymentReport([{...reportingPayment,amountMinor:6001}]);
    expect(rows).toEqual([]);
    expect(issues).toEqual([{parentId:'p-multi',reason:'ALLOCATION_MISSING_OR_UNRECONCILED'}]);
  });
  it('deduplicates an exact immutable parent replay before summing allocated lines',()=>{
    const repeated=structuredClone(reportingPayment);
    const {rows,issues}=projectOfficePaymentReport([
      reportingPayment,repeated,reportingPayment,
    ]);
    expect(issues).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(groupOfficePaymentReport(rows,'head')).toEqual([{
      key:'head:68',label:'Advance Tax',parentCount:1,
      lineCount:3,amountMinor:6000,parentIds:['p-multi']
    }]);
    expect(groupOfficePaymentReport(rows,'assessmentYear')
      .map(g=>[g.label,g.parentCount,g.lineCount,g.amountMinor]))
      .toEqual([['2025-26',1,2,3000],['2026-27',1,1,3000]]);
  });
  it('rejects conflicting same-ID Office parent snapshots instead of choosing a larger total',()=>{
    const changedAmount={...reportingPayment,amountMinor:6001};
    const changedBeneficiary={...reportingPayment,details:{
      ...reportingPayment.details,
      allocations:reportingPayment.details?.allocations?.map((a,i)=>
        i===1?{...a,taxpayerTin:'999999999999'}:a),
    }};
    for(const conflict of [changedAmount,changedBeneficiary,
      {...reportingPayment,status:'FAILED'}]){
      const {rows,issues}=projectOfficePaymentReport([
        reportingPayment,conflict,reportingPayment,
      ]);
      expect(rows).toEqual([]);
      expect(issues).toEqual([{parentId:'p-multi',reason:'DUPLICATE_PARENT_CONFLICT'}]);
    }
  });
  it('quarantines a conflicting parent while preserving unrelated original payments',()=>{
    const other={...reportingPayment,id:'p-unrelated'};
    const {rows,issues}=projectOfficePaymentReport([
      reportingPayment,other,{...reportingPayment,createdAt:'2026-11-06T06:12:00Z'},other,
    ]);
    expect(issues).toEqual([{parentId:'p-multi',reason:'DUPLICATE_PARENT_CONFLICT'}]);
    expect(new Set(rows.map(row=>row.parentId))).toEqual(new Set(['p-unrelated']));
    expect(rows).toHaveLength(3);
    expect(groupOfficePaymentReport(rows,'payer')[0]).toMatchObject({
      parentCount:1,lineCount:3,amountMinor:6000,
    });
  });
  it('does not include undated rows in a date-based report projection',()=>{
    const {rows,issues}=projectOfficePaymentReport([{...reportingPayment,createdAt:'not-a-date'}]);
    expect(rows).toEqual([]);
    expect(issues).toEqual([{parentId:'p-multi',reason:'INVALID_OCCURRED_AT'}]);
  });
});
