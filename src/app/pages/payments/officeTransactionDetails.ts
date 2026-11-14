import type { StoryPayment } from './story1OfficeApi';
import { demoTinFor, paymentServiceName } from './story1PaymentPresentation';

export type OfficePaymentItem = {
  taxpayer: string;
  taxpayerTin?: string;
  service: string;
  assessmentYear: string;
  amountMinor: number;
  authorization?: string;
  economicCode?: string;
};

const validAmount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
// Existing TravelTax.tsx stores receipt passenger amounts in taka; the
// separate SQL fixture uses minor units. Accept either exact source format,
// never an approximate or conflicting conversion.
const travelAmountMinor=(minorValue:unknown,takaValue:unknown):number|null=>{
  let direct:number|null=null;
  if(minorValue!==undefined){
    if(typeof minorValue!=='number'||!Number.isSafeInteger(minorValue)||minorValue<0)return null;
    direct=minorValue;
  }
  let converted:number|null=null;
  if(takaValue!==undefined){
    if(typeof takaValue!=='number'||!Number.isFinite(takaValue)||takaValue<0)return null;
    converted=Math.round(takaValue*100);
    if(!Number.isSafeInteger(converted)||Math.abs(converted/100-takaValue)>1e-7)return null;
  }
  if(direct!==null&&converted!==null&&direct!==converted)return null;
  return direct??converted;
};
const travelPassengerMinor=(passenger:unknown):number|null=>{
  if(!passenger||typeof passenger!=='object'||Array.isArray(passenger))return null;
  const row=passenger as Record<string,unknown>;
  return travelAmountMinor(row.amountMinor,row.amount);
};
const travelLineMinor=(line:unknown):number|null=>{
  if(!line||typeof line!=='object'||Array.isArray(line))return null;
  const row=line as Record<string,unknown>;
  return travelAmountMinor(row.amountMinor,row.totalAmount!==undefined?row.totalAmount:row.amount);
};
const human = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value.trim() : '—';
const travelPassengerName=(passenger:unknown):string=>{
  if(!passenger||typeof passenger!=='object'||Array.isArray(passenger))return '—';
  const row=passenger as Record<string,unknown>;
  return human(row.passengerName)!=='—'?human(row.passengerName):human(row.name);
};
const sameTravelPassengerRows=(left:unknown[],right:unknown[]):boolean=>
  left.length===right.length&&left.every((passenger,index)=>{
    const other=right[index];
    const name=travelPassengerName(passenger);
    const amount=travelPassengerMinor(passenger);
    return name!=='—'&&name===travelPassengerName(other)&&
      amount!==null&&amount===travelPassengerMinor(other);
  });

