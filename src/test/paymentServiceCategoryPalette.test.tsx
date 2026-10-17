import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaymentCategoryTag } from '../app/pages/payments/PaymentCategoryTag';

describe('Shared TaxPay service category colors', () => {
  it('identifies coded and human-readable categories without changing labels', () => {
    render(<PaymentCategoryTag value="ASSESSED_DEMAND, Advance Tax" />);
    expect(screen.getByText('ASSESSED_DEMAND')).toHaveAttribute('data-payment-service', 'ASSESSED_DEMAND');
    expect(screen.getByText('Advance Tax')).toHaveAttribute('data-payment-service', 'ADVANCE_TAX');
  });

  it('does not assign a service identity to unrelated or unknown categories', () => {
    render(<PaymentCategoryTag value="Risk Audit" />);
    expect(screen.getByText('Risk Audit')).not.toHaveAttribute('data-payment-service');
  });

  it('maps all eight payment services', () => {
    const codes = [
      'TAX_WITH_RETURN', 'ADVANCE_TAX', 'ASSESSED_DEMAND', 'PENALTY',
      'SOURCE_TAX_DEPOSIT', 'APPELLATE_TRIBUNAL', 'OTHER_TAX_PAYMENT', 'TRAVEL_TAX',
    ];
    render(<PaymentCategoryTag value={codes.join(', ')} />);
    codes.forEach(code => expect(screen.getByText(code)).toHaveAttribute('data-payment-service', code));
  });
});
