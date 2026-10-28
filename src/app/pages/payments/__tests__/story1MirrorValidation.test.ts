import { describe, expect, it } from 'vitest';
import { uuidPattern, verifiedAuthorizationMirror, verifiedPaymentMirror } from '../../../../../supabase/functions/demo-story1-office/mirrorValidation';

const id = 'a0000000-0000-4000-8000-000000000001';
const session = 'a0000000-0000-4000-8000-000000000002';
const record = { success: true, simulationOnly: true, data: { id, status: 'SIMULATED_SUCCESS', createdAt: '2026-10-28T00:00:00Z',
  data: { sessionId: session, service: 'TAX_WITH_RETURN', amountMinor: 12345, details: { payerName: 'Sample' } } } };

describe('source-verified Office mirror', () => {
  it('builds the writer input only from the source record and session', () => {
    expect(verifiedPaymentMirror(id, session, record)).toEqual({
      id, sessionId: session, status: 'SIMULATED_SUCCESS', createdAt: record.data.createdAt,
      service: 'TAX_WITH_RETURN', amountMinor: 12345, data: record.data.data,
    });
  });
  it('rejects a mismatched ID, invalid session, failed status and malformed amount', () => {
    expect(verifiedPaymentMirror(session, session, record)).toBeNull();
    expect(verifiedPaymentMirror(id, 'invalid', record)).toBeNull();
    expect(verifiedPaymentMirror(id, session, { ...record, data: { ...record.data, data: { ...record.data.data, sessionId: id } } })).toBeNull();
    expect(verifiedPaymentMirror(id, session, { ...record, simulationOnly: false })).toBeNull();
    expect(verifiedPaymentMirror(id, session, { ...record, data: { ...record.data, status: 'FAILED' } })).toBeNull();
    expect(verifiedPaymentMirror(id, session, { ...record, data: { ...record.data, data: { ...record.data.data, amountMinor: 1.5 } } })).toBeNull();
    expect(uuidPattern.test('------------------------------------')).toBe(false);
  });
  it('requires the authorization snapshot identity and success from the source', () => {
    const snapshot = { success: true, simulationOnly: true, data: { id, status: 'ACTIVE' } };
    expect(verifiedAuthorizationMirror(id, snapshot)).toEqual(snapshot.data);
    expect(verifiedAuthorizationMirror(session, snapshot)).toBeNull();
    expect(verifiedAuthorizationMirror(id, { ...snapshot, success: false })).toBeNull();
  });
});
