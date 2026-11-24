import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OfficeTransactionDrawer } from '../OfficeTransactionDrawer';

const { loadRemarks } = vi.hoisted(() => ({ loadRemarks: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en' } }),
}));

vi.mock('../../../components/drawers/DynamicDetailsDrawer', () => ({
  DynamicDetailsDrawer: ({ open, rowData, columns, renderValue }: any) => {
    if (!open || !rowData) return null;
    const remarksColumn = columns.find((column: any) => column.key === 'challan_remarks');
    return <div className="dynamic-drawer" data-testid="office-details-drawer">
      {remarksColumn && renderValue?.(remarksColumn.key, rowData[remarksColumn.key])}
    </div>;
  },
}));

vi.mock('../OfficeReceiptModal', () => ({ OfficeReceiptModal: () => null }));

vi.mock('../officeTransactionDetails', () => ({
  getOfficePaymentItems: () => [],
  officeMoney: () => '৳50.00',
  parseOfficeMoneyMinor: () => 5000,
}));

vi.mock('../officeChallanRemarks', () => ({
  loadGuardedOfficeChallanRemarks: (paymentId: string) => loadRemarks(paymentId),
  officeChallanRemarksRowValue: (text: string | null, fallback: string) => text ?? fallback,
  supportsOfficeChallanRemarks: (service: unknown) => service === 'OTHER_TAX_PAYMENT',
}));

describe('F-178 Office remarks retry', () => {
  const paymentId = 'e4e43b06-0be4-4cfe-96eb-b75b7176d86e';
  const remarks = 'বাংলা লাইন\nExact English line';

  beforeEach(() => {
    loadRemarks.mockReset();
  });

  it('issues a fresh guarded read after an authorized remarks read error', async () => {
    loadRemarks
      .mockRejectedValueOnce(new Error('Temporary Office SQL read outage'))
      .mockResolvedValueOnce(remarks);
    const row = {
      payment_ref: paymentId, amount: '50.00', date: '2026-11-21',
      payer_name: 'Taxpayer', taxpayer_name: 'Taxpayer',
      payment_type: 'Other Tax', assessment_year: '2025-26',
    };
    const source = {
      id: paymentId, service: 'OTHER_TAX_PAYMENT', createdAt: '2026-11-21T00:00:00Z',
      status: 'SIMULATED_SUCCESS', details: {},
    };

    render(<OfficeTransactionDrawer row={row as any} source={source as any} onClose={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Authorized Office remarks read unavailable');
    expect(loadRemarks).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(loadRemarks).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.getByTestId('office-guarded-challan-remarks').textContent).toBe(remarks);
    });
    expect(loadRemarks).toHaveBeenNthCalledWith(1, paymentId);
    expect(loadRemarks).toHaveBeenNthCalledWith(2, paymentId);
  });
});
