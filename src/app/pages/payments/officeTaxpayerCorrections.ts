import type { StoryPayment } from './story1OfficeApi';
import type { OfficeCorrectionInquiry } from './correctionReviewApi';
import { toStoryTaxpayerPaymentRow } from './story1PaymentPresentation';

export type LinkedTaxpayerCorrection={
  inquiry:OfficeCorrectionInquiry;
  payment:StoryPayment;
  taxpayerName:string;
};

/** Link officer-authorized correction inquiries to one taxpayer only through exact
 * transaction/unique receipt-reference equality followed by the existing reconciled
 * taxpayer + assessment-year allocation projection. No name/TIN substring guesses.
 * A receipt reference reused by multiple payments is ambiguous and excluded. */
export function linkedTaxpayerCorrections(
  inquiries:readonly OfficeCorrectionInquiry[],
  payments:readonly StoryPayment[],
  tin:string,
  assessmentYear='all',
):LinkedTaxpayerCorrection[] {
  if(!/^\d{12,13}$/.test(tin))return [];
  const ids=new Map<string,StoryPayment[]>();
  const receipts=new Map<string,StoryPayment[]>();
  for(const payment of payments){
    if(!payment||typeof payment.id!=='string'||!payment.id.trim())continue;
    const add=(map:Map<string,StoryPayment[]>,ref:string)=>{
      const old=map.get(ref)??[];
      map.set(ref,[...old,payment]);
    };
    add(ids,payment.id);
    const receipt=payment.details?.receiptReference;
    if(typeof receipt==='string'&&receipt.trim())add(receipts,receipt);
  }
  const linked:LinkedTaxpayerCorrection[]=[];
  const seen=new Set<string>();
  for(const inquiry of inquiries){
    if(!inquiry||typeof inquiry.requestId!=='string'||!inquiry.requestId||
      typeof inquiry.originalReference!=='string'||!inquiry.originalReference||
      seen.has(inquiry.requestId))continue;
    const idMatches=ids.get(inquiry.originalReference)??[];
    const receiptMatches=receipts.get(inquiry.originalReference)??[];
    const all=new Map([...idMatches,...receiptMatches].map(p=>[p.id,p]));
    if(all.size!==1)continue; // an ambiguous cross-payer reference must not be assigned
    const payment=[...all.values()][0];
    const own=toStoryTaxpayerPaymentRow(payment,tin,assessmentYear);
    if(!own)continue;
    seen.add(inquiry.requestId);
    linked.push({inquiry,payment,taxpayerName:own.taxpayer_name});
  }
  return linked.sort((a,b)=>
    (Date.parse(b.inquiry.createdAt)||0)-(Date.parse(a.inquiry.createdAt)||0)||
    a.inquiry.requestId.localeCompare(b.inquiry.requestId));
}