export function officeMoney(minor: number, language = 'en'): string {
  if (!Number.isSafeInteger(minor) || minor < 0) return '—';
  return '৳' + new Intl.NumberFormat(language.startsWith('bn') ? 'bn-BD' : 'en-BD', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** Strictly parse the amount actually rendered in an Office payment row.
 * Bengali digits are valid in the BN interface. Never infer an amount from
 * invalid grouping, an unlabelled number, or a value outside safe integer paisa.
 */
export function parseOfficeMoneyMinor(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[০-৯]/g, digit =>
    String(digit.charCodeAt(0) - 0x09e6));
  const match = /^৳\s*((?:[0-9]{1,3}(?:,[0-9]{3})+)|(?:[0-9]+))(?:\.([0-9]{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const whole = Number(match[1].replace(/,/g, ''));
  const minor = whole * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor >= 0 ? minor : null;
}

/** Present only allocations that reconcile to the source transaction.
 * Do not guess a taxpayer, tax head, or amount from an incomplete record. */
export type OfficePaymentScope={taxpayerTin:string;assessmentYear?:string};
export function getOfficePaymentItems(payment: StoryPayment | null, scope?: OfficePaymentScope): OfficePaymentItem[] {
  if (!payment || !validAmount(payment.amountMinor)) return [];
  const details = payment.details;
  if (!details) return [];
  const lines = Array.isArray(details.lines) ? details.lines : [];
  const explicit = Array.isArray(details.allocations) ? details.allocations : [];
  const synthetic = lines.some(line => typeof line?.beneficiary === 'string');
  const detailPassengers:unknown[]=Array.isArray(details.passengers)?details.passengers:[];
  const snapshotPassengers:unknown[]=Array.isArray(details.receiptSnapshot?.travelDetails?.passengers)
    ?details.receiptSnapshot.travelDetails.passengers:[];
  const passengers = payment.service === 'TRAVEL_TAX'
    ? (detailPassengers.length?detailPassengers:snapshotPassengers.length?snapshotPassengers:null)
    : null;
  const passengerSourcesConflict=detailPassengers.length>0&&snapshotPassengers.length>0&&
    !sameTravelPassengerRows(detailPassengers,snapshotPassengers);

  if (synthetic && explicit.length) return []; // Cannot reconcile two identity schemes.
  let items: OfficePaymentItem[] = [];
  if (passengers?.length) {
    // The Office officer can inspect reconciled passenger amounts. A name or
    // masked passport cannot establish entitlement to a taxpayer-scoped read.
    const passengerAmounts=passengers.map(travelPassengerMinor);
    if (passengerSourcesConflict||explicit.length||
      passengers.some(passenger=>travelPassengerName(passenger)==='—')||
      passengerAmounts.some(amount=>amount===null)) return [];
    const safePassengerAmounts=passengerAmounts as number[];
    const travelLines=lines.length?lines:
      Array.isArray(details.receiptSnapshot?.items)?details.receiptSnapshot.items:[];
    // The Taxpayer source emits one receipt line per passenger. Older mirrored
    // rows may contain one aggregate line; accept that only when it equals the
    // immutable parent total. Never reassign a mismatched line by array sum.
    const linesReconcile=!travelLines.length||
      (travelLines.length===1&&passengers.length>1
        ?travelLineMinor(travelLines[0])===payment.amountMinor
        :travelLines.length===passengers.length&&travelLines.every((line,index)=>
          travelLineMinor(line)===safePassengerAmounts[index]));
    if(!linesReconcile)return [];
    items = passengers.map((passenger,index) => ({
      taxpayer: travelPassengerName(passenger),
      service: paymentServiceName.TRAVEL_TAX,
      assessmentYear: '—',
      amountMinor: safePassengerAmounts[index],
    }));
  } else if (synthetic) {
    if (lines.some(line => typeof line?.beneficiary !== 'string' || !validAmount(line.amountMinor))) return [];
    items = lines.map(line => ({
      taxpayer: human(line.beneficiary),
      ...(typeof line.beneficiary === 'string' && demoTinFor(line.beneficiary)
        ? {taxpayerTin: demoTinFor(line.beneficiary)}
        : {}),
      service: paymentServiceName[human(line.category)] ?? human(line.category),
      assessmentYear: human(line.assessmentYear),
      amountMinor: line.amountMinor!,
      ...(human(line.authorizationId) !== '—' ? { authorization: human(line.authorizationId) } : {}),
    }));
  } else if (explicit.length) {
    if (explicit.some(a => !a || typeof a.taxpayerTin !== 'string' || !/^\d{12,13}$/.test(a.taxpayerTin) ||
      !Number.isSafeInteger(a.headId) || !validAmount(a.amountMinor) || !human(a.assessmentYear) || a.assessmentYear === undefined)) return [];
    // A head may repeat for different taxpayers or years. Matching by head ID
    // alone selects the first occurrence and misattributes later allocations.
    // Preserve the immutable SQL line/allocation order; fail closed on mismatches.
    if (lines.some((line, index) => !explicit[index] || line?.headId !== explicit[index].headId)) return [];
    items = explicit.map((a, index) => {
      const head = lines[index];
      // Historical records may omit a separate head-description line for
      // additional allocations of the same head. Reuse only an unambiguous
      // display label; do not invent economic codes or positional fields.
      const historicalNames = !head
        ? [...new Set(lines.filter(line => line?.headId === a.headId)
          .map(line => human(line?.headNameEn)).filter(name => name !== '—'))]
        : [];
      const historicalName = historicalNames.length === 1 ? historicalNames[0] : undefined;
      return {
        taxpayer: human(a.taxpayerName) !== '—' ? human(a.taxpayerName) + ' · ' + a.taxpayerTin : 'TIN ' + a.taxpayerTin,
        taxpayerTin:a.taxpayerTin,
        service: human(head?.headNameEn) !== '—' ? human(head?.headNameEn) : historicalName ?? paymentServiceName[payment.service] ?? payment.service,
        assessmentYear: human(a.assessmentYear),
        amountMinor: a.amountMinor!,
        ...(human(head?.economicCode) !== '—' ? { economicCode: human(head?.economicCode) } : {}),
      };
    });
  } else {
    items = lines.filter(line => validAmount(line?.amountMinor)).map(line => ({
      taxpayer: human(details.taxpayerName) !== '—' ? human(details.taxpayerName) : human(details.taxpayerTin) !== '—' ? 'TIN ' + details.taxpayerTin : '—',
      ...(typeof details.taxpayerTin==='string'&&/^\d{12,13}$/.test(details.taxpayerTin)
        ? {taxpayerTin:details.taxpayerTin}:{}),
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
  if(total !== payment.amountMinor)return [];
  if(!scope)return items;
  // Passenger names alone cannot grant account-level visibility.
  if(passengers?.length)return [];
  if(!/^\d{12,13}$/.test(scope.taxpayerTin))return [];
  const selected=items.filter(item=>item.taxpayerTin===scope.taxpayerTin&&
    (!scope.assessmentYear||scope.assessmentYear==='all'||
     item.assessmentYear.replace('–','-')===scope.assessmentYear));
  return selected;
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
  receiptReference?:string;
  certificateReference?:string;
  batchId?:string;
  batchItemIndex?:number;
  batchItemCount?:number;
};
