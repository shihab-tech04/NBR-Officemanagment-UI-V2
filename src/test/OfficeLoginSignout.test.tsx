import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LoginForm } from '../app/components/auth/LoginForm';
import { UserProfileDropdown } from '../app/components/dropdowns/UserProfileDropdown';
import { OFFICE_AUTH_CALLBACK_URL } from '../app/utils/officeAuthRedirect';

const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  getOfficeReviewClient: vi.fn(),
  dispatch: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../app/pages/payments/OfficeReviewQueue', () => ({ getOfficeReviewClient: auth.getOfficeReviewClient }));
vi.mock('react-redux', () => ({ useDispatch: () => auth.dispatch }));
vi.mock('react-router', () => ({ useNavigate: () => auth.navigate }));
vi.mock('../app/context/HelpContext', () => ({ useHelp: () => ({ openHelp: vi.fn() }) }));
vi.mock('../app/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({
  shortName: 'OA', name: 'Office Admin', designation: 'Admin', email: 'admin@example.test',
  employeeId: '1', zone: 'Dhaka', circle: '1',
}) }));
vi.mock('../app/hooks/useUI', () => ({ useUIState: () => ({ isDesktop: true }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: (key: string) => key,
}) }));

describe('Office entry and exit reach authenticated boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getOfficeReviewClient.mockReturnValue({ auth: { signInWithOtp: auth.signInWithOtp } });
    auth.signInWithOtp.mockResolvedValue({ error: null });
  });
  afterEach(() => cleanup());

  it('allows an existing officer to request a magic link from the public login, without creating users', async () => {
    render(<LoginForm isDesktop onForgotPassword={() => {}} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'login.officerEmail' }), { target: { value: 'OFFICER@EXAMPLE.COM' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.signIn' }));
    await waitFor(() => expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'officer@example.com',
      options: { shouldCreateUser: false, emailRedirectTo: OFFICE_AUTH_CALLBACK_URL },
    }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('login.officerSignInLinkSent'));
    expect(auth.dispatch).toHaveBeenCalledOnce();
    expect(auth.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'auth/logout' }));
    expect(auth.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'auth/login' }));
    expect(auth.navigate).not.toHaveBeenCalled();
  });

  it('shows a generic provider error and does not claim to have signed in', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: new Error('Email delivery unavailable') });
    render(<LoginForm isDesktop onForgotPassword={() => {}} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'login.officerEmail' }), { target: { value: 'officer@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'login.signIn' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('login.officerSignInUnavailable'));
    expect(screen.getByRole('alert')).not.toHaveTextContent('Email delivery unavailable');
    expect(auth.navigate).not.toHaveBeenCalled();
  });

  it('delegates account-menu sign-out to the shell confirmation and real session revocation', () => {
    const onSignOut = vi.fn();
    const onClose = vi.fn();
    render(<UserProfileDropdown onClose={onClose} onSignOut={onSignOut} />);
    fireEvent.click(screen.getByRole('button', { name: 'signOut' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(auth.dispatch).not.toHaveBeenCalled();
  });
});
