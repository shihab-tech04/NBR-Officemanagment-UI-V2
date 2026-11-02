import {describe,expect,it} from 'vitest';
import type {StoryPayment} from '../story1OfficeApi';
import {projectMirroredTaxLedgerRows} from '../taxLedgerProjection';

const previous:StoryPayment={
  id:'old-payment-001',service:'TAX_WITH_RETURN',amountMinor:8000,
  status:'SIMULATED_SUCCESS',createdAt:'2026-09-09T10:00:00Z',
  details:{payerName:'Existing payer',taxpayerName:'Existing taxpayer',taxpayerTin:'012345678901',
    assessmentYear:'2025-26',lines:[{headNameEn:'Tax with Return',amountMinor:8000}]}
};
const newPayment:StoryPayment={
  id:'new-payment-002',service:'ADVANCE_TAX',amountMinor:5000,
  status:'PENDING',createdAt:'2026-11-02T06:00:00Z',
  details:{payerName:'New payer',allocations:[
    {taxpayerName:'Taxpayer A',taxpayerTin:'123456789012',headId:121,assessmentYear:'2026-27',amountMinor:1500},
    {taxpayerName:'Taxpayer B',taxpayerTin:'234567890123',headId:122,assessmentYear:'2025-26',amountMinor:3500}
  ],lines:[
    {headId:121,headNameEn:'Advance tax A',economicCode:'68A'},
    {headId:122,headNameEn:'Advance tax B',economicCode:'68B'}
  ]}
};
describe('SQL-mirrored Office taxpayer ledger projection',()=>{
  it('retains both old and new payments with correct separated per-taxpayer amounts, categories and years',()=>{
    const rows=projectMirroredTaxLedgerRows([previous,newPayment]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({reference:'old-payment-001',tin:'012345678901',amount:'৳80.00',assessment_year:'2025-26'});
    expect(rows[1]).toMatchObject({reference:'new-payment-002',tin:'123456789012',amount:'৳15.00',economic_code:'68A'});
    expect(rows[2]).toMatchObject({reference:'new-payment-002',tin:'234567890123',amount:'৳35.00',economic_code:'68B'});
    expect(rows[1].credit).toBe('—');
    expect(rows[1].debit).toBe('—');
    expect(rows[1].balance).toBe('—');
    expect(rows[1].credit_status).toBe('Tax credit not verified');
  });
  it('never attributes an unreconciled multi-taxpayer payment to a guessed taxpayer',()=>{
    const rows=projectMirroredTaxLedgerRows([{...newPayment,amountMinor:5001}]);
    expect(rows).toHaveLength(1);
    expect(rows[0].tin).toBe('—');
    expect(rows[0].reference).toBe('new-payment-002');
    expect(rows[0].credit).toBe('—');
    expect(rows[0].balance).toBe('—');
  });
});
