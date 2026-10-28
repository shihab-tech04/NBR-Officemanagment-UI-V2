import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openHelp: vi.fn(),
  onOfficeEnter: vi.fn(),
}));

const shared = vi.hoisted(() => ({
  enabled: false,
  signIn: vi.fn(),
  signOut: vi.fn(),
  checkAccess: vi.fn(),
}));
vi.mock('../../pages/audit/auditSharedSql', () => ({
  isSharedAuditMode: () => shared.enabled,
  getAuditSqlClient: () => ({ auth: { signInWithPassword: shared.signIn, signOut: shared.signOut } }),
  checkAuditSqlAccess: (...args: unknown[]) => shared.checkAccess(...args),
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
  beforeEach(() => { vi.clearAllMocks(); shared.enabled = false; });

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
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), 'admin');
    await user.type(screen.getByLabelText('Password'), 'anything');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.onOfficeEnter).toHaveBeenCalledOnce();
  });

  it('accepts blank password for admin and rejects another name even with a password', async () => {
    const user = userEvent.setup();
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), 'officer');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
    expect(screen.getByText('Enter admin to open the Office prototype.')).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'User ID' }));
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), ' admin ');
    await user.clear(screen.getByLabelText('Password'));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.onOfficeEnter).toHaveBeenCalledOnce();
  });

  it('authenticates a shared-mode officer and checks active SQL membership before access', async () => {
    shared.enabled = true;
    shared.signIn.mockResolvedValue({ error: null });
    shared.checkAccess.mockResolvedValue({ userId: 'officer', role: 'circle_user' });
    const user = userEvent.setup();
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: 'Officer email' }), 'officer@example.org');
    await user.type(screen.getByLabelText('Password'), 'example-secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(shared.checkAccess).toHaveBeenCalledOnce());
    expect(shared.signIn).toHaveBeenCalledWith({
      email: 'officer@example.org', password: 'example-secret',
    });
    expect(mocks.onOfficeEnter).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/dashboard/dashboard-main');
  });

  it('fails closed and signs out when shared-mode Audit membership is missing', async () => {
    shared.enabled = true;
    shared.signIn.mockResolvedValue({ error: null });
    shared.checkAccess.mockRejectedValue(new Error('membership missing'));
    shared.signOut.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: 'Officer email' }), 'officer@example.org');
    await user.type(screen.getByLabelText('Password'), 'example-secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('An active Audit officer membership is required.');
    expect(shared.signOut).toHaveBeenCalledOnce();
    expect(shared.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('does not allow prototype admin to bypass shared officer sign-in', async () => {
    shared.enabled = true;
    const user = userEvent.setup();
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: 'Officer email' }), 'admin');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Officer email and password are required.');
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
