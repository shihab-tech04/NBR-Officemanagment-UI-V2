import type {StoryNotice,StoryPayment} from './story1OfficeApi';
import {toStoryPaymentRow} from './story1PaymentPresentation';

/** Read-only Office summary from the identical SQL-mirrored demo payment records.
 * A reportable simulated amount must be an exact, safe integer-paisa sum.
 * Never mix sample reference payments, bank receipts or tax-credit estimates.
 */
export function summarizeMirroredDemoPayments(
  records:readonly StoryPayment[],
  notices:readonly StoryNotice[],
  assessmentYear='all'
){
  const scoped=records.filter(payment=>assessmentYear==='all'||toStoryPaymentRow(payment)
    .assessment_year.split(', ').map(value=>value.trim().replace('–','-')).includes(assessmentYear));
  let amountMinor:number|null=0;
  for(const row of scoped){
    if(!Number.isSafeInteger(row.amountMinor)||row.amountMinor<=0||
      row.status!=='SIMULATED_SUCCESS'||amountMinor===null||
      !Number.isSafeInteger(amountMinor+row.amountMinor)){
      amountMinor=null;
      break;
    }
    amountMinor+=row.amountMinor;
  }
  const ids=new Set(scoped.map(row=>row.id));
  const dates=scoped.map(p=>Date.parse(p.createdAt)).filter(Number.isFinite);
  const latestDate=dates.length?new Date(Math.max(...dates)).toISOString():null;
  return {
    count:scoped.length,
    amountMinor,
    services:new Set(scoped.map(row=>row.service)).size,
    notificationCount:notices.filter(notice=>ids.has(notice.paymentId)).length,
    latestDate
  };
}
