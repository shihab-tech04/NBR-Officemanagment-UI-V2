import {describe,it,expect} from 'vitest';
import {summarizeTaxpayerRecordedActivity} from '../officeTaxpayerActivity';
import {projectOfficeTaxpayer360Ledger,OFFICE_MIRROR_SOURCE} from '../officeTaxpayer360LedgerModel';
import type {StoryPayment} from '../story1OfficeApi';

const tin='111111111111',other='222222222222';
const payment=(id:string,who:string,date:string,status:string,amountMinor=5000):StoryPayment=>({
  id,service:'ADVANCE_TAX',amountMinor,status,createdAt:date,
  details:{taxpayerTin:who,assessmentYear:'2026-27',payerName:'Source payer'},
});
describe('Office Taxpayer 360 read-only ledger projection',()=>{
  const all=[
    payment('own-record',tin,'2026-06-01T10:00:00Z','SIMULATED_SUCCESS',5000),
    payment('pending-record',tin,'2026-07-01T10:00:00Z','PENDING',3000),
    payment('other-owner',other,'2026-08-01T10:00:00Z','SIMULATED_SUCCESS',8000)
  ];
  const snapshot=summarizeTaxpayerRecordedActivity(all,[],tin,'all');
  it('uses only validated taxpayer-linked mirrored source records',()=>{
    const result=projectOfficeTaxpayer360Ledger(snapshot,tin,'all');
    expect(result.rows.map(x=>x.payment_ref).sort()).toEqual(['own-record','pending-record']);
    expect(result.rows.every(x=>x.source_system===OFFICE_MIRROR_SOURCE)).toBe(true);
    expect(result.rows.every(x=>x.dhara==='—'&&x.credit_status==='Not verified')).toBe(true);
    expect(result.rows.some(x=>x.ledger_stage==='Verified')).toBe(false);
    expect(result.rows.find(x=>x.payment_ref==='pending-record')?.ledger_stage).toBe('Pending');
    expect(result.recordedSavedAmountMinor).toBe(5000);
    expect(result.hasAuthoritativeDhara).toBe(false);
  });
  it('filters by actual source UTC date and never invents financial credit',()=>{
    const result=projectOfficeTaxpayer360Ledger(snapshot,tin,'all','2026-07-01','2026-12-31');
    expect(result.rows.map(x=>x.payment_ref)).toEqual(['pending-record']);
    expect(result.recordedSavedAmountMinor).toBe(0);
    const noMatch=projectOfficeTaxpayer360Ledger(snapshot,tin,'all','2027-01-01','2027-12-31');
    expect(noMatch.rows).toEqual([]);
  });
  it('refuses to project another taxpayer from a wrongly provided snapshot',()=>{
    const result=projectOfficeTaxpayer360Ledger(snapshot,other,'all');
    expect(result.rows).toEqual([]);
    expect(result.recordedSavedAmountMinor).toBe(0);
  });
  it('does not attribute payments made for another taxpayer to the payer',()=>{
    const paidForOther:StoryPayment={
      ...payment('payment-for-another',other,'2026-09-01T10:00:00Z','SIMULATED_SUCCESS',7000),
      details:{taxpayerTin:other,assessmentYear:'2026-27',payerId:'user1',payerMode:'OTHER'}
    };
    const ownSnapshot=summarizeTaxpayerRecordedActivity([...all,paidForOther],[],tin,'all');
    const result=projectOfficeTaxpayer360Ledger(ownSnapshot,tin,'all');
    expect(result.rows.map(x=>x.payment_ref)).not.toContain('payment-for-another');
    expect(result.recordedSavedAmountMinor).toBe(5000);
    expect(result.hasAuthoritativeDhara).toBe(false);
  });
  it('excludes source records with invalid dates when a date range is applied',()=>{
    const invalidSnapshot=summarizeTaxpayerRecordedActivity(
      [payment('bad-date',tin,'not-a-timestamp','SIMULATED_SUCCESS')],[],tin,'all');
    const filtered=projectOfficeTaxpayer360Ledger(invalidSnapshot,tin,'all','2026-01-01','2026-12-31');
    expect(filtered.rows).toEqual([]);
    expect(filtered.recordedSavedAmountMinor).toBe(0);
    expect(filtered.hasAuthoritativeDhara).toBe(false);
  });

  it('keeps failed and cancelled recorded attempts distinct without claiming tax credit',()=>{
    const attempts=[
      payment('success',tin,'2026-06-01T10:00:00Z','SIMULATED_SUCCESS',5000),
      payment('pending',tin,'2026-06-02T10:00:00Z','PROCESSING',9000),
      payment('failed',tin,'2026-06-03T10:00:00Z','FAILED',7000),
      payment('cancelled',tin,'2026-06-04T10:00:00Z','CANCELLED',2000),
      payment('unknown',tin,'2026-06-05T10:00:00Z','SOME_NEW_STATUS',1000),
    ];
    const result=projectOfficeTaxpayer360Ledger(summarizeTaxpayerRecordedActivity(attempts,[],tin,'all'),tin,'all');
    const stage=Object.fromEntries(result.rows.map(row=>[row.payment_ref,row.ledger_stage]));
    expect(stage).toEqual({unknown:'Unverified',cancelled:'Cancelled',failed:'Failed',pending:'Pending',success:'Unverified'});
    expect(result.rows.every(row=>row.credit_status==='Not verified')).toBe(true);
    expect(result.rows.some(row=>row.ledger_stage==='Verified')).toBe(false);
    expect(result.recordedSavedAmountMinor).toBe(5000);
  });
  it('does not infer Pending from an unknown composite source status',()=>{
    const states=['NOT_PENDING','PRE_PROCESSING','FAILED_PENDING','AUTHORIZATION_QUEUED',
      'CANCELLED_PENDING',' pending '];
    const events=states.map((state,index)=>payment('state-'+index,tin,
      '2026-06-0'+(index+1)+'T10:00:00Z',state,1000));
    const result=projectOfficeTaxpayer360Ledger(
      summarizeTaxpayerRecordedActivity(events,[],tin,'all'),tin,'all');
    const byRef=Object.fromEntries(result.rows.map(row=>[row.payment_ref,row.ledger_stage]));
    expect(byRef).toEqual({
      'state-0':'Unverified','state-1':'Unverified','state-2':'Unverified',
      'state-3':'Unverified','state-4':'Unverified','state-5':'Pending',
    });
    expect(result.rows.every(row=>row.credit_status==='Not verified')).toBe(true);
    expect(result.recordedSavedAmountMinor).toBe(0);
  });

  it('shows the same source and credit warning in the English and Bengali ledger views',async()=>{
    const {createElement}=await import('react');
    const {Provider}=await import('react-redux');
    const {renderToStaticMarkup}=await import('react-dom/server');
    const {store}=await import('../../../store/store');
    const {OfficeTaxpayer360Ledger}=await import('../OfficeTaxpayer360Ledger');
    const snapshot=summarizeTaxpayerRecordedActivity([
      payment('failed-record',tin,'2026-07-10T10:00:00Z','FAILED',3000)
    ],[],tin,'all');
    const render=(language:'en'|'bn')=>renderToStaticMarkup(createElement(
      Provider,{store},
      createElement(OfficeTaxpayer360Ledger,{
        snapshot,taxpayerTin:tin,year:'all',language,loading:false,error:'',
        onRetry:()=>{},onOpen:()=>{},
      })
    ));
    const english=render('en');
    expect(english).toContain('Tax credit status');
    expect(english).toContain('Not verified');
    expect(english).toContain('Failed');
    expect(english).not.toContain('Treasury settled');
    const bengali=render('bn');
    expect(bengali).toContain('কর ক্রেডিটের অবস্থা');
    expect(bengali).toContain('যাচাই হয়নি');
    expect(bengali).toContain('ব্যর্থ');
    expect(bengali).toContain('শুরুর তারিখ');
    expect(bengali).not.toContain('Treasury settled');
  });

  it('does not present a missing Office source as an empty taxpayer ledger',async()=>{
    const {createElement}=await import('react');
    const {Provider}=await import('react-redux');
    const {renderToStaticMarkup}=await import('react-dom/server');
    const {store}=await import('../../../store/store');
    const {OfficeTaxpayer360Ledger}=await import('../OfficeTaxpayer360Ledger');
    const empty=summarizeTaxpayerRecordedActivity([],[],tin,'all');
    const view=(snapshot:typeof empty|null)=>renderToStaticMarkup(createElement(
      Provider,{store},
      createElement(OfficeTaxpayer360Ledger,{
        snapshot,taxpayerTin:tin,year:'all',language:'en',
        loading:false,error:'',onRetry:()=>{},onOpen:()=>{},
      })
    ));
    const missing=view(null),validEmpty=view(empty);
    expect(missing).toContain('Payment records could not be confirmed for this taxpayer');
    expect(missing).toContain('Retry');
    expect(missing).not.toContain('No linked recorded payments match');
    expect(validEmpty).toContain('No linked recorded payments match');
    expect(validEmpty).not.toContain('Payment records could not be confirmed for this taxpayer');
  });

});
