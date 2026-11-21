/** F-178: read original Taxpayer challan remarks exclusively through the Office
 * SQL officer-role guard. The transaction feed and browser never authorize this read. */
import { getAuditSqlClient, isSharedAuditMode } from '../audit/auditSharedSql';
import { getOfficeCmsAuthClient } from '../../services/officeCmsBridge';

const PAYMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REMARKS_CODE_POINTS = 4000;

// F-178 applies to ordinary tax challans; Travel Tax has no approved remarks
// field. Keep Office readback aligned with all Taxpayer non-Travel categories.
const CHALLAN_REMARKS_SERVICES = new Set([
  'TAX_WITH_RETURN',
  'ADVANCE_TAX',
  'ASSESSED_DEMAND',
  'PENALTY',
  'SOURCE_TAX_DEPOSIT',
  'APPELLATE_TRIBUNAL',
  'OTHER_TAX_PAYMENT',
]);

export function supportsOfficeChallanRemarks(service: unknown): boolean {
  return typeof service === 'string' && CHALLAN_REMARKS_SERVICES.has(service);
}

export function parseGuardedChallanRemarks(result: unknown, paymentId: string): string | null {
  if (!PAYMENT_UUID.test(paymentId) || !result || typeof result !== 'object' ||
      Array.isArray(result)) throw new Error('Office SQL did not confirm the payment');
  const row = result as Record<string, unknown>;
  if (row.paymentId !== paymentId) throw new Error('Office SQL payment identity mismatch');
  if (row.challanRemarks === null) return null;
  if (typeof row.challanRemarks !== 'string' ||
      Array.from(row.challanRemarks).length > MAX_REMARKS_CODE_POINTS)
    throw new Error('Invalid Office SQL challan remarks');
  // Preserve Unicode and line breaks; React renders the value as inert text.
  return row.challanRemarks;
}

/** The SQL RPC checks auth.uid(), an active Office MAKER/REVIEWER/APPROVER
 * assignment, OFFICE_SQL origin and the immutable Taxpayer payment parent. */
export async function loadGuardedOfficeChallanRemarks(paymentId: string): Promise<string | null> {
  if (!PAYMENT_UUID.test(paymentId)) throw new Error('Invalid payment identity');
  const db = isSharedAuditMode() ? getAuditSqlClient() : getOfficeCmsAuthClient();
  const { data: identity, error: authError } = await db.auth.getUser();
  if (authError || !identity.user || identity.user.is_anonymous)
    throw new Error('Verified Office officer sign-in required');
  const { data: sessionData, error: sessionError } = await db.auth.getSession();
  if (sessionError || !sessionData.session ||
      sessionData.session.user.id !== identity.user.id ||
      !sessionData.session.access_token)
    throw new Error('Office officer session changed; sign in again');
  const { data, error } = await db.rpc('payment_v1_office_guarded_challan_remarks', {
    p_payment_id: paymentId,
  });
  if (error) throw new Error('Authorized Office SQL remarks read unavailable');
  return parseGuardedChallanRemarks(data, paymentId);
}
