import { describe, expect, it } from 'vitest';
import { buildOfficeBeneficiaryDirectoryRows } from '../officeBeneficiaryDirectory';
import type { StoryPayment } from '../story1OfficeApi';

const payment: StoryPayment = {
  id: 'eae7a3e9-8b6b-423d-9618-3cc8f1f14401',
  service: 'OTHER_TAX_PAYMENT',
  amountMinor: 5000,
  status: 'SIMULATED_SUCCESS',
  createdAt: '2026-11-21T05:00:00Z',
  details: {
    payerName: 'Payer',
    batchId: '0bca2394-3b29-4a52-987c-633a8620aa11',
    batchItemIndex: 1,
    batchItemCount: 2,
    lines: [
      { headId: 68, headNameEn: 'Income tax', economicCode: '1-1141-0000-0101' },
      { headId: 69, headNameEn: 'Advance tax', economicCode: '1-1141-0000-0102' },
    ],
    allocations: [
      { taxpayerTin: '001234567890', taxpayerName: 'Beneficiary A', headId: 68,
        assessmentYear: '2026-27', amountMinor: 1500 },
      { taxpayerTin: '009876543210', taxpayerName: 'Beneficiary B', headId: 69,
        assessmentYear: '2025-26', amountMinor: 3500 },
    ],
  },
};

describe('Office payment-linked taxpayer directory', () => {
  it('projects only the SQL-reconciled payment allocations with their source details', () => {
    expect(buildOfficeBeneficiaryDirectoryRows([payment])).toEqual([
      {
        id: payment.id + ':0',
        taxpayerTin: '001234567890',
        taxpayerName: 'Beneficiary A',
        allocation: 'Income tax · 1-1141-0000-0101',
        assessmentYear: '2026-27',
        amountMinor: 1500,
        paymentDate: payment.createdAt,
      },
      {
        id: payment.id + ':1',
        taxpayerTin: '009876543210',
        taxpayerName: 'Beneficiary B',
        allocation: 'Advance tax · 1-1141-0000-0102',
        assessmentYear: '2025-26',
        amountMinor: 3500,
        paymentDate: payment.createdAt,
      },
    ]);
  });

  it('fails closed for unsuccessful, unreconciled, or invalid-TIN source records', () => {
    const unsuccessful = { ...payment, status: 'SIMULATED_FAILED' };
    const mismatched = { ...payment, amountMinor: 5001 };
    const invalidTin: StoryPayment = {
      ...payment,
      details: {
        ...payment.details,
        allocations: payment.details?.allocations?.map((allocation, index) => ({
          ...allocation,
          taxpayerTin: index === 0 ? 'not-a-tin' : allocation.taxpayerTin,
        })),
      },
    };
    expect(buildOfficeBeneficiaryDirectoryRows([unsuccessful, mismatched, invalidTin])).toEqual([]);
  });

  it('does not create a directory entry for a payment without a taxpayer allocation TIN', () => {
    const travelPassenger: StoryPayment = {
      ...payment,
      id: 'travel-payment',
      service: 'TRAVEL_TAX',
      amountMinor: 1000,
      details: { passengers: [{ passengerName: 'Passenger', amountMinor: 1000 }] },
    };
    expect(buildOfficeBeneficiaryDirectoryRows([travelPassenger])).toEqual([]);
  });
});
