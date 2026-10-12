import { describe, expect, it } from 'vitest';
import { paymentDateOrdinal } from '../app/pages/payments/PaymentRecordList';
import { referencePayments } from '../app/pages/payments/paymentReference';

describe('Payment post-release requirements', () => {
  it('sorts original sample dates chronologically in both directions', () => {
    const actual=referencePayments.map(p=>({date:p.date,time:paymentDateOrdinal(p.date)}));
    expect(actual.every(p=>p.time!==null)).toBe(true);
    expect(actual.sort((a,b)=>(b.time??0)-(a.time??0)).map(p=>p.date)).toEqual([
      '12 Oct 2026','09 Oct 2026','20 Sep 2026','12 Sep 2026','03 Sep 2026',
    ]);
    expect(actual.sort((a,b)=>(a.time??0)-(b.time??0))[0].date).toBe('03 Sep 2026');
  });
  it('rejects invalid human-formatted dates rather than guessing',()=>{
    expect(paymentDateOrdinal('31 Feb 2026')).toBeNull();
    expect(paymentDateOrdinal('—')).toBeNull();
    expect(paymentDateOrdinal('')).toBeNull();
  });
});