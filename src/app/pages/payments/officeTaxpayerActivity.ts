import type {StoryPayment,StoryNotice} from './story1OfficeApi';
import {toStoryTaxpayerPaymentRow} from './story1PaymentPresentation';
import {getOfficePaymentItems} from './officeTransactionDetails';

export type TaxpayerActivityRow={
  payment:StoryPayment;
  row:NonNullable<ReturnType<typeof toStoryTaxpayerPaymentRow>>;
};
export type TaxpayerActivitySnapshot={
  rows:TaxpayerActivityRow[];
  linkedRecords:number;
  savedRecords:number;
  recordedSavedAmountMinor:number|null;
  assessmentYears:Array<{label:string;count:number}>;
  services:Array<{label:string;count:number}>;
  payerContext:{self:number;other:number;unspecified:number};
  notices:StoryNotice[];
  latestRecordedAt:string|null;
};

function parseDisplayedMinor(value:unknown):number|null {
  if(typeof value!=='string')return null;
  const match=/^৳(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if(!match)return null;
  const minor=Number(match[1].replace(/,/g,''))*100+Number((match[2]??'').padEnd(2,'0'));
  return Number.isSafeInteger(minor)&&minor>0?minor:null;
}
/** Amounts are recorded saved allocations only; this never validates a Treasury receipt.
 * Fail closed on unreconciled beneficiary sums, invalid TINs, unsafe integers or source mismatch. */
export function summarizeTaxpayerRecordedActivity(
  payments:readonly StoryPayment[],notices:readonly StoryNotice[],
  tin:string,year='all'
):TaxpayerActivitySnapshot {
  const empty:TaxpayerActivitySnapshot={rows:[],linkedRecords:0,savedRecords:0,
    recordedSavedAmountMinor:0,assessmentYears:[],services:[],
    payerContext:{self:0,other:0,unspecified:0},notices:[],latestRecordedAt:null};
  if(!/^\d{12,13}$/.test(tin))return empty;
  const rows:TaxpayerActivityRow[]=[];
  const years=new Map<string,number>(),services=new Map<string,number>();
  let total:number|null=0,saved=0;
  let self=0,other=0,unspecified=0;
  for(const p of payments){
    const row=toStoryTaxpayerPaymentRow(p,tin,year);
    if(!row)continue;
    rows.push({payment:p,row});
    const uniqueYears=new Set(String(row.assessment_year).split(',').map(x=>x.trim().replace('–','-')).filter(x=>x&&x!=='—'));
    for(const ay of uniqueYears)years.set(ay,(years.get(ay)??0)+1);
    const uniqueServices=new Set(String(row.payment_type).split(',').map(x=>x.trim()).filter(x=>x&&x!=='—'));
    for(const service of uniqueServices)services.set(service,(services.get(service)??0)+1);
    const mode=p.details?.payerMode;
    if(mode==='SELF')self++;
    else if(mode==='OTHER')other++;
    else unspecified++;
    if(p.status!=='SIMULATED_SUCCESS')continue;
    saved++;
    const items=getOfficePaymentItems(p,{taxpayerTin:tin,assessmentYear:year});
    let attributed:number|null=null;
    if(items.length){
      const amount=items.reduce((sum,item)=>sum+item.amountMinor,0);
      if(Number.isSafeInteger(amount)&&amount>0)attributed=amount;
    }else if(p.details?.taxpayerTin===tin&&
      !Array.isArray(p.details.lines)&&!Array.isArray(p.details.allocations)&&
      (year==='all'||p.details.assessmentYear?.replace('–','-')===year)){
      attributed=p.amountMinor;
    }
    const projected=parseDisplayedMinor(row.amount);
    if(total===null||attributed===null||attributed!==projected||
      !Number.isSafeInteger(total+attributed))total=null;
    else total+=attributed;
  }
  rows.sort((a,b)=>{
    const left=Date.parse(a.payment.createdAt),right=Date.parse(b.payment.createdAt);
    return (Number.isFinite(right)?right:-Infinity)-(Number.isFinite(left)?left:-Infinity)
      ||a.payment.id.localeCompare(b.payment.id);
  });
  const refs=new Set(rows.map(item=>item.payment.id));
  const matches=notices.filter(n=>refs.has(n.paymentId)).sort((a,b)=>{
    const left=Date.parse(a.createdAt),right=Date.parse(b.createdAt);
    return (Number.isFinite(right)?right:-Infinity)-(Number.isFinite(left)?left:-Infinity);
  });
  const mostRecent=rows.map(x=>Date.parse(x.payment.createdAt)).find(Number.isFinite);
  const descending=(data:Map<string,number>)=>[...data.entries()]
    .map(([label,count])=>({label,count}))
    .sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label));
  return {
    linkedRecords:rows.length,rows,savedRecords:saved,recordedSavedAmountMinor:total,
    assessmentYears:descending(years),services:descending(services),
    payerContext:{self,other,unspecified},
    notices:matches,latestRecordedAt:mostRecent===undefined?null:new Date(mostRecent).toISOString()
  };
}
