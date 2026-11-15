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

});
