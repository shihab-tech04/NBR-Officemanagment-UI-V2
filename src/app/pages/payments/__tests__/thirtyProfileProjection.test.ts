import { describe, expect, it } from 'vitest';
import { simulationUsers } from '../../../contracts/paymentSimulationContract';
import { demoTinFor, toStoryPaymentRow } from '../story1PaymentPresentation';

describe('TaxPay fictional 55-profile Office projection', () => {
 it('preserves all 55 distinct fictional account IDs and original first-30 identities', () => {
  expect(simulationUsers).toHaveLength(55);
  expect(new Set(simulationUsers).size).toBe(55);
  expect(simulationUsers).toEqual(Array.from({length:55},(_,i)=>`user${i+1}`));
  expect(simulationUsers.at(29)).toBe('user30');
  expect(simulationUsers.at(-1)).toBe('user55');
 });
 it('preserves the existing mapped sample-TIN beneficiary for mirrored Story 1 rows', () => {
  const row=toStoryPaymentRow({id:'fixture-user11',service:'TAX_WITH_RETURN',amountMinor:1200,status:'SIMULATED_SUCCESS',createdAt:'2026-11-07T00:00:00.000Z',details:{payerId:'user1',payerName:'Md. Arif Rahman',lines:[{beneficiary:'user11',category:'TAX_WITH_RETURN',assessmentYear:'2026-27',amountMinor:1200}]}});
  expect(row.tin).toContain('9000000000011');
  expect(row.payment_type).toContain('Tax with Return');
 });
 it('does not invent verified TIN ownership for the 25 newly added preview-only accounts', () => {
  // Taxpayer migration 20261115090000 supplies DEMO-TIN stubs for user31-55,
  // not eTINs or an Auth-to-TIN binding. Never project stubs as legal ownership.
  for(let i=31;i<=55;i++) expect(demoTinFor(`user${i}`)).toBe('');
  expect(demoTinFor('user30')).toBe('9000000000030');
  expect(demoTinFor('user56')).toBe('');
 });
});
