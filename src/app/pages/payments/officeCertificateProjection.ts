import type { StoryPayment } from './story1OfficeApi';
import type { ChallanReceipt } from './canonicalCertificate/types/tax';
import { makeConfirmedReceipt } from './canonicalCertificate/services/confirmedPaymentCertificate';
import { buildPaymentCertificateModel, canViewPaymentCertificate } from './canonicalCertificate/services/paymentCertificateModel';
import { getOfficePaymentItems, parseOfficeMoneyMinor } from './officeTransactionDetails';

/** Project only the already authorized Office read for the currently selected parent.
 * No reference search, guest capability, fabricated receipt or financial mutation. */
export function officeCertificateReceipt(source:StoryPayment|null, selectedRef:unknown, displayedAmount:unknown, scopeTin?:string, scopeYear?:string):ChallanReceipt|null {
  if(!source||source.id!==selectedRef||source.service==='GIFT_TAX'||source.status!=='SIMULATED_SUCCESS'||
    source.certificateReference!=='SK-PC-'+source.id) return null;
  const displayedMinor=parseOfficeMoneyMinor(displayedAmount);
  if(displayedMinor===null||displayedMinor<=0)return null;
  try{
    const receipt=makeConfirmedReceipt(source);
    if(!canViewPaymentCertificate(receipt))return null;
    const model=buildPaymentCertificateModel(receipt);
    if(!model||model.totalMinor!==source.amountMinor||model.certificateReference!==source.certificateReference||
       Math.abs(receipt.totalAmount-source.amountMinor/100)>1e-7)return null;
    const items=getOfficePaymentItems(source,scopeTin?{taxpayerTin:scopeTin,assessmentYear:scopeYear}:undefined);
    if(!items.length)return null;
    const lines=scopeTin?model.lines.filter(line=>line.recipientTin===scopeTin&&
      (!scopeYear||scopeYear==='all'||line.assessmentYear===scopeYear)):model.lines;
    if(lines.length!==items.length||lines.some((line,index)=>{
      const item=items[index];
      return line.amountMinor!==item.amountMinor||
        (source.service!=='TRAVEL_TAX'&&(line.recipientTin!==item.taxpayerTin||line.assessmentYear!==item.assessmentYear));
    }))return null;
    const total=lines.reduce((sum,line)=>sum+line.amountMinor,0);
    if(!Number.isSafeInteger(total)||total!==displayedMinor)return null;
    if(!scopeTin||lines.length===model.lines.length)return receipt;
    // A scoped Taxpayer 360 view must never render unrelated allocations.
    const scoped:ChallanReceipt={...receipt,items:[],totalAmount:total/100,
      assessmentYear:[...new Set(lines.map(line=>line.assessmentYear!))].join(', '),
      allocationItems:lines.map(line=>({
        allocationId:line.allocationId,taxpayerTin:line.recipientTin,taxpayerName:line.recipientName,
        assessmentYear:line.assessmentYear!,paymentServiceEn:line.descriptionEn,
        paymentServiceBn:line.descriptionBn,amountMinor:line.amountMinor,economicCode:line.economicCode,
      }))};
    return canViewPaymentCertificate(scoped)?scoped:null;
  }catch{return null;}
}
