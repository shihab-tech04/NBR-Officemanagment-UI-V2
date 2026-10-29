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

const escapeHtml = (value: unknown) => String(value ?? '—').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char] ?? char));

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

/** A self-contained, offline printable OFFICE payment record, not a tax certificate. */
export function officeReceiptHtml(info: OfficeReceiptInfo, items: OfficePaymentItem[], language = 'en'): string {
  const bn = language.startsWith('bn');
  const label = (en: string, bangla: string) => bn ? bangla : en;
  const entry = (name: string, value: string) => '<div class="field"><small>' + escapeHtml(name) +
    '</small><strong>' + escapeHtml(value) + '</strong></div>';
  const lines = items.map(item => '<tr><td>' + escapeHtml(item.taxpayer) + '</td><td>' +
    escapeHtml(item.service) + '</td><td>' + escapeHtml(item.assessmentYear) + '</td><td class="number">' +
    escapeHtml(officeMoney(item.amountMinor, language)) + '</td></tr>').join('');
  return '<!doctype html><html lang="' + (bn ? 'bn' : 'en') + '"><head><meta charset="utf-8"><title>' +
    escapeHtml(label('Office payment receipt', 'অফিস পেমেন্ট রসিদ')) + '</title><style>' +
    'body{font-family:Arial,sans-serif;color:#17243b;padding:36px;max-width:900px;margin:auto;font-size:14px}' +
    'header{display:flex;justify-content:space-between;align-items:start;border-bottom:2px solid #235c9b;padding-bottom:16px}' +
    'h1{font-size:22px;margin:4px 0}h2{font-size:16px;margin-top:24px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}' +
    '.field{min-width:0;border-bottom:1px solid #ddd;padding:7px 0}.field small{display:block;color:#65738a;margin-bottom:4px}.field strong{overflow-wrap:anywhere}' +
    'table{border-collapse:collapse;width:100%;margin-top:10px}td,th{padding:10px;text-align:left;border-bottom:1px solid #ddd}.number{text-align:right}' +
    '.note{margin-top:24px;padding-top:14px;border-top:1px solid #ddd;color:#53647b}@media print{body{padding:0}}' +
    '</style></head><body><header><div><small>NBR Office Management</small><h1>' +
    escapeHtml(label('Payment receipt', 'পেমেন্ট রসিদ')) + '</h1></div><strong>' + escapeHtml(info.amount) +
    '</strong></header><section class="grid">' +
    entry(label('Transaction reference','লেনদেন রেফারেন্স'), info.reference) +
    entry(label('Date','তারিখ'), info.date) + entry(label('Payer','পরিশোধকারী'), info.payer) +
    entry(label('Taxpayer','করদাতা'), info.taxpayer) + entry(label('Service','সেবা'), info.service) +
    entry(label('Assessment year','করবর্ষ'), info.year) +
    entry(label('Payment method','পেমেন্ট পদ্ধতি'), info.method) +
    entry(label('Payment status','পেমেন্টের অবস্থা'), info.paymentStatus) +
    entry(label('Tax credit status','কর ক্রেডিটের অবস্থা'), info.creditStatus) + '</section>' +
    (items.length ? '<h2>' + escapeHtml(label('Payment allocations','পেমেন্ট বণ্টন')) +
      '</h2><table><thead><tr><th>' + escapeHtml(label('Taxpayer','করদাতা')) + '</th><th>' +
      escapeHtml(label('Service','সেবা')) + '</th><th>' + escapeHtml(label('Assessment year','করবর্ষ')) +
      '</th><th class="number">' + escapeHtml(label('Amount','পরিমাণ')) + '</th></tr></thead><tbody>' +
      lines + '</tbody></table>' : '') + '<p class="note">' + escapeHtml(info.creditStatus) +
    '</p></body></html>';
}
