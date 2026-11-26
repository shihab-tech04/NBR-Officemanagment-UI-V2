import type { StoryPayment } from './story1OfficeApi';

export type TypedOfficeCorrection = Readonly<{
  allocationIndex:number|null;allocationId:string|null;
  currentAY:string;currentCircle:string;currentHeadCode:string;
  proposedAY:string;proposedCircle:string;proposedHeadCode:string;
}>;
export type OfficeCorrectionTarget = Omit<TypedOfficeCorrection,'proposedAY'|'proposedCircle'|'proposedHeadCode'> & {paymentId:string;tin:string;reference:string;key:string};
const str=(...values:unknown[]):string=>values.find((v):v is string=>typeof v==='string'&&v.length>0)??'';
export const normalizeCorrectionAY=(value:string)=>/^\d{4}-\d{2}$/.test(value)?value.slice(0,5)+value.slice(0,2)+value.slice(-2):value;
export function validateTypedOfficeCorrection(c:TypedOfficeCorrection):boolean {
  return (c.allocationIndex===null?c.allocationId===null:Number.isSafeInteger(c.allocationIndex)&&c.allocationIndex>=0&&c.allocationIndex<=999999)&&
    (c.allocationId===null||typeof c.allocationId==='string'&&c.allocationId.length>0)&&
    [c.currentAY,c.currentCircle,c.currentHeadCode,c.proposedAY,c.proposedCircle,c.proposedHeadCode].every(v=>typeof v==='string'&&v.length<=120)&&
    (c.proposedAY===c.currentAY||/^\d{4}-(\d{2}|\d{4})$/.test(c.proposedAY))&&
    (!c.currentCircle||!!c.proposedCircle.trim())&&(!c.currentHeadCode||!!c.proposedHeadCode.trim())&&
    (normalizeCorrectionAY(c.currentAY)!==normalizeCorrectionAY(c.proposedAY)||c.currentCircle!==c.proposedCircle.trim()||c.currentHeadCode!==c.proposedHeadCode.trim());
}
export function officeCorrectionTargets(payments:readonly StoryPayment[],tin:string,reference:string):OfficeCorrectionTarget[]{
  if(!/^\d{12,13}$/.test(tin)||!reference)return [];
  const matches=payments.filter(p=>p.status==='SIMULATED_SUCCESS'&&(p.id===reference||p.details?.receiptReference===reference||p.details?.receiptSnapshot?.challanNo===reference));
  if(matches.length!==1)return [];
  const p=matches[0],d=p.details;if(!d)return [];
  const snap=(d.receiptSnapshot??{}) as Record<string,unknown>;
  const allocs=(d.allocations??[]) as Record<string,unknown>[],items=d.receiptSnapshot?.allocationItems??[],lines=d.lines??[];
  const receiptItems=d.receiptSnapshot?.items??[];
  const count=Math.max(allocs.length,items.length,lines.length);
  const targets:OfficeCorrectionTarget[]=[];
  for(let i=0;i<Math.max(count,1);i++){
    const a=allocs[i],s=items[i],line=lines[i],index=count?i:null;
    if(count>1&&!a&&!s)continue;
    if(str(a?.taxpayerTin,s?.taxpayerTin,count<=1?d.taxpayerTin:null)!==tin)continue;
    const id=str(a?.allocationId,s?.allocationId)||null;
    if(count>1&&!id)continue;
    targets.push({paymentId:p.id,tin,reference,key:p.id+':'+(index??'parent'),allocationIndex:index,allocationId:id,
      currentAY:str(a?.assessmentYear,s?.assessmentYear,line?.assessmentYear,snap.assessmentYear,d.assessmentYear),
      currentCircle:typeof snap.taxCircle==='string'?snap.taxCircle:d.taxCircle??'',
      currentHeadCode:str(s?.economicCode,line?.economicCode,receiptItems[i]?.economicCode,count<=1?receiptItems[0]?.economicCode:null)});
  }
  return targets;
}
