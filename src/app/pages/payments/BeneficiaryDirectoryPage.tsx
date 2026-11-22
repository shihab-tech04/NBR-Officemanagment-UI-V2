import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getOfficeCmsAuthClient } from '../../services/officeCmsBridge';
import { getStoryPayments } from './story1OfficeApi';
import { officeMoney } from './officeTransactionDetails';
import {
  buildOfficeBeneficiaryDirectoryRows,
  type OfficeBeneficiaryDirectoryRow,
} from './officeBeneficiaryDirectory';

interface Snapshot {
  rows: OfficeBeneficiaryDirectoryRow[];
}

async function readSnapshot(): Promise<Snapshot> {
  const payments = await getStoryPayments();
  return { rows: buildOfficeBeneficiaryDirectoryRows(payments) };
}

function formatPaymentDate(value: string, language: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '—';
  return new Intl.DateTimeFormat(language.startsWith('bn') ? 'bn-BD' : 'en-BD', {
    dateStyle: 'medium',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(timestamp));
}

export function BeneficiaryDirectoryPage() {
  const { i18n } = useTranslation();
  const bn = i18n.resolvedLanguage?.startsWith('bn') ?? false;
  const tr = (en: string, bnText: string) => bn ? bnText : en;
  const [snapshot, setSnapshot] = useState<Snapshot>({ rows: [] });
  const [accountId, setAccountId] = useState<string | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signInBusy, setSignInBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const sessionRevision = useRef(0);
  const currentUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const client = getOfficeCmsAuthClient();
    const listener = client.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const user = session?.user;
      const nextId = user && !user.is_anonymous ? user.id : null;
      if (currentUserId.current !== nextId) {
        currentUserId.current = nextId;
        sessionRevision.current++;
        setAccountId(nextId);
        setSnapshot({ rows: [] });
        setError('');
        setLoading(false);
      }
      setAccountLoading(false);
    });
    const revision = sessionRevision.current;
    void client.auth.getUser().then(({ data, error: userError }) => {
      if (!active || revision !== sessionRevision.current) return;
      const user = userError ? null : data.user;
      const nextId = user && !user.is_anonymous ? user.id : null;
      currentUserId.current = nextId;
      setAccountId(nextId);
      setAccountLoading(false);
    }).catch(() => {
      if (active && revision === sessionRevision.current) setAccountLoading(false);
    });
    return () => {
      active = false;
      listener.data.subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    const revision = sessionRevision.current;
    setLoading(true);
    setError('');
    try {
      const loaded = await readSnapshot();
      if (revision === sessionRevision.current) setSnapshot(loaded);
    } catch (cause) {
      if (revision === sessionRevision.current) {
        setSnapshot({ rows: [] });
        setError(cause instanceof Error ? cause.message : 'Could not load payment-linked allocations.');
      }
    } finally {
      if (revision === sessionRevision.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accountLoading || !accountId) return;
    void refresh();
    const focus = () => {
      if (document.visibilityState !== 'hidden') void refresh();
    };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [accountId, accountLoading, refresh]);

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setSignInBusy(true);
    setAuthMessage('');
    try {
      const { error: signInError } = await getOfficeCmsAuthClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setPassword('');
      if (signInError) setAuthMessage(tr(
        'Sign-in failed. Check your email and password.',
        'সাইন ইন ব্যর্থ হয়েছে। ইমেইল ও পাসওয়ার্ড যাচাই করুন।',
      ));
    } catch {
      setPassword('');
      setAuthMessage(tr(
        'Office sign-in is temporarily unavailable. Try again.',
        'অফিস সাইন ইন সাময়িকভাবে বন্ধ আছে। আবার চেষ্টা করুন।',
      ));
    } finally {
      setSignInBusy(false);
    }
  };

  const sendSignInLink = async () => {
    if (!email.trim()) return;
    setSignInBusy(true);
    setAuthMessage('');
    try {
      const callback = new URL(
        '/NBR-Officemanagment-UI-V2/payments/beneficiaries',
        window.location.origin,
      ).toString();
      const { error: sendError } = await getOfficeCmsAuthClient().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callback, shouldCreateUser: false },
      });
      setAuthMessage(sendError
        ? tr('Could not send the sign-in link. Try password sign-in.', 'সাইন ইন লিংক পাঠানো যায়নি। পাসওয়ার্ড ব্যবহার করুন।')
        : tr('Check your email for the Office sign-in link.', 'অফিস সাইন ইন লিংকের জন্য ইমেইল দেখুন।'));
    } catch {
      setAuthMessage(tr(
        'Could not send the sign-in link. Try password sign-in.',
        'সাইন ইন লিংক পাঠানো যায়নি। পাসওয়ার্ড ব্যবহার করুন।',
      ));
    } finally {
      setSignInBusy(false);
    }
  };

  const signOut = async () => {
    setAuthMessage('');
    try {
      const { error: signOutError } = await getOfficeCmsAuthClient().auth.signOut({ scope: 'local' });
      if (signOutError) {
        setAuthMessage(tr('Sign-out failed. Please try again.', 'সাইন আউট ব্যর্থ হয়েছে। আবার চেষ্টা করুন।'));
        return;
      }
      sessionRevision.current++;
      currentUserId.current = null;
      setAccountId(null);
      setSnapshot({ rows: [] });
      setError('');
    } catch {
      setAuthMessage(tr('Sign-out failed. Please try again.', 'সাইন আউট ব্যর্থ হয়েছে। আবার চেষ্টা করুন।'));
    }
  };

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return snapshot.rows;
    return snapshot.rows.filter(row => (
      row.taxpayerTin + ' ' + row.taxpayerName + ' ' + row.allocation + ' ' + row.assessmentYear
    ).toLocaleLowerCase().includes(term));
  }, [snapshot.rows, query]);

  return <section className="table-page space-y-4 p-4 sm:p-6" data-testid="office-beneficiary-directory">
    <header className="table-page__header flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="table-page__title">{tr('Payment-linked taxpayers', 'পেমেন্ট-সংযুক্ত করদাতা')}</h1>
        <p className="table-page__desc">{tr(
          'Authorized payment allocations · read only',
          'অনুমোদিত পেমেন্ট বরাদ্দ · শুধু দেখা যাবে',
        )}</p>
      </div>
      {accountId && <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="table-card__toolbar-btn" disabled={loading} onClick={() => void refresh()}>
          {tr('Refresh', 'রিফ্রেশ')}
        </button>
        <button type="button" className="table-card__toolbar-btn" onClick={() => void signOut()}>
          {tr('Sign out', 'সাইন আউট')}
        </button>
      </div>}
    </header>

    {accountLoading && <p role="status">{tr('Checking Office session…', 'অফিস সেশন যাচাই করা হচ্ছে…')}</p>}
    {!accountLoading && !accountId && <form onSubmit={event => void signIn(event)}
      className="max-w-lg space-y-3 rounded-lg border border-slate-200 bg-white p-4 sm:p-5"
      data-testid="office-beneficiary-admin-login">
      <p className="text-sm text-slate-700">{tr(
        'Sign in with an authorized Office officer account to view payment-linked allocations.',
        'পেমেন্ট-সংযুক্ত বরাদ্দ দেখতে অনুমোদিত অফিসার অ্যাকাউন্ট দিয়ে সাইন ইন করুন।',
      )}</p>
      <label className="block space-y-1">
        <span>{tr('Email address', 'ইমেইল ঠিকানা')}</span>
        <input className="w-full rounded-md border border-slate-300 p-3" type="email"
          autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} />
      </label>
      <label className="block space-y-1">
        <span>{tr('Password', 'পাসওয়ার্ড')}</span>
        <input className="w-full rounded-md border border-slate-300 p-3" type="password"
          autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="table-card__toolbar-btn"
          disabled={signInBusy || !email.trim() || !password}>
          {tr('Sign in', 'সাইন ইন')}
        </button>
        <button type="button" className="table-card__toolbar-btn"
          disabled={signInBusy || !email.trim()} onClick={() => void sendSignInLink()}>
          {tr('Email sign-in link', 'ইমেইলে সাইন ইন লিংক')}
        </button>
      </div>
    </form>}

    {authMessage && <p role="status" className="text-sm text-slate-700">{authMessage}</p>}
    {accountId && error && <div role="alert" className="rounded-lg border border-amber-300 p-4"><p>{error}</p></div>}
    {accountId && loading && <p role="status">{tr('Loading authorized payment allocations…', 'অনুমোদিত পেমেন্ট বরাদ্দ লোড হচ্ছে…')}</p>}
    {accountId && !loading && !error && <>
      <p role="status" className="table-page__desc">{snapshot.rows.length} {tr(
        'payment-linked allocation records',
        'টি পেমেন্ট-সংযুক্ত বরাদ্দ রেকর্ড',
      )}</p>
      <label className="block space-y-1">
        <span>{tr('Search', 'খুঁজুন')}</span>
        <input className="w-full max-w-lg rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
          type="search" value={query} onChange={event => setQuery(event.target.value)}
          placeholder={tr('Name, TIN, allocation or assessment year', 'নাম, টিআইএন, বরাদ্দ বা করবর্ষ')} />
      </label>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-slate-100"><tr>
            <th className="p-3">{tr('TIN', 'টিআইএন')}</th>
            <th className="p-3">{tr('Taxpayer name', 'করদাতার নাম')}</th>
            <th className="p-3">{tr('Allocation', 'বরাদ্দ')}</th>
            <th className="p-3">{tr('Assessment year', 'করবর্ষ')}</th>
            <th className="p-3">{tr('Amount', 'পরিমাণ')}</th>
            <th className="p-3">{tr('Payment date', 'পেমেন্টের তারিখ')}</th>
          </tr></thead>
          <tbody>{visible.map(row => <tr key={row.id} className="border-t border-slate-200">
            <td className="p-3 font-mono">{row.taxpayerTin}</td>
            <td className="p-3">{row.taxpayerName}</td>
            <td className="p-3">{row.allocation}</td>
            <td className="p-3">{row.assessmentYear}</td>
            <td className="p-3">{officeMoney(row.amountMinor, bn ? 'bn-BD' : 'en-BD')}</td>
            <td className="p-3">{formatPaymentDate(row.paymentDate, bn ? 'bn-BD' : 'en-BD')}</td>
          </tr>)}</tbody>
        </table>
        {visible.length === 0 && <p className="p-5 text-center text-slate-600">
          {tr(
            snapshot.rows.length ? 'No matching payment allocations' : 'No authorized payment-linked allocations',
            snapshot.rows.length ? 'কোনো মিল থাকা পেমেন্ট বরাদ্দ নেই' : 'অনুমোদিত পেমেন্ট-সংযুক্ত বরাদ্দ নেই',
          )}
        </p>}
      </div>
    </>}
  </section>;
}
