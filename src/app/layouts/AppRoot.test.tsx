import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppRoot } from './AppRoot';

vi.mock('react-redux',()=>({useDispatch:()=>vi.fn()}));
vi.mock('../hooks/useAppearance',()=>({useAppearance:()=>undefined}));
vi.mock('../context/HelpContext',()=>({HelpProvider:({children}:{children:React.ReactNode})=><>{children}</>}));
vi.mock('../components/help/HelpDrawer',()=>({HelpDrawer:()=>null}));
vi.mock('./AppShell',()=>({AppShell:()=> <main data-testid="open-office-shell">Office workspace</main>}));

describe('Office Management direct access',()=>{
  it('renders its shell without a login, email, or OTP check',()=>{
    render(<AppRoot/>);
    expect(screen.getByTestId('open-office-shell')).toBeInTheDocument();
    expect(screen.queryByRole('textbox',{name:/officer email/i})).not.toBeInTheDocument();
  });
});
