import { describe, it, expect } from 'vitest';
import type { StoryPayment } from '../story1OfficeApi';
import { getOfficePaymentItems, officeMoney, officeReceiptHtml } from '../officeTransactionDetails';

const transaction: StoryPayment = {
  id: 'e4e43b06-0be4-4cfe-96eb-b75b7176d86e', service: 'OTHER_TAX_PAYMENT',
  amountMinor: 17375, status: 'SIMULATED_SUCCESS', createdAt: '2026-10-29T05:48:25Z',
  details: { payerId: 'user6', lines: [
    { beneficiary: 'user6', category: 'TAX_WITH_RETURN', assessmentYear: '2026-27', amountMinor: 15025 },
    { beneficiary: 'user7', category: 'PENALTY', assessmentYear: '2025-26', amountMinor: 2350 },
  ] },
};

describe('Office-native transaction record and receipt', () => {
  it('formats readable, exact beneficiary allocations instead of raw JSON', () => {
    const items = getOfficePaymentItems(transaction);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ taxpayer: 'user6', service: 'Tax with Return', assessmentYear: '2026-27', amountMinor: 15025 });
    expect(items[1]).toMatchObject({ taxpayer: 'user7', service: 'Penalty Payment', assessmentYear: '2025-26', amountMinor: 2350 });
    expect(officeMoney(items[0].amountMinor)).toBe('৳150.25');
    expect(officeMoney(17375)).toBe('৳173.75');
  });

  it('never attributes unreconciled amounts or mixed beneficiary formats', () => {
    expect(getOfficePaymentItems({ ...transaction, amountMinor: 17376 })).toEqual([]);
    expect(getOfficePaymentItems({ ...transaction, details: { ...transaction.details,
      allocations: [{ taxpayerTin: '6666666666666', headId: 121, assessmentYear: '2026-27', amountMinor: 17375 }] } })).toEqual([]);
  });

  it('renders explicit reconciled TIN/head allocations with the matching head label', () => {
    const record: StoryPayment = { ...transaction, amountMinor: 5000, details: {
      lines: [{ headId: 122, headNameEn: 'Advance Tax', economicCode: '68A' }],
      allocations: [
        { taxpayerTin: '123456789012', headId: 122, amountMinor: 1500, assessmentYear: '2026-27' },
        { taxpayerTin: '234567890123', headId: 122, amountMinor: 3500, assessmentYear: '2025-26' },
      ],
    } };
    expect(getOfficePaymentItems(record)).toMatchObject([
      { taxpayer: 'TIN 123456789012', service: 'Advance Tax', amountMinor: 1500, economicCode: '68A' },
      { taxpayer: 'TIN 234567890123', service: 'Advance Tax', amountMinor: 3500 },
    ]);
  });

  it('generates a downloadable OFFICE document with escaped record data', () => {
    const info = {
      reference: transaction.id, date: '29 Oct 2026', payer: '<script>alert(1)</script>',
      taxpayer: 'user6, user7', service: 'Tax with Return, Penalty Payment',
      year: '2026-27, 2025-26', amount: '৳173.75',
      paymentStatus: 'Payment record saved', creditStatus: 'Tax credit not verified', method: 'Payment',
    };
    const html = officeReceiptHtml(info, getOfficePaymentItems(transaction));
    expect(html).toContain('NBR Office Management');
    expect(html).toContain('Payment receipt');
    expect(html).toContain('user7');
    expect(html).toContain('৳150.25');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('View certificate');
    expect(html).not.toContain('nbr-taxpay');
  });
});
