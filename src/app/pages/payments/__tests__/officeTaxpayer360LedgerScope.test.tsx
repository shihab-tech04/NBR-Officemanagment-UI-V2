// @vitest-environment jsdom
import {beforeAll,describe,expect,it} from 'vitest';
import {fireEvent,render} from '@testing-library/react';
import {Provider} from 'react-redux';
import {store} from '../../../store/store';
import {OfficeTaxpayer360Ledger} from '../OfficeTaxpayer360Ledger';
import {summarizeTaxpayerRecordedActivity} from '../officeTaxpayerActivity';
import type {StoryPayment} from '../story1OfficeApi';

// The real shared PaymentRecordList retains its own query and filter state.
// Scope switches must reset that state rather than hiding a new taxpayer's data.
beforeAll(()=>{
  if(!window.matchMedia)Object.defineProperty(window,'matchMedia',{
    configurable:true,value:(query:string)=>({
      matches:false,media:query,onchange:null,
      addListener:()=>{},removeListener:()=>{},addEventListener:()=>{},
      removeEventListener:()=>{},dispatchEvent:()=>false,
    }),
  });
});
const first='111111111111',second='222222222222';
const payment=(tin:string):StoryPayment=>({
  id:'record-'+tin,service:'ADVANCE_TAX',amountMinor:5000,
  status:'SIMULATED_SUCCESS',createdAt:'2026-06-01T10:00:00Z',
  details:{taxpayerTin:tin,assessmentYear:'2026-27'},
});
function ledger(tin:string,year:string,language:'en'|'bn'='en'){
  const snapshot=summarizeTaxpayerRecordedActivity([payment(tin)],[],tin,year);
  return <Provider store={store}>
    <OfficeTaxpayer360Ledger snapshot={snapshot} taxpayerTin={tin} year={year}
      language={language} loading={false} error="" onRetry={()=>{}} onOpen={()=>{}}/>
  </Provider>;
}
describe('Taxpayer 360 ledger scoped table state',()=>{
  it('clears the custom date range when switching assessment years',()=>{
    const {container,rerender}=render(ledger(first,'all'));
    const from=()=>container.querySelector('#office-ledger-from') as HTMLInputElement|null;
    expect(from()).not.toBeNull();
    fireEvent.change(from()!,{target:{value:'2026-06-15'}});
    expect(from()?.value).toBe('2026-06-15');
    rerender(ledger(first,'2026-27'));
    expect(from()?.value).toBe('');
    expect(container.textContent).toContain('record-'+first);
  });

  it('resets translated table filters and search when the language changes',()=>{
    const {container,rerender}=render(ledger(first,'all','en'));
    const search=()=>container.querySelector('.table-card__search-wrapper input') as HTMLInputElement|null;
    expect(search()).not.toBeNull();
    fireEvent.change(search()!,{target:{value:'no-match'}});
    expect(search()?.value).toBe('no-match');
    rerender(ledger(first,'all','bn'));
    expect(search()?.value).toBe('');
    expect(container.textContent).toContain('record-'+first);
    expect(container.textContent).toContain('কর ক্রেডিটের অবস্থা');
  });

  it('clears old table search on taxpayer and assessment-year switches',()=>{
    const {container,rerender}=render(ledger(first,'all'));
    const search=()=>container.querySelector('.table-card__search-wrapper input') as HTMLInputElement|null;
    expect(search()).not.toBeNull();
    fireEvent.change(search()!,{target:{value:'no-match'}});
    expect(search()?.value).toBe('no-match');

    rerender(ledger(second,'all'));
    expect(search()?.value).toBe('');
    fireEvent.change(search()!,{target:{value:'record'}});
    expect(search()?.value).toBe('record');

    rerender(ledger(second,'2026-27'));
    expect(search()?.value).toBe('');
    expect(container.textContent).toContain('record-'+second);
  });
});
