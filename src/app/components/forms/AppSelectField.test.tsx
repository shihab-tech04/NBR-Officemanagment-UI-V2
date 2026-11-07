import {expect,it,vi} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {AppSelectField} from './AppSelectField';

it('searches grouped choices and returns the original stored value',()=>{
  const onChange=vi.fn();
  render(<AppSelectField id="office-tag" label="Tag" value="" onChange={onChange}
    options={[
      {value:'',label:'Choose a tag'},
      {value:'clients',label:'Clients',group:'Business'},
      {value:'father',label:'Father',group:'Family'},
      {value:'mother',label:'Mother',group:'Family'},
      {value:'siblings',label:'Siblings',group:'Family'},
      {value:'friends',label:'Friends',group:'Family'}
    ]}/>);
  const input=screen.getByRole('combobox');
  fireEvent.change(input,{target:{value:'Friends'}});
  fireEvent.click(screen.getByRole('option',{name:'Friends'}));
  expect(onChange).toHaveBeenCalledWith('friends');
});

it('keeps compact short lists as selects',()=>{
  render(<AppSelectField id="payment-filter" label="Filter" value="all" onChange={()=>{}}
    options={['all','open','closed']}/>);
  expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('false');
});
