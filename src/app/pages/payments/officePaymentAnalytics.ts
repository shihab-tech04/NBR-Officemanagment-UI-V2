import type { StoryPayment } from './story1OfficeApi';
import { paymentServiceName, toStoryPaymentRow } from './story1PaymentPresentation';

export type OfficeAnalyticsSummary={
  total:number; saved:number; failed:number; pending:number; other:number;
  amountMinor:number|null;
  methods:Array<[string,number]>;
  services:Array<[string,number]>;
};
const methodLabels:Record<string,string>={
  BKASH:'bKash',NAGAD:'Nagad',ROCKET:'Rocket',INTERNET_BANKING:'Internet Banking',
  SONALI_E_SHEBA:'Sonali e-Sheba',BEFTN_RTGS:'BEFTN / RTGS',VISA:'Visa',
  MASTERCARD:'Mastercard',BANK_BRANCH:'Bank branch',NOW:'Pay online',OTC:'Bank branch',
};
const add=(map:Map<string,number>,key:string)=>map.set(key,(map.get(key)||0)+1);
const sorted=(map:Map<string,number>):Array<[string,number]>=>
  [...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
/** Summaries of complete read-only recorded activity; no invented gateway success rates.
 * Any invalid or non-saved payment makes the amount unreportable rather than guessing. */
export function officePaymentAnalytics(records:readonly StoryPayment[],year='all'):OfficeAnalyticsSummary{
  const scoped=records.filter(p=>year==='all'||toStoryPaymentRow(p).assessment_year
    .split(', ').some(value=>value.trim().replace('–','-')===year));
  let saved=0,failed=0,pending=0,other=0;
  let amountMinor:number|null=0;
  const methods=new Map<string,number>();
  const services=new Map<string,number>();
  for(const p of scoped){
    const status=typeof p.status==='string'?p.status.toUpperCase():'';
    if(status==='SIMULATED_SUCCESS')saved++;
    else if(/FAIL|REJECT|CANCEL|ERROR/.test(status))failed++;
    else if(/PEND|PROCESS|INITIAT|CREATED/.test(status))pending++;
    else other++;
    if(amountMinor!==null){
      const next=amountMinor+p.amountMinor;
      amountMinor=(status==='SIMULATED_SUCCESS'&&Number.isSafeInteger(p.amountMinor)&&p.amountMinor>0&&Number.isSafeInteger(next))?next:null;
    }
    const rawMethod=p.details?.paymentMethod||p.details?.paymentChannel;
    const method=typeof rawMethod==='string'&&rawMethod.trim()
      ? methodLabels[rawMethod.trim()]??rawMethod.trim().replace(/_/g,' ')
      : 'Not recorded';
    add(methods,method);
    const code=typeof p.service==='string'&&p.service.trim()?p.service.trim():'Not recorded';
    add(services,paymentServiceName[code]??code.replace(/_/g,' '));
  }
  return {total:scoped.length,saved,failed,pending,other,amountMinor,
    methods:sorted(methods),services:sorted(services)};
}
