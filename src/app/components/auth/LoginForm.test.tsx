import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openHelp: vi.fn(),
  onOfficeEnter: vi.fn(),
}));

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
      'login.needHelp': 'Demo workspace.',
      'login.password': 'Password',
      'login.passwordOptionalPlaceholder': 'Optional',
      'login.adminOnly': 'Enter admin to open the Office prototype.',
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
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), 'admin');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(mocks.onOfficeEnter).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/dashboard/dashboard-main');
    expect(screen.queryByRole('textbox', { name: /officer email/i })).not.toBeInTheDocument();
  });

  it('rejects non-admin identifiers and ignores arbitrary passwords', async () => {
    const user = userEvent.setup();
    render(<LoginForm isDesktop onForgotPassword={vi.fn()} onOfficeEnter={mocks.onOfficeEnter} />);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), 'admin');
    await user.type(screen.getByLabelText('Password'), 'anything');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.onOfficeEnter).toHaveBeenCalledOnce();
  });
});
