/** Frontend guardrails for the existing non-financial TaxPay officer-review RPC.
 * SQL remains authoritative for roles, transitions, idempotency and persistence.
 */
export type OfficerReviewAction = 'ACKNOWLEDGE' | 'REQUEST_INFORMATION' | 'CLOSE_REVIEW';
export type OfficerReviewRole = 'MAKER' | 'REVIEWER' | 'APPROVER';

export type ReviewAttempt = {
  officerId: string;
  requestId: string;
  action: OfficerReviewAction;
  reason: string;
  key: string;
};

const nextStatus: Record<OfficerReviewAction, string> = {
  ACKNOWLEDGE: 'ACKNOWLEDGED',
  REQUEST_INFORMATION: 'INFO_REQUESTED',
  CLOSE_REVIEW: 'REVIEW_CLOSED',
};

export function expectedReviewStatus(action: OfficerReviewAction): string {
  return nextStatus[action];
}

/** Mirrors the allowed UI transitions; the SQL function independently enforces them. */
export function canOfferReviewAction(
  role: OfficerReviewRole | null,
  currentStatus: string,
  action: OfficerReviewAction,
): boolean {
  if (!role) return false;
  if (action === 'ACKNOWLEDGE') return currentStatus === 'SUBMITTED_FOR_REVIEW';
  if (action === 'REQUEST_INFORMATION')
    return currentStatus === 'SUBMITTED_FOR_REVIEW' || currentStatus === 'ACKNOWLEDGED';
  return (role === 'REVIEWER' || role === 'APPROVER') &&
    (currentStatus === 'ACKNOWLEDGED' || currentStatus === 'INFO_REQUESTED');
}

/** On ambiguous network/read-back failure, retry the same logical decision
 * with the same key. A changed officer, request, action or reason gets a new key.
 */
export function prepareReviewAttempt(
  previous: ReviewAttempt | null,
  intent: Omit<ReviewAttempt, 'key'>,
  generateKey: () => string,
): ReviewAttempt {
  if (previous &&
    previous.officerId === intent.officerId &&
    previous.requestId === intent.requestId &&
    previous.action === intent.action &&
    previous.reason === intent.reason) return previous;
  return { ...intent, key: generateKey() };
}
