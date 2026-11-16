import { describe, expect, it } from 'vitest';
import { simulationUsers } from '../../../contracts/paymentSimulationContract';
import { projectOfficePreviewTaxpayers } from '../officeTaxpayerRegistrationProfiles';
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

describe('Taxpayer V2 SQL-backed first-30 Office register',()=>{
 const rows=Array.from({length:55},(_,index)=>{
  const n=index+1;
  const role=n===3||n%7===0?'WITHHOLDING_AGENT':
   n===2||n%5===0?'TAXPAYER_CORPORATE':'TAXPAYER_INDIVIDUAL';
  return {id:'user'+n,role_code:role,
    name_en:n===7||n===8||n===9||n===10?null:
      n<=10?'SQL preview label':'Taxpayer Account '+n,
    focus_en:'Preview account '+n,jurisdiction_label:null};
 });
 it('loads exactly the 30 selectable logged-in Taxpayer accounts in numeric account order',()=>{
  const result=projectOfficePreviewTaxpayers(rows);
  expect(result).toHaveLength(30);
  expect(result.map(p=>p.accountId)).toEqual(Array.from({length:30},(_,i)=>'user'+(i+1)));
  expect(result[0].nameEn).toBe('Md. Arif Rahman');
  expect(result[6].nameEn).toBe('Sadia Islam');
  expect(result[29].nameEn).toBe('Taxpayer Account 30');
  expect(new Set(result.map(p=>p.sampleTin)).size).toBe(30);
  expect(result.every(p=>p.roleCode.length>0)).toBe(true);
 });
 it('refuses missing, duplicate or mismatched SQL preview accounts, never invents rows',()=>{
  expect(()=>projectOfficePreviewTaxpayers(rows.filter(row=>row.id!=='user13'))).toThrow(/incomplete/);
  expect(()=>projectOfficePreviewTaxpayers([...rows,rows[0]])).toThrow(/Duplicate/);
  expect(()=>projectOfficePreviewTaxpayers(rows.map(row=>row.id==='user15'?{...row,role_code:'WITHHOLDING_AGENT'}:row))).toThrow(/incomplete/);
  expect(()=>projectOfficePreviewTaxpayers(rows.map(row=>row.id==='user19'?{...row,name_en:'Changed name'}:row))).toThrow(/parity/);
 });
});
