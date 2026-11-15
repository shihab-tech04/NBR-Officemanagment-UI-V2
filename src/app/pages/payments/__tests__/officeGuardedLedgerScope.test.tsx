// @vitest-environment jsdom
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {ReactNode} from 'react';
import type {TableRow} from '../../modulePageUtils';
const mocked=vi.hoisted(()=>({getPage:vi.fn()}));

vi.mock('../officeGuardedLedgerSource',async importOriginal=>({
  ...await importOriginal<typeof import('../officeGuardedLedgerSource')>(),
  getGuardedOfficeLedger:(...args:unknown[])=>mocked.getPage(...args),
}));
vi.mock('../PaymentRecordList',()=>({
  PaymentRecordList:({rows,onOpen}:{rows:TableRow[];onOpen:(row:TableRow)=>void})=>
    <button data-testid="open-source" type="button" onClick={()=>onOpen(rows[0])}>Open source record</button>
}));
vi.mock('../../../components/drawers/DynamicDetailsDrawer',()=>({
  DynamicDetailsDrawer:({open,rowData}:{open:boolean;rowData:TableRow|null})=>
    open&&rowData?<section data-testid="source-detail">{String(rowData.payment_ref)}</section>:null
}));
vi.mock('../../../components/buttons/SecondaryButton',()=>({
  SecondaryButton:({children,onClick}:{children:ReactNode;onClick:()=>void})=>
    <button type="button" onClick={onClick}>{children}</button>
}));
import {OfficeGuardedLedgerPanel} from '../OfficeGuardedLedgerPanel';

const first='111111111111',second='222222222222';
function result(tin:string){
  return {items:[{
    sourceSystem:'SOHOJKOR',sourceRecordId:'source-'+tin,
    sourceAllocationId:null,sourceRevision:1,taxpayerTin:tin,dhara:null,
    paymentSource:'Sohojkor',amountMinor:'12300',assessmentYear:'2026-27',
    eventDate:'2026-05-10T10:00:00Z',originalReference:null,
    entryKind:'PAYMENT_RECORD',financialStatus:'UNVERIFIED'
  }],offset:0,limit:200,verifiedExternalCreditMinor:'0',
  mirroredSohojkorCreditVerified:false};
}
const panel=(tin:string,year='all',language:'en'|'bn'='en',fromDate='',toDate='')=>
  <OfficeGuardedLedgerPanel taxpayerTin={tin} year={year} language={language}
    fromDate={fromDate} toDate={toDate}/>;

describe('WS4 guarded source detail isolation',()=>{
  beforeEach(()=>{
    mocked.getPage.mockReset();
    mocked.getPage.mockImplementation(async(tin:string)=>result(tin));
  });
  it('never renders a previously opened source record when taxpayer scope changes',async()=>{
    const view=render(panel(first));
    await screen.findByTestId('open-source');
    fireEvent.click(screen.getByTestId('open-source'));
    expect(screen.getByTestId('source-detail').textContent).toContain('source-'+first);
    view.rerender(panel(second));
    // Assert synchronously, BEFORE any pending effect clears selection.
    expect(screen.queryByTestId('source-detail')).toBeNull();
    await waitFor(()=>expect(mocked.getPage).toHaveBeenCalledWith(second));
    await screen.findByTestId('open-source');
    fireEvent.click(screen.getByTestId('open-source'));
    expect(screen.getByTestId('source-detail').textContent).toContain('source-'+second);
  });
  it('invalidates source details immediately on year, date and language changes',async()=>{
    const view=render(panel(first));
    await screen.findByTestId('open-source');
    fireEvent.click(screen.getByTestId('open-source'));
    expect(screen.getByTestId('source-detail')).not.toBeNull();
    view.rerender(panel(first,'2026-27'));
    expect(screen.queryByTestId('source-detail')).toBeNull();
    fireEvent.click(screen.getByTestId('open-source'));
    view.rerender(panel(first,'2026-27','bn'));
    expect(screen.queryByTestId('source-detail')).toBeNull();
    fireEvent.click(screen.getByTestId('open-source'));
    view.rerender(panel(first,'2026-27','bn','2026-05-01'));
    expect(screen.queryByTestId('source-detail')).toBeNull();
  });
});
