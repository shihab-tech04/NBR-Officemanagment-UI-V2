import { describe, it, expect } from 'vitest';
import type { StoryPayment } from '../story1OfficeApi';
import { getOfficePaymentItems, officeMoney } from '../officeTransactionDetails';
import { buildDisplayedOfficeReceiptDocument } from '../OfficeReceiptModal';

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

  it('exports exactly the visible shared-modal receipt paper, not a duplicate receipt template', () => {
    const paper = document.createElement('article');
    paper.className = 'office-receipt__paper';
    paper.setAttribute('lang', 'en');
    paper.textContent = 'user6, user7 · Tax with Return · ৳173.75 <script>alert(1)</script>';
    const html = buildDisplayedOfficeReceiptDocument(paper, 'Office payment receipt');
    expect(html).toContain(paper.outerHTML);
    expect(html).toContain('office-receipt__paper');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('nbr-taxpay');
  });
});
