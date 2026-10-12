import { describe, expect, it } from 'vitest';
import { canPostOfficerMutation, referencePayments, referenceTaxpayers, referenceCorrections, referenceOffline, referenceIntelligence, totalReceived, totalEligible } from '../paymentReference';
import { NAVIGATION } from '../../../data/navigation';
import enNavigation from '../../../locales/en/navigation.json';
import bnNavigation from '../../../locales/bn/navigation.json';
import enPayment from '../../../locales/en/payment.json';
import bnPayment from '../../../locales/bn/payment.json';

describe('Payment Officer Workspace integration — controlled fixture boundaries', () => {
  it('provides seven second-level destinations without disrupting Demand & Payment', () => {
    const nav = NAVIGATION.find(n=>n.id==='payments');
    expect(nav?.children.map(c=>c.id)).toEqual(['overview','transactions','taxpayer-360','corrections','incidents','offline-events','analytics']);
    expect(NAVIGATION.find(n=>n.id==='case-financial')?.children.some(n=>n.id==='demand-payment')).toBe(true);
  });
  it('has matching EN and BN localization keys', () => {
    expect(Object.keys(enPayment).sort()).toEqual(Object.keys(bnPayment).sort());
    expect(Object.keys(enNavigation.payments).sort()).toEqual(Object.keys(bnNavigation.payments).sort());
  });
  it('distinguishes Treasury receipt from eligible tax credit', () => {
    expect(totalReceived(referencePayments)).toBe(120000);
    expect(totalEligible(referencePayments)).toBe(20000);
    expect(referencePayments.find(p=>p.amount===100000)?.tax_credit_status).toBe('Blocked — under review');
    expect(referencePayments.find(p=>p.amount===42500)?.financial_receipt_status).toBe('Failed');
  });
  it('does not manufacture missing external reference IDs', () => {
    expect(referencePayments.find(p=>p.amount===62500)?.acs_reference).toBe('');
    expect(referencePayments.find(p=>p.amount===42500)?.tax_event_id).toBe('TE-2026-000185');
  });
  it('retains sourced synthetic identity, offline, correction and intelligence records separately', () => {
    expect(referenceTaxpayers.length).toBe(6);
    expect(referenceCorrections[0].id).toBe('CR-2026-000045');
    expect(referenceOffline[0].id).toBe('OFE-2026-000008');
    expect(referenceIntelligence.volume).toBe(18420);
  });
  it('never enables an officer mutation based on a UI role string', () => {
    for(const role of ['Maker','Reviewer','Approver','Super Admin','']) expect(canPostOfficerMutation(role)).toBe(false);
  });
});