import { describe, expect, it } from 'vitest';
import { simulationUsers } from '../../../contracts/paymentSimulationContract';
import { toStoryPaymentRow } from '../story1PaymentPresentation';

describe('TaxPay 30-profile Office projection', () => {
 it('keeps the shared thirty-account contract', () => { expect(simulationUsers).toHaveLength(30); expect(simulationUsers.at(-1)).toBe('user30'); });
 it('derives one 13-digit synthetic TIN per new beneficiary for mirrored Story 1 rows', () => {
  const row=toStoryPaymentRow({id:'fixture-user11',service:'TAX_WITH_RETURN',amountMinor:1200,status:'SIMULATED_SUCCESS',createdAt:'2026-11-07T00:00:00.000Z',details:{payerId:'user1',payerName:'Md. Arif Rahman',lines:[{beneficiary:'user11',category:'TAX_WITH_RETURN',assessmentYear:'2026-27',amountMinor:1200}]}});
  expect(row.tin).toContain('9000000000011');
  expect(row.payment_type).toContain('Tax with Return');
 });
});
