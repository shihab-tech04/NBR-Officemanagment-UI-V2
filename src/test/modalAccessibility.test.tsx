import {describe,it,expect,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import {AppModal} from '../app/components/modals/AppModal';
import {PrimaryButton} from '../app/components/buttons/PrimaryButton';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(s:string)=>s})}));
describe('shared Office Management modal accessibility',()=>{
  it('exposes the dialog, its title and primary action to the accessibility tree',()=>{
    render(<AppModal open title="New correction" onClose={()=>{}} footer={<PrimaryButton>Review draft</PrimaryButton>}>
      <p>Correction details</p>
    </AppModal>);
    expect(screen.getByRole('dialog',{name:'New correction'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Review draft'})).toBeInTheDocument();
  });
});