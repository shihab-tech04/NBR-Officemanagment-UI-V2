import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  openHelp: vi.fn(),
  onOfficeEnter: vi.fn(),
  pathname: "/",
  search: "",
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
const cmsAuth = vi.hoisted(() => ({
  getClient: vi.fn(),
  signOut: vi.fn(),
  signIn: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  hasVerified: vi.fn(),
  resetEmail: vi.fn(),
  getUser: vi.fn(),
  updatePassword: vi.fn(),
  rememberPreference: false,
  setRemember: vi.fn(),
}));
vi.mock('../../services/officeCmsBridge', () => ({
  getOfficeCmsAuthClient: cmsAuth.getClient,
  readRememberOfficeSession: () => cmsAuth.rememberPreference,
  setRememberOfficeSession: (value: boolean) => {
    cmsAuth.rememberPreference = value;
    cmsAuth.setRemember(value);
  },
}));
vi.mock('../../services/taxpayCmsClient', () => ({
  getTaxPayCmsClient: cmsAuth.getClient,
  hasVerifiedCmsPublisherSession: (...args: unknown[]) => cmsAuth.hasVerified(...args),
}));
vi.mock('react-router', () => ({ useNavigate: () => mocks.navigate, useLocation: () => ({ pathname: mocks.pathname, search: mocks.search }) }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'appTitle': 'eReturn Office',
      'appSubtitle': 'Office Management System',
      'login.title': 'Welcome back',
      'login.forgotPassword': 'Forgot password?',
      'login.resetTitle': 'Reset password',
      'login.resetSubtitle': 'Request a recovery link',
      'login.resetChooseTitle': 'Choose a new password',
      'login.resetChooseSubtitle': 'Set a new password',
      'login.resetEmailHint': 'Registered administrator email',
      'login.resetSend': 'Send reset link',
      'login.resetSending': 'Sending…',
      'login.resetEmailSent': 'Check inbox',
      'login.resetBack': 'Back to sign in',
      'login.resetChecking': 'Verifying reset link',
      'login.resetLinkInvalid': 'This reset link is invalid or expired',
      'login.newPassword': 'New password',
      'login.confirmPassword': 'Confirm new password',
      'login.newPasswordTooShort': 'Use at least 12 characters',
      'login.passwordMismatch': 'The two passwords do not match',
      'login.resetUpdate': 'Update password',
      'login.resetUpdating': 'Updating…',
      'login.resetUpdated': 'Your password has been changed',
      'login.resetUnavailable': 'Password recovery is unavailable',
      'login.resetSignOutWarning': 'Password updated but session remains',
      'login.subtitle': 'Sign in to access your office workspace.',
      'login.publisherSubtitle': 'Enter authorized Office password to publish.',
      'login.publisherPasswordRequired': 'Enter your authorized Office password to publish TaxPay content.',
      'login.userManual': 'Help & User Guide',
      'login.userId': 'User ID',
      'login.userIdOrEmail': 'User ID or Office email',
      'login.userIdOrEmailPlaceholder': 'Enter admin or your Office email',
      'login.showPassword': 'Show password',
      'login.hidePassword': 'Hide password',
      'login.rememberMe': 'Remember me',
      'login.userIdPlaceholder': 'Enter your User ID',
      'login.signIn': 'Sign in',
      'login.needHelp': 'Demo workspace.',
      'login.password': 'Password',
      'login.passwordOptionalPlaceholder': 'Optional',
      'login.passwordPlaceholder': 'Enter password',
      'login.adminOnly': 'Enter admin to open the Office prototype.',
      'specialReg.helper': 'NRB registration support.',
      'specialReg.button': 'Special registration',
    } as Record<string, string>)[key] || key,
  }),
}));
vi.mock('../../context/HelpContext', () => ({ useHelp: () => ({ openHelp: mocks.openHelp }) }));

