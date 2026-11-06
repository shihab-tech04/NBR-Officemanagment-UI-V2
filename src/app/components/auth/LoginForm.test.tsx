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
const cmsAuth = vi.hoisted(() => ({
  getClient: vi.fn(),
  signOut: vi.fn(),
  signIn: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  hasVerified: vi.fn(),
}));
vi.mock('../../services/taxpayCmsClient', () => ({
  getTaxPayCmsClient: cmsAuth.getClient,
  hasVerifiedCmsPublisherSession: (...args: unknown[]) => cmsAuth.hasVerified(...args),
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
  beforeEach(() => {
    vi.clearAllMocks();
    shared.enabled = false;
    cmsAuth.getClient.mockReturnValue(null);
    cmsAuth.hasVerified.mockResolvedValue(false);
  });

  it('uses the existing Office sign-in to authorize publishing without another login', async () => {
    const user = userEvent.setup();
    cmsAuth.signIn.mockResolvedValue({ data: { session: { user: { id: 'publisher' } } }, error: null });
    cmsAuth.hasVerified.mockResolvedValue(true);
    cmsAuth.getClient.mockReturnValue({ auth: { signInWithPassword: cmsAuth.signIn } });
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), 'admin');
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
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), 'admin');
    await user.type(screen.getByLabelText('Password'), 'anything');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('service is unavailable');
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('rejects a password-free admin marker and unrelated Office identifiers', async () => {
    const user = userEvent.setup();
    cmsAuth.getClient.mockReturnValue({ auth: { signInWithPassword: cmsAuth.signIn } });
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), 'officer');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
    expect(screen.getByText('Enter admin to open the Office prototype.')).toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: 'User ID' }));
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), ' admin ');
    await user.clear(screen.getByLabelText('Password'));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your authorized Office password');
    expect(cmsAuth.signIn).not.toHaveBeenCalled();
    expect(mocks.onOfficeEnter).not.toHaveBeenCalled();
  });

  it('confirms the existing Office publisher once before entering the workspace', async () => {
    const user = userEvent.setup();
    cmsAuth.signIn.mockResolvedValue({ error: null, data: { session: { user: { id: 'sql-office-admin' } } } });
    cmsAuth.hasVerified.mockResolvedValue(true);
    cmsAuth.getClient.mockReturnValue({ auth: { signInWithPassword: cmsAuth.signIn } });
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), 'admin');
    await user.type(screen.getByLabelText('Password'), 'verified-publishing-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mocks.onOfficeEnter).toHaveBeenCalledOnce());
    expect(cmsAuth.signIn).toHaveBeenCalledWith({
      email: 'shihabshajib01@gmail.com', password: 'verified-publishing-password',
    });
    expect(cmsAuth.hasVerified).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith('/dashboard/dashboard-main');
  });

  it('reuses a verified returning publisher session without demanding another password', async () => {
    const user = userEvent.setup();
    cmsAuth.hasVerified.mockResolvedValue(true);
    cmsAuth.getClient.mockReturnValue({ auth: { signInWithPassword: cmsAuth.signIn } });
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), 'admin');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(mocks.onOfficeEnter).toHaveBeenCalledOnce());
    expect(cmsAuth.hasVerified).toHaveBeenCalledOnce();
    expect(cmsAuth.signIn).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith('/dashboard/dashboard-main');
  });

  it('does not turn an invalid CMS password into SQL publishing authority', async () => {
    const user = userEvent.setup();
    cmsAuth.signOut.mockResolvedValue({ error: null });
    cmsAuth.signIn.mockResolvedValue({ error: new Error('invalid credentials'), data: { session: null } });
    cmsAuth.getClient.mockReturnValue({ auth: {
      signOut: cmsAuth.signOut, signInWithPassword: cmsAuth.signIn,
    } });
    render(<LoginForm isDesktop onOfficeEnter={mocks.onOfficeEnter} />);
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), 'admin');
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
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), 'admin');
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
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), 'admin');
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
    await user.type(screen.getByRole('textbox', { name: 'User ID' }), 'admin');
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
});
