import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';
import { login } from '../../store/authSlice';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  navigate: vi.fn(),
  openHelp: vi.fn(),
  onOfficeEnter: vi.fn(),
}));

vi.mock('react-redux', () => ({ useDispatch: () => mocks.dispatch }));
vi.mock('react-router', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'appTitle': 'eReturn Office',
      'appSubtitle': 'Office Management System',
      'login.title': 'Welcome back',
      'login.subtitle': 'Sign in to access your office workspace.',
      'login.userManual': 'Help & User Guide',
      'login.userId': 'User ID',
      'login.userIdPlaceholder': 'Enter your User ID',
      'login.signIn': 'Sign in',
      'login.needHelp': 'Need help? Contact your system administrator.',
      'specialReg.helper': 'NRB registration support.',
      'specialReg.button': 'Special registration',
    } as Record<string, string>)[key] || key,
  }),
}));
vi.mock('../../context/HelpContext', () => ({ useHelp: () => ({ openHelp: mocks.openHelp }) }));

describe('public Office re-entry after Sign Out', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restores the User ID field and enters Office without email or OTP', async () => {
    const user = userEvent.setup();
    render(<LoginForm isDesktop onForgotPassword={vi.fn()} onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), 'admin');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(mocks.dispatch).toHaveBeenCalledWith(login({ userId: 'admin' }));
    expect(mocks.onOfficeEnter).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/dashboard/dashboard-main');
    expect(screen.queryByRole('textbox', { name: /officer email/i })).not.toBeInTheDocument();
  });

  it('does not require any credential to return to the public workspace', async () => {
    const user = userEvent.setup();
    render(<LoginForm isDesktop onForgotPassword={vi.fn()} onOfficeEnter={mocks.onOfficeEnter} />);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.dispatch).toHaveBeenCalledWith(login({ userId: 'office' }));
    expect(mocks.onOfficeEnter).toHaveBeenCalledOnce();
  });
});
