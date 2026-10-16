import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRoot } from './AppRoot';

vi.mock('react-redux',()=>({useDispatch:()=>vi.fn()}));
vi.mock('../hooks/useAppearance',()=>({useAppearance:()=>undefined}));
vi.mock('../context/HelpContext',()=>({HelpProvider:({children}:{children:React.ReactNode})=><>{children}</>}));
vi.mock('../components/help/HelpDrawer',()=>({HelpDrawer:()=>null}));
vi.mock('./AppShell',()=>({AppShell:({onSignedOut}:{onSignedOut:()=>void})=><main data-testid="open-office-shell"><button onClick={onSignedOut}>Sign out</button></main>}));
vi.mock('../pages/auth/LoginPage',()=>({LoginPage:({onOfficeEnter}:{onOfficeEnter:()=>void})=><button onClick={onOfficeEnter}>Enter Office</button>}));

describe('Office Management direct access',()=>{
  beforeEach(()=>window.sessionStorage.clear());
  it('renders its shell without a login, email, or OTP check',()=>{
    render(<AppRoot/>);
    expect(screen.getByTestId('open-office-shell')).toBeInTheDocument();
    expect(screen.queryByRole('textbox',{name:/officer email/i})).not.toBeInTheDocument();
  });

  it('shows the existing entry screen only after voluntary sign-out, then re-enters',async()=>{
    const user=userEvent.setup();
    render(<AppRoot/>);
    await user.click(screen.getByRole('button',{name:'Sign out'}));
    expect(screen.queryByTestId('open-office-shell')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Enter Office'})).toBeInTheDocument();
    expect(window.sessionStorage.getItem('office_ui_signed_out')).toBe('true');
    await user.click(screen.getByRole('button',{name:'Enter Office'}));
    expect(screen.getByTestId('open-office-shell')).toBeInTheDocument();
    expect(window.sessionStorage.getItem('office_ui_signed_out')).toBeNull();
  });
});
