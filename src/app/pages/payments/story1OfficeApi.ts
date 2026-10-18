/** Existing Office Payments screen data adapter for Story 1 simulated payments. */
const ENDPOINT='https://ihbtabrvmyiwikqqbhrf.supabase.co/functions/v1/demo-story1-office';
export type StoryPayment = {
  id:string;service:string;amountMinor:number;status:string;createdAt:string;
  details:{payerName?:string;taxpayerTin?:string;assessmentYear?:string;
    taxZone?:string;taxCircle?:string;receiptReference?:string;
    paymentChannel?:string;paymentMethod?:string;lines?:unknown[];
    receiptMobile?:string;noticeReference?:string};
};
export type StoryNotice = {id:number;paymentId:string;type:string;createdAt:string};
async function get<T>(path:string):Promise<T[]> {
  const response=await fetch(ENDPOINT+path,{headers:{'Accept':'application/json'}});
  if(!response.ok)throw Error('Office payment synchronization unavailable');
  const json=await response.json() as {success:boolean;data:T[]};
  if(!json.success||!Array.isArray(json.data))throw Error('Invalid Office payment response');
  return json.data;
}
export const getStoryPayments=()=>get<StoryPayment>('/payments');
export const getStoryNotices=()=>get<StoryNotice>('/notifications');
