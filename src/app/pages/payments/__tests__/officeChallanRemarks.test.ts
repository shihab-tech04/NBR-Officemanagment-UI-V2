import { describe, expect, it } from 'vitest';
import { officeChallanRemarksRowValue, parseGuardedChallanRemarks, supportsOfficeChallanRemarks } from '../officeChallanRemarks';

const id = 'e4e43b06-0be4-4cfe-96eb-b75b7176d86e';

describe('F-178: immutable, officer-guarded Office remarks readback', () => {
  it('keeps the guarded remarks row visible for empty, absent and em-dash SQL values', () => {
    const placeholder = 'Office SQL remarks';
    expect(officeChallanRemarksRowValue(null, placeholder)).toBe(placeholder);
    expect(officeChallanRemarksRowValue('', placeholder)).toBe(placeholder);
    expect(officeChallanRemarksRowValue('—', placeholder)).toBe(placeholder);
    const exact = 'বাংলা remarks\nEnglish line';
    expect(officeChallanRemarksRowValue(exact, placeholder)).toBe(exact);
  });

  it('supports each non-Travel tax challan service and excludes Travel Tax', () => {
    for (const service of [
      'TAX_WITH_RETURN', 'ADVANCE_TAX', 'ASSESSED_DEMAND', 'PENALTY',
      'SOURCE_TAX_DEPOSIT', 'APPELLATE_TRIBUNAL', 'OTHER_TAX_PAYMENT',
    ]) expect(supportsOfficeChallanRemarks(service)).toBe(true);
    expect(supportsOfficeChallanRemarks('TRAVEL_TAX')).toBe(false);
    expect(supportsOfficeChallanRemarks('UNKNOWN')).toBe(false);
    expect(supportsOfficeChallanRemarks(null)).toBe(false);
  });

  it('preserves Unicode, long text and exact line breaks', () => {
    const value = 'বাংলা remarks\n' + '😀'.repeat(200) + '\nSecond line';
    expect(parseGuardedChallanRemarks({ paymentId: id, challanRemarks: value }, id)).toBe(value);
  });
  it('distinguishes an existing payment without remarks from missing/unauthorized readback', () => {
    expect(parseGuardedChallanRemarks({ paymentId: id, challanRemarks: null }, id)).toBeNull();
    expect(() => parseGuardedChallanRemarks(null, id)).toThrow('Office SQL did not confirm');
    expect(() => parseGuardedChallanRemarks({}, id)).toThrow('payment identity mismatch');
  });
  it('rejects cross-payment and invalid identities, malformed and oversized data', () => {
    const other = 'e4e43b06-0be4-4cfe-96eb-b75b7176d86f';
    expect(() => parseGuardedChallanRemarks({ paymentId: other, challanRemarks: 'Private' }, id))
      .toThrow('payment identity mismatch');
    expect(() => parseGuardedChallanRemarks({ paymentId: id, challanRemarks: 42 }, id))
      .toThrow('Invalid Office SQL');
    expect(() => parseGuardedChallanRemarks({ paymentId: id, challanRemarks: '😀'.repeat(4001) }, id))
      .toThrow('Invalid Office SQL');
    expect(() => parseGuardedChallanRemarks({ paymentId: id, challanRemarks: 'x' }, 'not-a-uuid'))
      .toThrow('Office SQL did not confirm');
  });
});
