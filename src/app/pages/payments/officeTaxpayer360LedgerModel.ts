import type {TaxpayerActivitySnapshot} from './officeTaxpayerActivity';
import {summarizeTaxpayerRecordedActivity} from './officeTaxpayerActivity';
import type {TableRow} from '../modulePageUtils';

/** Presentational source label: a saved payment mirror is NOT an issuer ledger. */
export const OFFICE_MIRROR_SOURCE='Office SQL payment mirror';

export type OfficeLedgerPreview={
  rows:TableRow[];
  recordedSavedAmountMinor:number|null;
  hasAuthoritativeDhara:boolean;
};

/** Fail-closed projection of already linked records; no guessed legal Dhara,
 * government-confirmed tax credits, demand, running balance or fake source events.
 * Scope by taxpayer and year again even when the upstream snapshot was filtered. */
export function projectOfficeTaxpayer360Ledger(
  snapshot:TaxpayerActivitySnapshot,
  taxpayerTin:string,year:string,
  fromDate='',toDate=''
):OfficeLedgerPreview {
  const payments=snapshot.rows.filter(({payment})=>{
    const parsed=Date.parse(payment.createdAt);
    const date=Number.isFinite(parsed)?new Date(parsed).toISOString().slice(0,10):'';
    if((fromDate||toDate)&&!date)return false;
    return (!fromDate||date>=fromDate)&&(!toDate||date<=toDate);
  }).map(({payment})=>payment);
  const linked=summarizeTaxpayerRecordedActivity(payments,[],taxpayerTin,year);
  return {
    rows:linked.rows.map(({payment,row})=>{
      // These are recorded attempt states, never Treasury settlement or
      // an issuer-backed tax-credit status. Unknown/success-shaped states
      // remain Unverified until the authoritative WS3 source is available.
      const recorded=payment.status.trim().toUpperCase();
      const ledgerStage=/(?:PENDING|QUEUED|PROCESSING|INITIATED)/.test(recorded)
        ?'Pending'
        :/^(?:FAILED|ERROR|DECLINED|REJECTED)$/.test(recorded)
          ?'Failed'
          :/^(?:CANCELLED|CANCELED)$/.test(recorded)
            ?'Cancelled':'Unverified';
      return {
        ...row,
        source_system:OFFICE_MIRROR_SOURCE,
        dhara:'—', // No approved Dhara field in the mirrored StoryPayment contract.
        ledger_stage:ledgerStage,
        credit_status:'Not verified',
        payment_ref:payment.id,
      };
    }),
    recordedSavedAmountMinor:linked.recordedSavedAmountMinor,
    hasAuthoritativeDhara:false,
  };
}
