import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import en from '../app/locales/en/payment.json';
import bn from '../app/locales/bn/payment.json';

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8');
const routes=read('src/app/routes.tsx');
const module=read('src/app/pages/payments/PaymentModulePage.tsx');
const list=read('src/app/pages/payments/PaymentRecordList.tsx');
const ledger=read('src/app/pages/payments/OfficeTaxpayer360Ledger.tsx');
const ledgerProjection=read('src/app/pages/payments/officeTaxpayer360LedgerModel.ts');

describe('Office taxpayer register/detail navigation',()=>{
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
  it('derives taxpayer rows from the same SQL mirror as Office Transactions',()=>{
    expect(module).toContain('for(const payment of storyRows)');
    expect(module).toContain("storyPayments.map(toStoryPaymentRow)");
    expect(module).not.toContain('Connected SQL simulation profile (no official tax credit)');
  });
  it('does not fabricate official credits or show unrelated reference corrections',()=>{
    expect(module).toContain("t('taxPositionNotVerified')");
    // The read-only Ledger tab now renders an explicit source status rather
    // than its former hardcoded placeholder. Keep the no-fake-credit contract.
    expect(module).toContain("taxpayerTab==='ledger' ? <OfficeTaxpayer360Ledger");
    expect(ledger).toContain('Saved payments do not confirm Treasury settlement');
    expect(ledger).toContain('Dhara and official reconciliation are unavailable');
    expect(ledgerProjection).toContain("credit_status:'Not verified'");
    expect(ledgerProjection).not.toContain("ledger_stage:'Verified'");
    expect(module).toContain('linkedTaxpayerCorrections(officeCorrectionQueue.items,storyPayments,selectedTin,scopeYear)');
    expect(module).toContain('taxpayerCorrectionRows=officeCorrectionRows.filter');
    expect(module).not.toContain('...referenceCorrections.map');
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
