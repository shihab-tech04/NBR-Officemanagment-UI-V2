import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import type {OfficeLedgerLine,OfficeLedgerReport} from '../officeConsolidatedLedger';
import {OfficeConsolidatedTaxpayerLedger,csvCell} from '../OfficeConsolidatedTaxpayerLedger';

const state=vi.hoisted(()=>({language:'en',load:vi.fn()}));

vi.mock('react-i18next',()=>({
  useTranslation:()=>({i18n:{resolvedLanguage:state.language}}),
}));

vi.mock('../officeConsolidatedLedger',async importOriginal=>{
  const actual=await importOriginal<typeof import('../officeConsolidatedLedger')>();
  return {...actual,loadOfficeConsolidatedLedger:state.load};
});

vi.mock('../../../components/tables/ResponsiveTable',()=>({
  ResponsiveTable:({rows,emptyMessage}:{rows:Array<Record<string,string>>;emptyMessage:string})=><div>
    {rows.map(row=><div key={row.id} data-testid="ledger-row">{row.source} {row.reference}</div>)}
    {!rows.length&&<p>{emptyMessage}</p>}
  </div>,
}));

vi.mock('../../../components/modals/AppModal',()=>({
  AppModal:({open,children}:{open:boolean;children:unknown})=>open?<div>{children as never}</div>:null,
}));

const tin='123456789012';
function line(sourceSystem:'BANK'|'BRTA',sourceRecordId:string,eventDate:string):OfficeLedgerLine{
  return {
    id:sourceSystem+':'+sourceRecordId+':allocation:1',taxpayerTin:tin,sourceSystem,
    sourceRecordId,sourceAllocationId:'allocation',sourceRevision:1,dhara:'175',
    paymentSource:sourceSystem,amountMinor:100,assessmentYear:'2026-27',eventDate,
    originalReference:sourceSystem.toLowerCase()+'-ref',entryKind:'DEDUCTION',
    financialStatus:'UNVERIFIED',sourcePaymentId:null,sourceStatus:null,
    evidenceSha256:null,canonicalCreditReference:null,canonicalCreditLineId:null,
    reconciliationProvenance:{},
  };
}
const report:OfficeLedgerReport={
  tin,lines:[
    line('BANK','bank-before','2026-11-01T18:00:00Z'),
    line('BRTA','brta-same-day','2026-11-02T17:59:00Z'),
    line('BANK','bank-after','2026-11-02T18:00:00Z'),
  ],verifiedCreditMinor:0,recordedPaymentMinor:0,recordedDeductionMinor:300,
  allSourceCoverage:['BANK','BRTA'],
};

beforeEach(()=>{
  state.language='en';
  state.load.mockReset().mockResolvedValue(report);
});
afterEach(cleanup);

describe('F-177 Office Taxpayer 360 date filters',()=>{
  it('filters inclusively by Dhaka calendar date and composes with source and search filters',async()=>{
    render(<OfficeConsolidatedTaxpayerLedger tin={tin}/>);
    await screen.findAllByTestId('ledger-row');
    const rows=()=>screen.getAllByTestId('ledger-row').map(row=>row.textContent??'');

    fireEvent.change(screen.getByLabelText('From date'),{target:{value:'2026-11-02'}});
    fireEvent.change(screen.getByLabelText('To date'),{target:{value:'2026-11-02'}});
    expect(rows()).toHaveLength(2);
    expect(rows().some(row=>row.includes('bank-before'))).toBe(false);
    expect(rows().some(row=>row.includes('brta-ref'))).toBe(true);
    expect(rows().some(row=>row.includes('bank-after'))).toBe(false);

    fireEvent.change(screen.getByLabelText('Source'),{target:{value:'BANK'}});
    fireEvent.change(screen.getByLabelText('Search ledger'),{target:{value:'bank-ref'}});
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toContain('bank-ref');
  });

  it('fails closed for an inverted date range and restores rows when cleared',async()=>{
    render(<OfficeConsolidatedTaxpayerLedger tin={tin}/>);
    await screen.findAllByTestId('ledger-row');
    fireEvent.change(screen.getByLabelText('From date'),{target:{value:'2026-11-03'}});
    fireEvent.change(screen.getByLabelText('To date'),{target:{value:'2026-11-02'}});

    expect(screen.getByRole('alert').textContent).toContain('start date');
    expect(screen.getByTestId('office-verified-ledger').textContent).toContain('0 source lines');
    expect(screen.getByRole('button',{name:'Export filtered CSV'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Clear dates'}));
    expect(screen.getAllByTestId('ledger-row')).toHaveLength(3);
  });

  it('provides Bengali date controls and validation text',async()=>{
    state.language='bn';
    render(<OfficeConsolidatedTaxpayerLedger tin={tin}/>);
    await screen.findAllByTestId('ledger-row');
    expect(screen.getByLabelText('শুরুর তারিখ')).toBeTruthy();
    expect(screen.getByLabelText('শেষ তারিখ')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('শুরুর তারিখ'),{target:{value:'2026-11-03'}});
    fireEvent.change(screen.getByLabelText('শেষ তারিখ'),{target:{value:'2026-11-02'}});
    expect(screen.getByRole('alert').textContent).toContain('শুরুর তারিখ');
  });
});

describe('F-177 ledger CSV export safety',()=>{
  it('neutralizes provider-controlled spreadsheet formulas without mutating their contents',()=>{
    for(const unsafe of [
      '=HYPERLINK("https://example.invalid","open")',
      '+SUM(1,2)',
      '-1+2',
      '@SUM(1,2)',
      '  =IMPORTXML("https://example.invalid","x")',
      '\t=WEBSERVICE("https://example.invalid")',
      '\r\n@SUM(1,2)',
      '\uFEFF=1+1',
      '\u200B=1+1',
    ]){
      const cell=csvCell(unsafe);
      expect(cell.startsWith('"\'')).toBe(true);
      expect(cell.slice(2,-1).replaceAll('""','"')).toBe(unsafe);
    }
  });
  it('preserves ordinary source values, Bengali text, exact amounts and RFC CSV quote escaping',()=>{
    for(const safe of [
      'BRTA','Source Tax','ধারা ১৭৫','123456789012','2026-27','101',
      'reference "quoted"','normal\nmultiline field',
    ])expect(csvCell(safe)).toBe('"'+safe.replaceAll('"','""')+'"');
    expect(csvCell(null)).toBe('""');
  });
});
