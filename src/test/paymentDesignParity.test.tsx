import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnifiedMobileCard } from '../app/components/tables/UnifiedMobileCard';
import { DynamicDetailsDrawer } from '../app/components/drawers/DynamicDetailsDrawer';
import { StatusBadge } from '../app/components/badges/StatusBadge';
import type { ColDef } from '../app/pages/modulePageUtils';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k:string)=>k }) }));
vi.mock('../app/components/shared/ResponsiveOverlay', () => ({
  ResponsiveOverlay: ({children,open}: {children:React.ReactNode;open:boolean}) => open ? <div data-testid="drawer-content">{children}</div>:null,
}));

const data = {
 taxpayer_name:'Md. Rahman',tin:'123456789012',payer_name:'Md. Abdul Karim',
 payment_ref:'PT-2026-000922',financial_receipt_status:'Received by Government',
 ledger_status:'Blocked — under review',amount:'৳100,000',assessment_year:'2027-28',date:'12 Oct 2026',
};
const cols:ColDef[] = Object.keys(data).map(key=>({type:'col',col:{key,label:key}}));

describe('Payment design system integration — financial states and identity',()=>{
  it('preserves both Government receipt and tax-credit states in a mobile card',()=>{
    render(<UnifiedMobileCard row={data} cols={cols} mobileCardMapping={{primary:'taxpayer_name',identifier:'payment_ref',meta:['financial_receipt_status','ledger_status','assessment_year'],status:'ledger_status',amount:'amount'}}/>);
    expect(screen.getAllByText('Received by Government').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Blocked — under review').length).toBeGreaterThan(0);
    expect(screen.getByText('PT-2026-000922')).toBeInTheDocument();
  });
  it('keeps all tax-credit and payment IDs in the shared details drawer',()=>{
    const fields = Object.keys(data).map(key=>({key,label:key}));
    render(<DynamicDetailsDrawer open rowData={data} columns={fields} onClose={()=>{}} showActions={false}/>);
    expect(screen.getAllByText('PT-2026-000922').length).toBeGreaterThan(0);
    expect(screen.getAllByText('blockedUnderReview').length).toBeGreaterThan(0);
  });
  it('does not make a credited status equal to financial receipt',()=>{
    render(<div><StatusBadge value="Received by Government"/><StatusBadge value="Blocked — under review"/></div>);
    expect(screen.getByText('receivedByGovernment').className).toContain('badge-success');
    expect(screen.getByText('blockedUnderReview').className).toContain('badge-warning');
  });
});