import { describe, expect, it } from 'vitest';
import { parseGuardedChallanRemarks } from '../officeChallanRemarks';

const id = 'e4e43b06-0be4-4cfe-96eb-b75b7176d86e';

describe('F-178: immutable, officer-guarded Office remarks readback', () => {
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
