import {describe,it,expect} from 'vitest';
import {OFFICE_LEDGER_SOURCES,readOfficeLedgerLine,reconcileOfficeLedger} from '../officeConsolidatedLedger';

const tin='111111111111';
const raw=(sourceSystem:string,index:number)=>({
 sourceSystem,sourceRecordId:'source-record-'+index,sourceAllocationId:'allocation-'+index,
 sourceRevision:1,taxpayerTin:tin,dhara:'175',paymentSource:sourceSystem,
 amountMinor:'101',assessmentYear:'2026-27',
 eventDate:'2026-11-15T12:00:00Z',originalReference:'source-reference-'+index,
 entryKind:sourceSystem==='SOHOJKOR'?'PAYMENT_RECORD':'DEDUCTION',financialStatus:'UNVERIFIED',
 reconciliationProvenance:{},evidenceSha256:null,canonicalCreditReference:null,
 canonicalCreditLineId:null,
});

describe('F-177 Office guarded ledger projection',()=>{
 it('preserves eight sources, immutable original line keys, Dhara, references, AY and exact paisa',()=>{
  const rows=Object.keys(OFFICE_LEDGER_SOURCES).map(raw);
  const report=reconcileOfficeLedger(tin,rows,'0');
  expect(report.lines).toHaveLength(8);
  expect(new Set(report.allSourceCoverage)).toEqual(new Set(Object.keys(OFFICE_LEDGER_SOURCES)));
  rows.forEach((r,index)=>{
   const line=report.lines[index];
   expect(line.sourceSystem).toBe(r.sourceSystem);
   expect(line.sourceRecordId).toBe(r.sourceRecordId);
   expect(line.sourceAllocationId).toBe(r.sourceAllocationId);
   expect(line.assessmentYear).toBe(r.assessmentYear);
   expect(line.dhara).toBe('175');
   expect(line.amountMinor).toBe(101);
  });
  expect(report.recordedPaymentMinor).toBe(101);
  expect(report.recordedDeductionMinor).toBe(707);
  expect(report.verifiedCreditMinor).toBe(0);
 });
 it('separates a verified official credit from merely recorded deposits and deductions',()=>{
  const credit={...raw('BANK',1),sourceRecordId:'official-credit-1',
   entryKind:'CREDIT',financialStatus:'VERIFIED',amountMinor:'50',
   evidenceSha256:'a'.repeat(64),canonicalCreditReference:'official-source-1',
   canonicalCreditLineId:'official-line-1',
   reconciliationProvenance:{officialSourceRecordId:'original-bank-1',verifiedAt:'2026-11-15T12:00:00Z'}};
  const report=reconcileOfficeLedger(tin,[raw('SOHOJKOR',2),
   {...raw('BRTA',3),entryKind:'DEPOSIT',financialStatus:'PENDING'},credit],'50');
  expect(report.recordedPaymentMinor).toBe(202);
  expect(report.recordedDeductionMinor).toBe(0);
  expect(report.verifiedCreditMinor).toBe(50);
  expect(report.lines[0].financialStatus).toBe('UNVERIFIED');
  expect(readOfficeLedgerLine(credit,tin).canonicalCreditReference).toBe('official-source-1');
  expect(()=>reconcileOfficeLedger(tin,[credit],'0')).toThrow(/does not reconcile/);
 });
 it('fails closed for unauthorized taxpayer, duplicate source allocations and mismatched official credit',()=>{
  const first=raw('BRTA',1);
  expect(()=>reconcileOfficeLedger('222222222222',[first],'0')).toThrow(/taxpayer/);
  expect(()=>reconcileOfficeLedger(tin,[first,{...first,sourceRevision:2}],'0')).toThrow(/Duplicate/);
  expect(()=>reconcileOfficeLedger(tin,[{...first,sourceSystem:'UNKNOWN'}],'0')).toThrow(/Unknown/);
  expect(()=>reconcileOfficeLedger(tin,[{...first,amountMinor:'9007199254740993'}],'0')).toThrow(/amount/);
  expect(()=>reconcileOfficeLedger(tin,[{...first,financialStatus:'VERIFIED'}],'0')).toThrow(/official evidence/);
  expect(()=>reconcileOfficeLedger(tin,[],'100')).toThrow(/does not reconcile/);
 });
 it('rejects source-only credit assertions lacking independent official evidence',()=>{
  const entry={...raw('NSD',1),entryKind:'CREDIT',financialStatus:'VERIFIED'};
  expect(()=>readOfficeLedgerLine(entry,tin)).toThrow(/official evidence/);
  expect(()=>readOfficeLedgerLine({...entry,evidenceSha256:'a'.repeat(64),
    reconciliationProvenance:{officialSourceRecordId:'source-record',verifiedAt:'2026-11-15T12:00:00Z'}},tin))
      .toThrow(/credit attribution/);
 });
});