describe('public Office re-entry after Sign Out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shared.enabled = false;
    mocks.pathname = '/';
    mocks.search = "";
    cmsAuth.getClient.mockReturnValue(null);
    cmsAuth.hasVerified.mockResolvedValue(false);
    cmsAuth.rememberPreference = false;
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it('uses the existing Office sign-in to authorize publishing without another login', async () => {
    const user = userEvent.setup();
    cmsAuth.signIn.mockResolvedValue({ data: { session: { user: { id: 'publisher' } } }, error: null });
    cmsAuth.hasVerified.mockResolvedValue(true);
    cmsAuth.getClient.mockReturnValue({ auth: { signInWithPassword: cmsAuth.signIn } });
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: /^User ID/ }), 'admin');
    await user.type(screen.getByLabelText('Password'), 'existing-office-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(mocks.onOfficeEnter).toHaveBeenCalledOnce());
    expect(cmsAuth.signIn).toHaveBeenCalledWith({
      email: 'shihabshajib01@gmail.com', password: 'existing-office-password',
    });
    expect(cmsAuth.hasVerified).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/dashboard/dashboard-main');
  });

  it('rejects non-admin identifiers and does not treat an arbitrary password as a valid Office session', async () => {
    const user = userEvent.setup();
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
    await user.type(screen.getByRole('textbox', { name: /^User ID/ }), 'admin');
    await user.type(screen.getByLabelText('Password'), 'anything');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('service is unavailable');
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('preserves the approved password-optional entry on other Office pages', async () => {
    const user = userEvent.setup();
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: /^User ID/ }), 'officer');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter admin to open the Office prototype.')).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: /^User ID/ }));
    await user.type(screen.getByRole('textbox', { name: /^User ID/ }), ' admin ');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mocks.onOfficeEnter).toHaveBeenCalledOnce());
    expect(cmsAuth.hasVerified).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/dashboard/dashboard-main');
  });

  it('requires the existing publisher password only when opening TaxPay CMS', async () => {
    mocks.pathname = '/administration/content-management';
    cmsAuth.getClient.mockReturnValue({ auth: { signInWithPassword: cmsAuth.signIn } });
    const user = userEvent.setup();
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: /^User ID/ }), 'admin');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your authorized Office password to publish TaxPay content');
    expect(cmsAuth.hasVerified).toHaveBeenCalledOnce();
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('confirms the existing Office publisher once before entering the workspace', async () => {
    mocks.pathname = '/administration/content-management';
    const user = userEvent.setup();
    cmsAuth.signIn.mockResolvedValue({ error: null, data: { session: { user: { id: 'sql-office-admin' } } } });
    cmsAuth.hasVerified.mockResolvedValue(true);
    cmsAuth.getClient.mockReturnValue({ auth: { signInWithPassword: cmsAuth.signIn } });
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: /^User ID/ }), 'admin');
    await user.type(screen.getByLabelText('Password'), 'verified-publishing-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mocks.onOfficeEnter).toHaveBeenCalledOnce());
    expect(cmsAuth.signIn).toHaveBeenCalledWith({
      email: 'shihabshajib01@gmail.com', password: 'verified-publishing-password',
    });
    expect(cmsAuth.hasVerified).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/administration/content-management');
  });

  it('reuses a verified returning publisher session without demanding another password', async () => {
    mocks.pathname = '/administration/content-management';
    const user = userEvent.setup();
    cmsAuth.hasVerified.mockResolvedValue(true);
    cmsAuth.getClient.mockReturnValue({ auth: { signInWithPassword: cmsAuth.signIn } });
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: /^User ID/ }), 'admin');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mocks.onOfficeEnter).toHaveBeenCalledOnce());
    expect(cmsAuth.hasVerified).toHaveBeenCalledOnce();
    expect(cmsAuth.signIn).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/administration/content-management');
  });

  it('does not turn an invalid CMS password into SQL publishing authority', async () => {
    const user = userEvent.setup();
    cmsAuth.signOut.mockResolvedValue({ error: null });
    cmsAuth.signIn.mockResolvedValue({ error: new Error('invalid credentials'), data: { session: null } });
    cmsAuth.getClient.mockReturnValue({ auth: {
      signOut: cmsAuth.signOut, signInWithPassword: cmsAuth.signIn,
    } });
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: /^User ID/ }), 'admin');
    await user.type(screen.getByLabelText('Password'), 'incorrect-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Office sign-in failed');
    expect(cmsAuth.signIn).toHaveBeenCalledOnce();
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('rejects a password-backed account without SQL publisher authority', async () => {
    const user = userEvent.setup();
    cmsAuth.signOut.mockResolvedValue({ error: null });
    cmsAuth.signIn.mockResolvedValue({ error: null, data: { session: { user: { id: 'unauthorized' } } } });
    cmsAuth.hasVerified.mockResolvedValue(false);
    cmsAuth.getClient.mockReturnValue({ auth: {
      signOut: cmsAuth.signOut, signInWithPassword: cmsAuth.signIn,
    } });
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: /^User ID/ }), 'admin');
    await user.type(screen.getByLabelText('Password'), 'sql-account-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('does not have permission to publish TaxPay content');
    expect(cmsAuth.hasVerified).toHaveBeenCalledOnce();
    expect(cmsAuth.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('rejects an unverified SQL identity without entering Office', async () => {
    const user = userEvent.setup();
    cmsAuth.signOut.mockResolvedValue({ error: null });
    cmsAuth.signIn.mockResolvedValue({ error: null, data: { session: { user: { id: 'sql-admin' } } } });
    cmsAuth.hasVerified.mockResolvedValue(false);
    cmsAuth.getClient.mockReturnValue({ auth: { signOut: cmsAuth.signOut, signInWithPassword: cmsAuth.signIn } });
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: /^User ID/ }), 'admin');
    await user.type(screen.getByLabelText('Password'), 'revoked-session-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('does not have permission to publish TaxPay content');
    expect(cmsAuth.hasVerified).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(cmsAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it('blocks password-backed Office sign-in when SQL publishing service is not configured', async () => {
    const user = userEvent.setup();
    cmsAuth.getClient.mockReturnValue(null);
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: /^User ID/ }), 'admin');
    await user.type(screen.getByLabelText('Password'), 'sql-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('service is unavailable');
    expect(mocks.navigate).not.toHaveBeenCalled();
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
  it('shows a password recovery link only at the existing Office publishing sign-in', async () => {
    const user = userEvent.setup();
    mocks.pathname = '/administration/content-management';
    cmsAuth.resetEmail.mockResolvedValue({ data: {}, error: null });
    cmsAuth.getClient.mockReturnValue({ auth: { resetPasswordForEmail: cmsAuth.resetEmail } });
    render(<LoginForm isDesktop />);

    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(cmsAuth.resetEmail).toHaveBeenCalledOnce());
    expect(cmsAuth.resetEmail).toHaveBeenCalledWith('shihabshajib01@gmail.com', {
      redirectTo: expect.stringContaining('/administration/content-management?cmsRecovery=1'),
    });
    expect(screen.getByRole('status')).toHaveTextContent('Check inbox');
    expect(mocks.navigate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('keeps all non-CMS sign-in screens unchanged', () => {
    render(<LoginForm isDesktop />);
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows actionable errors when reset email cannot be sent without changing Office access', async () => {
    const user = userEvent.setup();
    mocks.pathname = '/administration/content-management';
    cmsAuth.resetEmail.mockResolvedValue({ error: new Error('email delivery unavailable') });
    cmsAuth.getClient.mockReturnValue({ auth: { resetPasswordForEmail: cmsAuth.resetEmail } });
    render(<LoginForm isDesktop />);
    await user.click(screen.getByRole('button', { name: 'Forgot password?' }));
    await user.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('email delivery unavailable');
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeEnabled();
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
  });

  it('validates an email recovery session and updates only the existing account password', async () => {
    const user = userEvent.setup();
    mocks.pathname = '/administration/content-management';
    mocks.search = '?cmsRecovery=1';
    cmsAuth.getUser.mockResolvedValue({
      data: { user: { email: 'shihabshajib01@gmail.com' } }, error: null,
    });
    cmsAuth.updatePassword.mockResolvedValue({ error: null });
    cmsAuth.signOut.mockResolvedValue({ error: null });
    cmsAuth.getClient.mockReturnValue({ auth: {
      getUser: cmsAuth.getUser, updateUser: cmsAuth.updatePassword, signOut: cmsAuth.signOut,
    } });
    render(<LoginForm isDesktop />);
    await screen.findByLabelText('New password');
    await user.type(screen.getByLabelText('New password'), 'an-excellent-new-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'an-excellent-new-password');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => expect(cmsAuth.updatePassword).toHaveBeenCalledWith({
      password: 'an-excellent-new-password',
    }));
    expect(cmsAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(screen.getByRole('status')).toHaveTextContent('Your password has been changed');
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(mocks.navigate).toHaveBeenCalledWith('/administration/content-management', { replace: true });
  });

  it('refuses expired recovery links and mismatched passwords without changing account credentials', async () => {
    const user = userEvent.setup();
    mocks.pathname = '/administration/content-management';
    mocks.search = '?cmsRecovery=1';
    cmsAuth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    cmsAuth.getClient.mockReturnValue({ auth: {
      getUser: cmsAuth.getUser, updateUser: cmsAuth.updatePassword,
    } });
    const result = render(<LoginForm isDesktop />);
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or expired');
    expect(cmsAuth.updatePassword).not.toHaveBeenCalled();
    result.unmount();

    cmsAuth.getUser.mockResolvedValue({ data: { user: { email: 'shihabshajib01@gmail.com' } }, error: null });
    render(<LoginForm isDesktop />);
    await screen.findByLabelText('New password');
    await user.type(screen.getByLabelText('New password'), 'long-valid-password');
    await user.type(screen.getByLabelText('Confirm new password'), 'different-password');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('do not match');
    expect(cmsAuth.updatePassword).not.toHaveBeenCalled();
  });

  it('allows the new Office Supabase email to sign in and publish without typing admin', async () => {
    mocks.pathname = '/administration/content-management';
    const user = userEvent.setup();
    cmsAuth.signIn.mockResolvedValue({ data: { session: { user: { id: 'new-office-user' } } }, error: null });
    cmsAuth.hasVerified.mockResolvedValue(true);
    cmsAuth.getClient.mockReturnValue({ auth: { signInWithPassword: cmsAuth.signIn } });
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: 'User ID or Office email' }), 'SHIHABSHAJIB01@GMAIL.COM');
    await user.type(screen.getByLabelText('Password'), 'registered-office-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mocks.onOfficeEnter).toHaveBeenCalledOnce());
    expect(cmsAuth.signIn).toHaveBeenCalledWith({
      email: 'shihabshajib01@gmail.com', password: 'registered-office-password',
    });
    expect(cmsAuth.hasVerified).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/administration/content-management');
  });

  it('rejects unknown email and wrong Office password without entering the workspace', async () => {
    mocks.pathname = '/administration/content-management';
    const user = userEvent.setup();
    cmsAuth.signIn.mockResolvedValue({ data: { session: null }, error: new Error('Invalid login credentials') });
    cmsAuth.getClient.mockReturnValue({ auth: { signInWithPassword: cmsAuth.signIn } });
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    const id = screen.getByRole('textbox', { name: 'User ID or Office email' });
    await user.type(id, 'other@example.com');
    await user.type(screen.getByLabelText('Password'), 'some-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter admin to open the Office prototype.')).toBeInTheDocument();
    expect(cmsAuth.signIn).not.toHaveBeenCalled();
    await user.clear(id);
    await user.type(id, 'shihabshajib01@gmail.com');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Office sign-in failed');
    expect(cmsAuth.signIn).toHaveBeenCalledOnce();
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
  });

  it('offers the standard accessible password visibility toggle and never changes the password value', async () => {
    const user = userEvent.setup();
    render(<LoginForm isDesktop />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    await user.type(input, 'office-secret-password');
    expect(input.type).toBe('password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input.type).toBe('text');
    expect(input.value).toBe('office-secret-password');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input.type).toBe('password');
    expect(input.value).toBe('office-secret-password');
  });

  it('passes Remember me only for authenticated Office sessions, not password-free preview', async () => {
    const user = userEvent.setup();
    cmsAuth.signIn.mockResolvedValue({ data: { session: { user: { id: 'new-office-user' } } }, error: null });
    cmsAuth.hasVerified.mockResolvedValue(true);
    cmsAuth.getClient.mockReturnValue({ auth: { signInWithPassword: cmsAuth.signIn } });
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: /^User ID/ }), 'admin');
    await user.click(screen.getByRole('checkbox', { name: 'Remember me' }));
    expect(screen.getByRole('checkbox', { name: 'Remember me' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.onOfficeEnter).toHaveBeenCalledWith(false);
    expect(cmsAuth.setRemember).not.toHaveBeenCalled();
    mocks.onOfficeEnter.mockClear();
    await user.type(screen.getByLabelText('Password'), 'valid-office-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mocks.onOfficeEnter).toHaveBeenCalledWith(true));
    expect(cmsAuth.setRemember).toHaveBeenCalledWith(true);
    expect(cmsAuth.signIn).toHaveBeenCalledOnce();
  });

  it('does not expose Remember me on shared Audit officer sign-in', () => {
    shared.enabled = true;
    render(<LoginForm isDesktop />);
    expect(screen.queryByRole('checkbox', { name: 'Remember me' })).not.toBeInTheDocument();
  });

});
