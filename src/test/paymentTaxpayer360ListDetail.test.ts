import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import en from '../app/locales/en/payment.json';
import bn from '../app/locales/bn/payment.json';
import type {TaxpayerRegistrationProfile} from '../app/pages/payments/officeTaxpayerRegistrationProfiles';
import {resolveVerifiedOfficeLedgerTin} from '../app/pages/payments/officeVerifiedLedgerIdentity';

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
const routes=read('src/app/routes.tsx');
const module=read('src/app/pages/payments/PaymentModulePage.tsx');
const list=read('src/app/pages/payments/PaymentRecordList.tsx');

const canonicalTin='123456789012';
const previewSampleTin='1010101010101';
const verifiedProfile=(source='NBR_TIN',overrides:Record<string,unknown>={})=>({
  accountId:'user10',tin:canonicalTin,revision:1,updatedAt:'2026-11-21T00:00:00Z',
  profile:{tin:canonicalTin,source,sourceUpdatedAt:'2026-11-20T00:00:00Z'},
  ...overrides,
}) as unknown as TaxpayerRegistrationProfile;

describe('Office taxpayer register/detail navigation',()=>{
  it('binds the F-177 ledger only to an authoritative account profile',()=>{
    expect(resolveVerifiedOfficeLedgerTin(previewSampleTin,'user10',verifiedProfile())).toBe(canonicalTin);
    expect(resolveVerifiedOfficeLedgerTin(previewSampleTin,'user10',verifiedProfile('REVIEWED_CERTIFICATE'))).toBe(canonicalTin);
    expect(resolveVerifiedOfficeLedgerTin(previewSampleTin,'user10',verifiedProfile('SYNTHETIC'))).toBe('');
    expect(resolveVerifiedOfficeLedgerTin(previewSampleTin,'user11',verifiedProfile())).toBe('');
    expect(resolveVerifiedOfficeLedgerTin(canonicalTin,null,verifiedProfile())).toBe(canonicalTin);
    expect(resolveVerifiedOfficeLedgerTin(previewSampleTin,null,verifiedProfile())).toBe('');
    expect(resolveVerifiedOfficeLedgerTin(previewSampleTin,'user10',null)).toBe('');
    expect(resolveVerifiedOfficeLedgerTin(previewSampleTin,'user10',verifiedProfile('NBR_TIN',{tin:previewSampleTin}))).toBe('');
    expect(resolveVerifiedOfficeLedgerTin(previewSampleTin,'user10',verifiedProfile('NBR_TIN',{
      profile:{tin:canonicalTin,source:'NBR_TIN',sourceUpdatedAt:'bad'}
    }))).toBe('');
    expect(resolveVerifiedOfficeLedgerTin(previewSampleTin,'user10',verifiedProfile('NBR_TIN',{
      profile:{tin:'999999999999',source:'NBR_TIN',sourceUpdatedAt:'2026-11-20T00:00:00Z'}
    }))).toBe('');
  });
  it('opens a separate taxpayer detail route without changing the navigation shell',()=>{
    expect(routes).toContain('path: "payments/taxpayer-360/:tin"');
    expect(routes).toContain('taxpayerTin={tin}');
    expect(module).toContain("navigate('/payments/taxpayer-360/'+encodeURIComponent");
    expect(module).toContain("navigate('/payments/taxpayer-360')");
  });
  it('reuses the canonical Office table, including search and pagination',()=>{
    expect(module).toContain('PaymentRecordList kind="taxpayers"');
    expect(list).toContain('ResponsiveTable');
    expect(list).toContain('AppSearchField');
    expect(list).toContain('Pagination');
  });
  it('derives preview directory from V2 SQL and reconciles linked payments from Office SQL',()=>{
    expect(module).toContain('getOfficePreviewTaxpayers');
    expect(module).toContain('previewAccounts.map(preview=>');
    expect(module).toContain("toStoryTaxpayerPaymentRow(payment,preview.sampleTin,'all')");
    expect(module).toContain("storyPayments.map(toStoryPaymentRow)");
    expect(module).not.toContain('Connected SQL simulation profile (no official tax credit)');
  });
  it('does not fabricate official credits or show unrelated reference corrections',()=>{
    expect(module).toContain("t('taxPositionNotVerified')");
    expect(module).toContain("resolveVerifiedOfficeLedgerTin(selectedTin,");
    expect(module).toContain("taxpayerTab==='ledger' ? <OfficeConsolidatedTaxpayerLedger tin={ledgerTin} />");
    expect(read('src/app/pages/payments/officeVerifiedLedgerIdentity.ts')).toContain("new Set(['NBR_TIN','REVIEWED_CERTIFICATE'])");
    expect(read('src/app/pages/payments/OfficeConsolidatedTaxpayerLedger.tsx')).toContain('Select a valid 12-digit taxpayer TIN');
    expect(read('src/app/pages/payments/officeConsolidatedLedger.ts')).toContain('Official credit total does not reconcile');
    expect(module).toContain("linkedTaxpayerCorrections(officeCorrectionQueue.items,storyPayments,selectedTin,'all')");
    expect(module).toContain('taxpayerCorrectionRows=officeCorrectionRows.filter');
    expect(module).not.toContain('...referenceCorrections.map');
  });
  it('shows only SQL-reconciled allocations for the verified Taxpayer 360 identity',()=>{
    expect(module).toContain('buildOfficeBeneficiaryDirectoryRows(storyPayments,ledgerTin,scopeYear)');
    expect(module).toContain("taxpayerTab==='beneficiaries'");
    expect(module).toContain('Saved contact lists and tags remain private.');
    expect(module).not.toContain('Authorized, account-scoped Office reader is not yet available');
  });
  it('contains both language variants for the complete drilldown workflow',()=>{
    for(const key of ['taxpayerRegister','taxpayerRegisterScope','loadingTaxpayers','linkedPaymentRecords',
      'backToTaxpayers','taxpayerDetailScope','taxPositionNotVerified','ledgerNotVerified',
      'correctionsNotVerified','search_taxpayers'] as const){
      expect(en[key].length).toBeGreaterThan(0);
      expect(bn[key].length).toBeGreaterThan(0);
    }
  });
});
