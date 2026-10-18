/** Existing Office Payments screen data adapter for Story 1 simulated payments. */
const ENDPOINT='https://ihbtabrvmyiwikqqbhrf.supabase.co/functions/v1/demo-story1-office';
export type StoryPayment = {
  id:string;service:string;amountMinor:number;status:string;createdAt:string;
  details?:{
    payerName?:string;taxpayerName?:string;taxpayerTin?:string;assessmentYear?:string;
    taxZone?:string;taxCircle?:string;receiptReference?:string;
    paymentChannel?:string;paymentMethod?:string;
    lines?:unknown[];receiptMobile?:string;noticeReference?:string;
    payerMode?:string;incomeTaxType?:string;travelRoute?:string;
    travelDate?:string;passengerName?:string;
  };
};
export type StoryNotice = {id:number;paymentId:string;type:string;createdAt:string};
async function get<T>(path:string):Promise<T> {
  const response=await fetch(ENDPOINT+path,{headers:{'Accept':'application/json'},cache:'no-store'});
  if(!response.ok)throw Error('Office transactions temporarily unavailable');
  const json=await response.json() as {success:boolean;data:T};
  if(!json.success)throw Error('Invalid Office payment response');
  return json.data;
}
/** All UI-submitted transactions; no fixed 100-record cut-off. */
export async function getStoryPayments():Promise<StoryPayment[]> {
  const records:StoryPayment[]=[];
  const pageSize=100;
  for(let page=1;page<=100;page++){
    const result=await get<{items:StoryPayment[];total:number;page:number}>('/payments?page='+page+'&perPage='+pageSize);
    if(!Array.isArray(result.items)||!Number.isSafeInteger(result.total))throw Error('Invalid transaction page');
    records.push(...result.items);
    if(records.length>=result.total)return records;
  }
  throw Error('Transaction history exceeds the retrieval limit');
}
export const getStoryNotices=()=>get<StoryNotice[]>('/notifications');
