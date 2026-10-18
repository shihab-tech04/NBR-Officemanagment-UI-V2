import {describe,it,expect} from 'vitest';
import {toStoryPaymentRow} from '../app/pages/payments/story1PaymentPresentation';
import type {StoryPayment} from '../app/pages/payments/story1OfficeApi';

describe('shared Office payment audit',()=>{
  it('shows the real payer, each beneficiary TIN, two categories, and immutable authorization reference',()=>{
    const receipt:StoryPayment={
      id:'c0227104-60d9-4827-be36-eba397e62c41',service:'TAX_WITH_RETURN',
      status:'SIMULATED_SUCCESS',createdAt:'2026-10-18T08:03:00Z',amountMinor:5000,
      details:{payerId:'user1',payerName:'user1',taxpayerTin:'MULTIPLE_BENEFICIARIES',
        lines:[
          {beneficiary:'user2',category:'TAX_WITH_RETURN',assessmentYear:'2026-27',
            amountMinor:3500,authorizationId:'9e13df95-85ec-4548-8363-467a6d6e95f0'},
          {beneficiary:'user1',category:'ADVANCE_TAX',assessmentYear:'2025-26',amountMinor:1500}
        ]}
    };
    const row=toStoryPaymentRow(receipt);
    expect(row.payer_name).toBe('user1');
    expect(row.taxpayer_name).toBe('user2, user1');
    expect(row.tin).toBe('2222222222222, 1111111111111');
    expect(row.payment_type).toContain('Advance Tax');
    expect(row.payment_type).toContain('Tax with Return');
    expect(row.payer_beneficiary_audit).toContain('user1 paid for user2');
    expect(row.authorization_references).toContain('9e13df95-85ec-4548-8363-467a6d6e95f0');
  });
});
