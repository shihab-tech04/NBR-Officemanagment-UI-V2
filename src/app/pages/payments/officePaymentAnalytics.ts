import type { StoryPayment } from './story1OfficeApi';
import { paymentServiceName, toStoryPaymentRow } from './story1PaymentPresentation';
import { getOfficePaymentItems } from './officeTransactionDetails';

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
const sorted=(map:Map<string,number>):Array<[string,number]> =>
  [...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
const normalizeYear=(value:string)=>value.trim().replace('–','-');
const paymentYears=(payment:StoryPayment)=>toStoryPaymentRow(payment).assessment_year
  .split(', ').map(normalizeYear).filter(value=>value&&value!=='—');

/** Return the amount allocated to the selected year, or null when the source
 * record cannot be reconciled. A parent spanning years is never counted in
 * full in each year's amount. */
function amountForYear(payment:StoryPayment,year:string):number|null{
  const years=paymentYears(payment);
  const hasAllocationEvidence=(payment.details?.lines?.length??0)>0||
    (payment.details?.allocations?.length??0)>0;
  const items=getOfficePaymentItems(payment);
  if(items.length){
    let total=0;
    for(const item of items){
      if(normalizeYear(item.assessmentYear)!==year)continue;
      total+=item.amountMinor;
      if(!Number.isSafeInteger(total))return null;
    }
    return total>0?total:null;
  }
  // A lone recorded assessment year safely scopes a legacy parent amount.
  // If allocation detail exists but cannot be reconciled, fail closed.
  if(hasAllocationEvidence||years.length!==1||years[0]!==year)return null;
  return payment.amountMinor;
}

/** Summaries of complete read-only recorded activity; no invented gateway success rates.
 * Any invalid or non-saved payment makes the amount unreportable rather than guessing. */
export function officePaymentAnalytics(records:readonly StoryPayment[],year='all'):OfficeAnalyticsSummary{
  const scoped=records.filter(p=>year==='all'||paymentYears(p).includes(normalizeYear(year)));
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
      const scopedAmount=year==='all'?p.amountMinor:amountForYear(p,normalizeYear(year));
      const next=scopedAmount===null?NaN:amountMinor+scopedAmount;
      amountMinor=(status==='SIMULATED_SUCCESS'&&Number.isSafeInteger(p.amountMinor)&&p.amountMinor>0&&
        scopedAmount!==null&&Number.isSafeInteger(scopedAmount)&&scopedAmount>0&&Number.isSafeInteger(next))
        ?next:null;
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

export type OfficePaymentReportDimension='assessmentYear'|'head'|'payer'|'beneficiary';
export type OfficePaymentReportLine={
  parentId:string;allocationIndex:number;occurredAt:string;status:string;
  payerId:string|null;payerName:string|null;
  beneficiaryTin:string|null;beneficiary:string;
  headId:number|null;head:string;assessmentYear:string;amountMinor:number;
};
export type OfficePaymentReportIssueReason=
  |'PAYMENT_ID_MISSING'|'INVALID_OCCURRED_AT'|'ALLOCATION_MISSING_OR_UNRECONCILED'
  |'PAYMENT_STATUS_MISSING'|'PAYER_ID_MISSING'|'BENEFICIARY_TIN_MISSING'
  |'HEAD_ID_MISSING'|'ASSESSMENT_YEAR_MISSING'|'DUPLICATE_PARENT_CONFLICT';
export type OfficePaymentReportIssue={parentId:string;reason:OfficePaymentReportIssueReason};
export type OfficePaymentReportGroup={
  key:string;label:string;parentCount:number;lineCount:number;amountMinor:number|null;parentIds:string[];
};

/** Project only reconciled, payment-linked Office allocation lines. Unavailable
 * identities stay explicit and are never guessed from private address books. */
export function projectOfficePaymentReport(records:readonly StoryPayment[]):{
  rows:OfficePaymentReportLine[];issues:OfficePaymentReportIssue[]
}{
  const rows:OfficePaymentReportLine[]=[];
  const issueKeys=new Set<string>();
  const issues:OfficePaymentReportIssue[]=[];
  const addIssue=(parentId:string,reason:OfficePaymentReportIssueReason)=>{
    const key=parentId+':'+reason;
    if(issueKeys.has(key))return;
    issueKeys.add(key);issues.push({parentId,reason});
  };
  // A retry, offset-page overlap, or refreshed SQL read can return the same
  // immutable parent more than once. Exactly equal parent snapshots count once;
  // conflicting snapshots with the SAME ID count zero, not arbitrary first/last
  // wins. Neither allocation lines nor financial totals may be duplicated.
  // Original source JSON projections have stable keys and array ordering.
  const unique=new Map<string,{payment:StoryPayment;signature:string}>();
  const conflicting=new Set<string>();
  for(const payment of records){
    const id=typeof payment?.id==='string'&&payment.id.trim()?payment.id:'';
    if(!id){addIssue('(unidentified payment)','PAYMENT_ID_MISSING');continue;}
    const signature=JSON.stringify([
      payment.service,payment.status,payment.amountMinor,payment.createdAt,
      payment.certificateReference??null,payment.details??null,
    ]);
    const prior=unique.get(id);
    if(prior&&prior.signature!==signature)conflicting.add(id);
    else if(!prior)unique.set(id,{payment,signature});
  }
  for(const id of conflicting){
    unique.delete(id);
    addIssue(id,'DUPLICATE_PARENT_CONFLICT');
  }
  for(const {payment} of unique.values()){
    const parentId=payment.id;
    const occurredAt=typeof payment.createdAt==='string'?payment.createdAt:'';
    if(!Number.isFinite(Date.parse(occurredAt))){
      addIssue(parentId,'INVALID_OCCURRED_AT');continue;
    }
    const status=typeof payment.status==='string'?payment.status.trim():'';
    if(!status)addIssue(parentId,'PAYMENT_STATUS_MISSING');
    const details=payment.details??{};
    const allocations=Array.isArray(details.allocations)?details.allocations:[];
    const lines=Array.isArray(details.lines)?details.lines:[];
    const items=getOfficePaymentItems(payment);
    if(!items.length|| (allocations.length>0&&items.length!==allocations.length) ||
      (allocations.length===0&&items.length!==lines.length)){
      addIssue(parentId,'ALLOCATION_MISSING_OR_UNRECONCILED');continue;
    }
    const payerId=typeof details.payerId==='string'&&details.payerId.trim()?details.payerId.trim():null;
    const payerName=typeof details.payerName==='string'&&details.payerName.trim()?details.payerName.trim():null;
    if(!payerId)addIssue(parentId,'PAYER_ID_MISSING');
    items.forEach((item,index)=>{
      const allocation=allocations.length?allocations[index]:undefined;
      const sourceLine=lines[index];
      const rawHeadId=allocation?.headId??sourceLine?.headId;
      const headId=Number.isSafeInteger(rawHeadId)?rawHeadId as number:null;
      const head=item.service&&item.service!=='—'?item.service:'Head not recorded';
      const rawTin=item.taxpayerTin;
      const beneficiaryTin=typeof rawTin==='string'&&/^\d{12,13}$/.test(rawTin)?rawTin:null;
      const beneficiary=item.taxpayer&&item.taxpayer!=='—'?item.taxpayer:
        beneficiaryTin?'TIN '+beneficiaryTin:'Beneficiary not recorded';
      const assessmentYear=typeof item.assessmentYear==='string'
        ?item.assessmentYear.trim().replace(/–/g,'-'):'';
      if(!beneficiaryTin)addIssue(parentId,'BENEFICIARY_TIN_MISSING');
      if(headId===null)addIssue(parentId,'HEAD_ID_MISSING');
      if(!assessmentYear||assessmentYear==='—')addIssue(parentId,'ASSESSMENT_YEAR_MISSING');
      rows.push({
        parentId,allocationIndex:index,occurredAt,status:status||'',
        payerId,payerName,beneficiaryTin,beneficiary,headId,head,
        assessmentYear:assessmentYear||'—',amountMinor:item.amountMinor,
      });
    });
  }
  issues.sort((a,b)=>a.parentId.localeCompare(b.parentId)||a.reason.localeCompare(b.reason));
  return {rows,issues};
}

/** Group by source identities and split amounts by reconciled allocation lines.
 * Parent counts are distinct within each group; amount totals sum the line shares.
 * Missing payer identity is parent-scoped; other missing identities stay line-scoped. */
export function groupOfficePaymentReport(
  rows:readonly OfficePaymentReportLine[],dimension:OfficePaymentReportDimension
):OfficePaymentReportGroup[]{
  const groups=new Map<string,{label:string;parents:Set<string>;lineCount:number;amountMinor:number|null}>();
  rows.forEach(row=>{
    let identity:string|null=null,label='Not recorded';
    if(dimension==='assessmentYear'){
      if(row.assessmentYear&&row.assessmentYear!=='—')identity=row.assessmentYear;
      label=identity??'Assessment year not recorded';
    }else if(dimension==='head'){
      if(row.headId!==null)identity=String(row.headId);
      label=row.head||'Head not recorded';
    }else if(dimension==='payer'){
      if(row.payerId){
        identity=row.payerId;
        label=row.payerName||row.payerId;
      }else{
        // Keep missing payer identity explicit and scoped to its immutable parent.
        label='Payer not verified · '+row.parentId;
      }
    }else{
      if(row.beneficiaryTin)identity=row.beneficiaryTin;
      label=row.beneficiary||row.beneficiaryTin||'Beneficiary not recorded';
    }
    const key=identity===null
      ?dimension==='payer'?'unverified:payer:'+row.parentId:'unverified:'+row.parentId+':'+String(row.allocationIndex)
      :dimension+':'+identity;
    const group=groups.get(key)??{label,parents:new Set<string>(),lineCount:0,amountMinor:0};
    group.parents.add(row.parentId);group.lineCount++;
    if(group.amountMinor!==null){
      const next=group.amountMinor+row.amountMinor;
      group.amountMinor=Number.isSafeInteger(row.amountMinor)&&row.amountMinor>0&&Number.isSafeInteger(next)?next:null;
    }
    groups.set(key,group);
  });
  return [...groups.entries()].map(([key,group])=>({
    key,label:group.label,parentCount:group.parents.size,lineCount:group.lineCount,
    amountMinor:group.amountMinor,parentIds:[...group.parents].sort(),
  })).sort((a,b)=>b.parentCount-a.parentCount||a.label.localeCompare(b.label)||a.key.localeCompare(b.key));
}
