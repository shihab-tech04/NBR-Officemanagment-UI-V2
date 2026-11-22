import { getOfficePaymentItems } from './officeTransactionDetails';
import type { StoryPayment } from './story1OfficeApi';

export type OfficeBeneficiaryDirectoryRow = {
  id: string;
  taxpayerTin: string;
  taxpayerName: string;
  allocation: string;
  assessmentYear: string;
  amountMinor: number;
  paymentDate: string;
};

const validTin = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{12,13}$/.test(value);

function taxpayerNameFromItem(value: string, tin: string): string {
  const normalized = value.trim();
  const suffix = ' · ' + tin;
  if (normalized === 'TIN ' + tin) return '—';
  return normalized.endsWith(suffix) ? normalized.slice(0, -suffix.length).trim() || '—' : normalized || '—';
}

/**
 * Office beneficiary rows come only from the guarded payment SQL projection.
 * A saved list, tag, or address-book row cannot create a directory entry.
 */
export function buildOfficeBeneficiaryDirectoryRows(
  payments: readonly StoryPayment[],
): OfficeBeneficiaryDirectoryRow[] {
  const rows: OfficeBeneficiaryDirectoryRow[] = [];
  for (const payment of payments) {
    if (payment.status !== 'SIMULATED_SUCCESS') continue;
    for (const [index, item] of getOfficePaymentItems(payment).entries()) {
      if (!validTin(item.taxpayerTin)) continue;
      const service = item.service.trim();
      const economicCode = item.economicCode?.trim();
      rows.push({
        id: payment.id + ':' + index,
        taxpayerTin: item.taxpayerTin,
        taxpayerName: taxpayerNameFromItem(item.taxpayer, item.taxpayerTin),
        allocation: economicCode ? service + ' · ' + economicCode : service,
        assessmentYear: item.assessmentYear.trim() || '—',
        amountMinor: item.amountMinor,
        paymentDate: payment.createdAt,
      });
    }
  }
  return rows.sort((left, right) => {
    const leftDate = Date.parse(left.paymentDate);
    const rightDate = Date.parse(right.paymentDate);
    return (Number.isFinite(rightDate) ? rightDate : -Infinity) -
      (Number.isFinite(leftDate) ? leftDate : -Infinity) || left.id.localeCompare(right.id);
  });
}
