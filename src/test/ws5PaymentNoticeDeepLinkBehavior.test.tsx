import { Suspense } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import '../app/i18n/config';
import { PaymentRoute } from '../app/routes';
import { store } from '../app/store';

// Exercise the real combined WS3 payment screen, not source-string matching.
// Records are local fixtures only: do not treat them as issuer-backed payments.
const { recordedId, absentId } = vi.hoisted(() => ({
  recordedId: '4b94da20-7cce-4fd7-98bd-a1cbb86cb9d9',
  absentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
}));
vi.mock('../app/pages/payments/story1OfficeApi', () => ({
  getStoryPayments: async () => [{
    id: recordedId, service: 'TAX_WITH_RETURN', amountMinor: 12500,
    status: 'SIMULATED', createdAt: '2026-10-30T12:00:00.000Z',
  }],
  getStoryNotices: async () => [],
}));

function openDeepLink(paymentId: string) {
  const router = createMemoryRouter([
    { path: '/payments/transactions/record/:paymentId', Component: PaymentRoute },
    { path: '/payments/transactions', Component: PaymentRoute },
  ], { initialEntries: ['/payments/transactions/record/' + paymentId] });
  const view = render(
    <Provider store={store}>
      <Suspense fallback={<div role="status">Loading payment record</div>}>
        <RouterProvider router={router} />
      </Suspense>
    </Provider>,
  );
  return { router, close: () => { view.unmount(); router.dispose(); } };
}

describe('WS5 combined Office notification deep-link behavior', () => {
  it('fails closed for a well-formed but unavailable SQL payment ID', async () => {
    const view = openDeepLink(absentId);
    try {
      expect(await screen.findByTestId('payment-transactions')).toBeInTheDocument();
      expect(await screen.findByText(/The linked payment record is unavailable|বিজ্ঞপ্তির পেমেন্ট রেকর্ডটি উপলভ্য নয়/)).toBeVisible();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(view.router.state.location.pathname).toBe('/payments/transactions/record/' + absentId);
    } finally {
      view.close();
    }
  });

  it('returns to the existing transactions route when the linked receipt drawer is closed', async () => {
    const view = openDeepLink(recordedId);
    try {
      expect(await screen.findByTestId('payment-transactions')).toBeInTheDocument();
      const drawer = await screen.findByRole('dialog');
      expect(within(drawer).getByText(recordedId)).toBeVisible();
      fireEvent.click(within(drawer).getByRole('button', { name: /close drawer/i }));
      await waitFor(() => expect(view.router.state.location.pathname).toBe('/payments/transactions'));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    } finally {
      view.close();
    }
  });
});
