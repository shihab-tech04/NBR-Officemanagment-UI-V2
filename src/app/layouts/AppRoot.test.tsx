import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRoot } from './AppRoot';

vi.mock('react-redux',()=>({useDispatch:()=>vi.fn()}));
vi.mock('../hooks/useAppearance',()=>({useAppearance:()=>undefined}));
vi.mock('../context/HelpContext',()=>({HelpProvider:({children}:{children:React.ReactNode})=><>{children}</>}));
vi.mock('../components/help/HelpDrawer',()=>({HelpDrawer:()=>null}));
vi.mock('./AppShell',()=>({AppShell:({onSignedOut}:{onSignedOut:()=>void})=><main data-testid="office-demo-shell"><button onClick={onSignedOut}>Sign out</button></main>}));
vi.mock('../pages/auth/LoginPage',()=>({LoginPage:({onOfficeEnter}:{onOfficeEnter:()=>void})=><button onClick={onOfficeEnter}>Enter Office (admin)</button>}));

describe('Office prototype local entry lifecycle',()=>{
  beforeEach(()=>window.sessionStorage.clear());
  it('shows the demo entry without officer email, OTP or backend session',()=>{
    render(<AppRoot/>);
    expect(screen.getByRole('button',{name:'Enter Office (admin)'})).toBeInTheDocument();
    expect(screen.queryByTestId('office-demo-shell')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox',{name:/officer email/i})).not.toBeInTheDocument();
  });
  it('opens the demo shell and signs out without a database login',async()=>{
    const user=userEvent.setup();
    render(<AppRoot/>);
    await user.click(screen.getByRole('button',{name:'Enter Office (admin)'}));
    expect(screen.getByTestId('office-demo-shell')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('office_ui_entered')).toBe('admin');
    await user.click(screen.getByRole('button',{name:'Sign out'}));
    expect(screen.queryByTestId('office-demo-shell')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Enter Office (admin)'})).toBeInTheDocument();
    expect(window.sessionStorage.getItem('office_ui_entered')).toBeNull();
  });
});
