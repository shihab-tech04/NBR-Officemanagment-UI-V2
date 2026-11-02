import type { StoryPayment } from './story1OfficeApi';
import { getOfficePaymentItems, officeMoney } from './officeTransactionDetails';
import { paymentServiceName } from './story1PaymentPresentation';
import type { TableRow } from '../modulePageUtils';

const text = (value:unknown):string => typeof value==='string'&&value.trim() ? value.trim() : '—';
const money = (value:unknown):string => typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?officeMoney(value):'—';
const assessmentYear=(value:string)=>value||'—';

/** The same mirrored SQL payment records used by Office Payments.
 * Never infer a government credit, debit, demand or running tax balance from a
 * saved payment or a Treasury-looking receipt. No synthetic TIN attribution. */
export function projectMirroredTaxLedgerRows(records:readonly StoryPayment[]):TableRow[]{
  return records.flatMap(payment=>{
    const items=getOfficePaymentItems(payment);
    const d=payment.details;
    const date=Number.isFinite(Date.parse(payment.createdAt))
      ?new Date(payment.createdAt).toISOString().slice(0,10):'—';
    const sourceRows=items.length
      ?items.map((item,index)=>({
        id:payment.id+':'+index,
        name:item.taxpayer,
        tin:((item.taxpayer.match(/(?:^|\s)(\d{12,13})(?:\s|$)/)||[])[1]||'—'),
        particulars:item.service+(item.economicCode?' · '+item.economicCode:''),
        ay:assessmentYear(item.assessmentYear),
        amount:money(item.amountMinor),
        economic_code:item.economicCode||'—'
      }))
      :[{
        id:payment.id, name:text(d?.taxpayerName),
        tin:/^\d{12,13}$/.test(d?.taxpayerTin||'')?d!.taxpayerTin!:'—',
        particulars:paymentServiceName[payment.service]||payment.service,
        ay:text(d?.assessmentYear),amount:money(payment.amountMinor),
        economic_code:'—'
      }];
    return sourceRows.map(item=>({
      ...item,
      transaction_date:date,
      reference:payment.id,
      payment_transaction_id:payment.id,
      tax_event_id:'—',
      payer_name:text(d?.payerName)||text(d?.payerId),
      payment_type:paymentServiceName[payment.service]||payment.service,
      assessment_year:item.ay,
      income_year:'—',
      tax_zone:text(d?.taxZone),tax_circle:text(d?.taxCircle),
      payment_channel:text(d?.paymentChannel)||text(d?.paymentMethod),
      receipt_reference:text(d?.receiptReference),
      receipt_status:payment.status.replaceAll('_',' '),
      credit_status:'Tax credit not verified',
      debit:'—',credit:'—',balance:'—',
      liability_settled:'Not verified',remaining_balance:'Not verified',
      activity_history:(date==='—'?'Date unavailable':date)+' · Payment record created · '+payment.status.replaceAll('_',' '),
      where_this_counts:'Recorded payment only. A source-confirmed tax-ledger credit is not available.',
      status:payment.status.replaceAll('_',' '),
      source:'TaxPay → SQL → Office payment mirror'
    }));
  });
}
