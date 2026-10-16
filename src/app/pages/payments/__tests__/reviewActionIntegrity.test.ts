import { describe, expect, it, vi } from 'vitest';
import {
  canOfferReviewAction, expectedReviewStatus, prepareReviewAttempt,
  type OfficerReviewAction, type OfficerReviewRole,
} from '../reviewActionIntegrity';

describe('connected TaxPay officer-review SQL contract', () => {
  it('mirrors the three statuses returned by the authoritative SQL function', () => {
    expect(expectedReviewStatus('ACKNOWLEDGE')).toBe('ACKNOWLEDGED');
    expect(expectedReviewStatus('REQUEST_INFORMATION')).toBe('INFO_REQUESTED');
    expect(expectedReviewStatus('CLOSE_REVIEW')).toBe('REVIEW_CLOSED');
  });

  it('hides invalid actions including repeated information requests', () => {
    const cases: Array<[OfficerReviewRole, string, OfficerReviewAction, boolean]> = [
      ['MAKER', 'SUBMITTED_FOR_REVIEW', 'ACKNOWLEDGE', true],
      ['MAKER', 'SUBMITTED_FOR_REVIEW', 'REQUEST_INFORMATION', true],
      ['MAKER', 'SUBMITTED_FOR_REVIEW', 'CLOSE_REVIEW', false],
      ['MAKER', 'ACKNOWLEDGED', 'REQUEST_INFORMATION', true],
      ['MAKER', 'INFO_REQUESTED', 'REQUEST_INFORMATION', false],
      ['MAKER', 'ACKNOWLEDGED', 'CLOSE_REVIEW', false],
      ['REVIEWER', 'ACKNOWLEDGED', 'CLOSE_REVIEW', true],
      ['APPROVER', 'INFO_REQUESTED', 'CLOSE_REVIEW', true],
      ['APPROVER', 'REVIEW_CLOSED', 'CLOSE_REVIEW', false],
      ['APPROVER', 'REVIEW_CLOSED', 'REQUEST_INFORMATION', false],
    ];
    for (const [role, status, action, allowed] of cases) {
      expect(canOfferReviewAction(role, status, action)).toBe(allowed);
    }
    expect(canOfferReviewAction(null, 'SUBMITTED_FOR_REVIEW', 'ACKNOWLEDGE')).toBe(false);
  });

  it('reuses a key after an ambiguous RPC timeout or read-back failure', () => {
    const generate = vi.fn().mockReturnValueOnce('key-one').mockReturnValueOnce('key-two');
    const intent = { officerId:'officer-a', requestId:'request-a', action:'ACKNOWLEDGE' as const, reason:'Reviewed correctly' };
    const first = prepareReviewAttempt(null, intent, generate);
    const retry = prepareReviewAttempt(first, { ...intent }, generate);
    expect(retry).toBe(first);
    expect(retry.key).toBe('key-one');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('creates a new key when any decision identity changes', () => {
    let sequence = 0;
    const generate = () => String(++sequence);
    const initial = { officerId:'officer-a', requestId:'request-a', action:'ACKNOWLEDGE' as const, reason:'Reviewed correctly' };
    const first = prepareReviewAttempt(null, initial, generate);
    const changes = [
      { ...initial, officerId:'officer-b' },
      { ...initial, requestId:'request-b' },
      { ...initial, action:'REQUEST_INFORMATION' as const },
      { ...initial, reason:'A different reason' },
    ];
    for (const changed of changes) expect(prepareReviewAttempt(first, changed, generate).key).not.toBe(first.key);
    expect(sequence).toBe(5);
  });
});
