import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';
import { OFFICE_AUTH_CALLBACK_URL } from '../../utils/officeAuthRedirect';

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  dispatch: vi.fn(),
  navigate: vi.fn(),
  openHelp: vi.fn()
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
      'login.officerEmail': 'Officer email',
      'login.officerEmailPlaceholder': 'Enter your registered officer email',
      'login.officerEmailHint': 'A secure sign-in link will be sent to your registered officer email.',
      'login.localPreviewHint': 'Development preview IDs: admin and user1–user10. Live access uses your officer email.',
      'login.officerEmailInvalid': 'Enter a valid officer email address.',
      'login.officerSignInUnavailable': 'Secure sign-in could not be started. Check your email and try again.',
      'login.officerSignInLinkSent': 'Check your email for a secure sign-in link. Only active officers can open the workspace.',
      'login.sendingSignInLink': 'Sending sign-in link...',
      'login.signIn': 'Sign in',
      'login.needHelp': 'Need help? Contact your system administrator.',
      'specialReg.helper': 'NRB registration support.',
      'specialReg.button': 'Special registration'
    } as Record<string, string>)[key] || key
  })
}));
vi.mock('../../context/HelpContext', () => ({ useHelp: () => ({ openHelp: mocks.openHelp }) }));
vi.mock('../../pages/payments/OfficeReviewQueue', () => ({
  getOfficeReviewClient: () => ({ auth: { signInWithOtp: mocks.signInWithOtp } })
}));

describe('officer sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    window.localStorage.clear();
  });

  it('requests a non-enumerating sign-in link for the configured officer callback', async () => {
    const user = userEvent.setup();
    render(<LoginForm isDesktop onForgotPassword={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: 'Officer email' }), '  Officer@Example.org ');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: 'officer@example.org',
      options: { emailRedirectTo: OFFICE_AUTH_CALLBACK_URL, shouldCreateUser: false }
    }));
    expect(screen.getByRole('status')).toHaveTextContent('Only active officers can open the workspace.');
  });

  it('rejects preview IDs from the live auth request and reports invalid input', async () => {
    const user = userEvent.setup();
    render(<LoginForm isDesktop onForgotPassword={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: 'Officer email' }), 'user11');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid officer email address.');
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it('keeps the account-existence response generic when Auth returns an error', async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: new Error('user not found') });
    const user = userEvent.setup();
    render(<LoginForm isDesktop onForgotPassword={vi.fn()} />);
    await user.type(screen.getByRole('textbox', { name: 'Officer email' }), 'unknown@example.org');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Secure sign-in could not be started.'));
    expect(screen.getByRole('alert')).not.toHaveTextContent('user not found');
  });
});
