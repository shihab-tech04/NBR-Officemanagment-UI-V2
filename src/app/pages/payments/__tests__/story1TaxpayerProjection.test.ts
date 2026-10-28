import { describe, expect, it } from 'vitest';
import { toStoryPaymentRow, toStoryTaxpayerPaymentRow } from '../story1PaymentPresentation';
import type { StoryPayment } from '../story1OfficeApi';

const batch: StoryPayment = {
  id: 'batch-1', service: 'OTHER_TAX_PAYMENT', amountMinor: 5000,
  status: 'SIMULATED_SUCCESS', createdAt: '2026-10-28T12:00:00Z',
  details: { payerId: 'user1', lines: [
    { beneficiary: 'user2', category: 'TAX_WITH_RETURN', assessmentYear: '2026-27', amountMinor: 3500, authorizationId: 'consent-2' },
    { beneficiary: 'user1', category: 'ADVANCE_TAX', assessmentYear: '2025-26', amountMinor: 1500 },
  ] },
};

describe('Taxpayer 360 beneficiary projection', () => {
  it('uses only the selected taxpayer’s amount, year and allocation details', () => {
    const first = toStoryTaxpayerPaymentRow(batch, '1111111111111');
    const second = toStoryTaxpayerPaymentRow(batch, '2222222222222');
    expect(first).toMatchObject({ tin: '1111111111111', amount: '৳15', assessment_year: '2025-26' });
    expect(second).toMatchObject({ tin: '2222222222222', amount: '৳35', assessment_year: '2026-27' });
    expect(String(second?.payment_lines)).toContain('user2');
    expect(String(second?.payment_lines)).not.toContain('user1');
    expect(toStoryTaxpayerPaymentRow(batch, '3333333333333')).toBeNull();
  });

  it('applies the selected year to the selected taxpayer, not the parent batch', () => {
    expect(toStoryTaxpayerPaymentRow(batch, '2222222222222', '2025-26')).toBeNull();
    expect(toStoryTaxpayerPaymentRow(batch, '2222222222222', '2026-27')?.amount).toBe('৳35');
    const twoYears: StoryPayment = { ...batch, amountMinor: 5000, details: { payerId: 'user1', lines: [
      { beneficiary: 'user2', category: 'ADVANCE_TAX', assessmentYear: '2025-26', amountMinor: 1500 },
      { beneficiary: 'user2', category: 'TAX_WITH_RETURN', assessmentYear: '2026-27', amountMinor: 3500 },
    ] } };
    expect(toStoryTaxpayerPaymentRow(twoYears, '2222222222222', '2025-26')?.amount).toBe('৳15');
    expect(toStoryTaxpayerPaymentRow(twoYears, '2222222222222')?.amount).toBe('৳50');
  });

  it('projects the separate TIN/head allocation shape without another beneficiary’s values', () => {
    const payment: StoryPayment = { ...batch, amountMinor: 5000, details: {
      taxpayerTin: '123456789012', assessmentYear: '2026-27',
      lines: [{ headId: 122, headNameEn: 'Advance tax', economicCode: '68A' }],
      allocations: [
        { taxpayerTin: '123456789012', headId: 122, assessmentYear: '2026-27', amountMinor: 1500 },
        { taxpayerTin: '234567890123', headId: 122, assessmentYear: '2025-26', amountMinor: 3500 },
      ],
    } };
    const row = toStoryTaxpayerPaymentRow(payment, '234567890123');
    expect(row).toMatchObject({ tin: '234567890123', amount: '৳35', assessment_year: '2025-26', head_1_name: 'Advance tax', head_1_total: '৳35' });
    expect(JSON.stringify(row)).not.toContain('123456789012');
    expect(toStoryPaymentRow(payment).tin).toBe('123456789012, 234567890123');
  });

  it('does not display unreconciled, malformed or ambiguous allocation data', () => {
    expect(toStoryTaxpayerPaymentRow({ ...batch, amountMinor: 5001 }, '2222222222222')).toBeNull();
    expect(toStoryTaxpayerPaymentRow({ ...batch, details: { ...batch.details, lines: [
      { beneficiary: 'user2', assessmentYear: '2026-27', amountMinor: 5000.5 },
    ] } }, '2222222222222')).toBeNull();
    expect(toStoryTaxpayerPaymentRow({ ...batch, details: { ...batch.details, allocations: [
      { taxpayerTin: '2222222222222', headId: 122, assessmentYear: '2026-27', amountMinor: 5000 },
    ] } }, '2222222222222')).toBeNull();
    expect(toStoryTaxpayerPaymentRow({ ...batch, details: { ...batch.details, lines: [null] } } as unknown as StoryPayment, '2222222222222')).toBeNull();
  });

  it('retains single-taxpayer records and their actual payment status', () => {
    const single: StoryPayment = { ...batch, amountMinor: 120050, status: 'PENDING',
      details: { taxpayerTin: '123456789012', assessmentYear: '2026-27' } };
    expect(toStoryTaxpayerPaymentRow(single, '123456789012')).toMatchObject({ amount: '৳1,200.5', financial_receipt_status: 'PENDING' });
    expect(toStoryTaxpayerPaymentRow(single, '123456789012', '2025-26')).toBeNull();
  });

  it('formats the exact integer-paisa amount even at the safe-integer boundary', () => {
    const single: StoryPayment = { ...batch, amountMinor: Number.MAX_SAFE_INTEGER,
      details: { taxpayerTin: '123456789012', assessmentYear: '2026-27', lines: [{ headId: 122 }],
        allocations: [{ taxpayerTin: '123456789012', headId: 122, assessmentYear: '2026-27', amountMinor: Number.MAX_SAFE_INTEGER }] } };
    const row = toStoryTaxpayerPaymentRow(single, '123456789012');
    expect(row?.amount).toBe('৳90,071,992,547,409.91');
    expect(row?.head_1_total).toBe('৳90,071,992,547,409.91');
  });
});
