import type { StoryPayment } from './story1OfficeApi';
import { paymentServiceName } from './story1PaymentPresentation';

export type OfficePaymentItem = {
  taxpayer: string;
  service: string;
  assessmentYear: string;
  amountMinor: number;
  authorization?: string;
  economicCode?: string;
};

const validAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const human = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value.trim() : '—';

export function officeMoney(minor: number, language = 'en'): string {
  if (!Number.isSafeInteger(minor) || minor < 0) return '—';
  return '৳' + new Intl.NumberFormat(language.startsWith('bn') ? 'bn-BD' : 'en-BD', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** Present only allocations that reconcile to the source transaction.
 * Do not guess a taxpayer, tax head, or amount from an incomplete record. */
export function getOfficePaymentItems(payment: StoryPayment | null): OfficePaymentItem[] {
  if (!payment || !validAmount(payment.amountMinor)) return [];
  const details = payment.details;
  if (!details) return [];
  const lines = Array.isArray(details.lines) ? details.lines : [];
  const explicit = Array.isArray(details.allocations) ? details.allocations : [];
  const synthetic = lines.some(line => typeof line?.beneficiary === 'string');

  if (synthetic && explicit.length) return []; // Cannot reconcile two identity schemes.
  let items: OfficePaymentItem[] = [];
  if (synthetic) {
    if (lines.some(line => typeof line?.beneficiary !== 'string' || !validAmount(line.amountMinor))) return [];
    items = lines.map(line => ({
      taxpayer: human(line.beneficiary),
      service: paymentServiceName[human(line.category)] ?? human(line.category),
      assessmentYear: human(line.assessmentYear),
      amountMinor: line.amountMinor!,
      ...(human(line.authorizationId) !== '—' ? { authorization: human(line.authorizationId) } : {}),
    }));
  } else if (explicit.length) {
    if (explicit.some(a => !a || typeof a.taxpayerTin !== 'string' || !/^\d{12,13}$/.test(a.taxpayerTin) ||
      !Number.isSafeInteger(a.headId) || !validAmount(a.amountMinor) || !human(a.assessmentYear) || a.assessmentYear === undefined)) return [];
    items = explicit.map(a => {
      const head = lines.find(line => line?.headId === a.headId);
      return {
        taxpayer: human(a.taxpayerName) !== '—' ? human(a.taxpayerName) + ' · ' + a.taxpayerTin : 'TIN ' + a.taxpayerTin,
        service: human(head?.headNameEn) !== '—' ? human(head?.headNameEn) : paymentServiceName[payment.service] ?? payment.service,
        assessmentYear: human(a.assessmentYear),
        amountMinor: a.amountMinor!,
        ...(human(head?.economicCode) !== '—' ? { economicCode: human(head?.economicCode) } : {}),
      };
    });
  } else {
    items = lines.filter(line => validAmount(line?.amountMinor)).map(line => ({
      taxpayer: human(details.taxpayerName) !== '—' ? human(details.taxpayerName) : human(details.taxpayerTin) !== '—' ? 'TIN ' + details.taxpayerTin : '—',
      service: human(line.headNameEn) !== '—' ? human(line.headNameEn) : paymentServiceName[payment.service] ?? payment.service,
      assessmentYear: human(details.assessmentYear),
      amountMinor: line.amountMinor!,
      ...(human(line.economicCode) !== '—' ? { economicCode: human(line.economicCode) } : {}),
    }));
  }
  if (!items.length) return [];
  let total = 0;
  for (const item of items) {
    total += item.amountMinor;
    if (!Number.isSafeInteger(total)) return [];
  }
  return total === payment.amountMinor ? items : [];
}

export type OfficeReceiptInfo = {
  reference: string;
  date: string;
  payer: string;
  taxpayer: string;
  service: string;
  year: string;
  amount: string;
  paymentStatus: string;
  creditStatus: string;
  method: string;
};
