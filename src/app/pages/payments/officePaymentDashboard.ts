import type {StoryPayment} from './story1OfficeApi';
import {toStoryPaymentRow} from './story1PaymentPresentation';
import {officePaymentAnalytics} from './officePaymentAnalytics';

export type DashboardBreakdown={label:string;count:number};
export type OfficePaymentDashboardSnapshot={
  total:number;
  saved:number;
  failed:number;
  pending:number;
  other:number;
  services:DashboardBreakdown[];
  years:DashboardBreakdown[];
  recent:StoryPayment[];
  noTaxpayerTin:number;
  noExternalReceiptReference:number;
  noPaymentMethod:number;
};

/** Dashboard and Transactions must inspect the same full, read-only SQL payment feed.
 * The group-by year is MULTI-MEMBERSHIP: one payment may include allocations in two years.
 * This is recorded simulated activity, not Treasury or statutory credit evidence. */
export function buildOfficePaymentDashboard(
  records:readonly StoryPayment[], assessmentYear='all'
):OfficePaymentDashboardSnapshot {
  const inYear=(p:StoryPayment):boolean=>assessmentYear==='all'||
    toStoryPaymentRow(p).assessment_year.split(', ')
      .some(y=>y.trim().replace('–','-')===assessmentYear);
  const scoped=records.filter(inYear);
  const analysis=officePaymentAnalytics(scoped);
  const years=new Map<string,number>();
  let noTaxpayerTin=0;
  let noExternalReceiptReference=0;
  let noPaymentMethod=0;
  for(const p of scoped){
    const row=toStoryPaymentRow(p);
    const tins=String(row.tin??'').split(',').map(v=>v.trim());
    if(!tins.some(v=>/^\d{12,13}$/.test(v)))noTaxpayerTin++;
    if(typeof p.details?.receiptReference!=='string'||!p.details.receiptReference.trim())
      noExternalReceiptReference++;
    const method=p.details?.paymentMethod||p.details?.paymentChannel;
    if(typeof method!=='string'||!method.trim())noPaymentMethod++;
    const unique=new Set(row.assessment_year.split(', ').map(v=>v.trim().replace('–','-'))
      .filter(v=>v&&v!=='—'));
    for(const year of unique)years.set(year,(years.get(year)??0)+1);
  }
  const recent=[...scoped].sort((a,b)=>{
    const at=Date.parse(a.createdAt),bt=Date.parse(b.createdAt);
    const aa=Number.isFinite(at)?at:-Infinity,bb=Number.isFinite(bt)?bt:-Infinity;
    return bb-aa||String(a.id).localeCompare(String(b.id));
  }).slice(0,5);
  return {
    total:analysis.total,saved:analysis.saved,failed:analysis.failed,
    pending:analysis.pending,other:analysis.other,
    services:analysis.services.map(([label,count])=>({label,count})),
    years:[...years.entries()].map(([label,count])=>({label,count}))
      .sort((a,b)=>b.count-a.count||b.label.localeCompare(a.label)),
    recent,noTaxpayerTin,noExternalReceiptReference,noPaymentMethod
  };
}
