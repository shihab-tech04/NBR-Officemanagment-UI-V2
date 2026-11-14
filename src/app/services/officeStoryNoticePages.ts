/**
 * Exact-ID Office Story alert cursor consumer.
 * Canonical route + SQL belong to WS3 Office #270; this file is read-only.
 */
import {parseOfficeNoticeId, getOfficeStoryNoticeReadState, OfficeNoticeAuthorizationError} from "./officeStoryNoticeReadState";
import {getAuditSqlClient} from "../pages/audit/auditSharedSql";

const ENDPOINT = "https://ihbtabrvmyiwikqqbhrf.supabase.co/functions/v1/demo-story1-office";
const MAX_ID = 9223372036854775807n;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateOk=(v:unknown):v is string=>typeof v==="string"&&Number.isFinite(Date.parse(v));

export type OfficeStoryCursorNotice = {
  id:string; paymentId:string;type:string;createdAt:string;
  payment:{id:string;service:string;amountMinor:string;status:"SIMULATED_SUCCESS";createdAt:string};
};
export type OfficeStoryCursorPage = {items:OfficeStoryCursorNotice[];nextAfterId:string;hasMore:boolean};

/** Validate all identities without lossy JS Number conversions. */
export function parseOfficeStoryCursorPage(raw:unknown,afterId:string,limit=100):OfficeStoryCursorPage {
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
    !(afterId==="0"||parseOfficeNoticeId(afterId))||
    !Number.isSafeInteger(limit)||limit<1||limit>100) throw Error("Invalid Office notice cursor");
  const page=raw as Record<string,unknown>;
  if(!Array.isArray(page.items)||page.items.length>limit||
     typeof page.nextAfterId!=="string"||
     !(page.nextAfterId==="0"||parseOfficeNoticeId(page.nextAfterId))||
     typeof page.hasMore!=="boolean")throw Error("Invalid Office notice page");
  const items:OfficeStoryCursorNotice[]=[];
  let last=BigInt(afterId);
  for(const rawItem of page.items){
    if(!rawItem||typeof rawItem!=="object"||Array.isArray(rawItem))
      throw Error("Invalid Office notice item");
    const row=rawItem as Record<string,unknown>;
    const id=parseOfficeNoticeId(row.id);
    if(!id||BigInt(id)<=last||!UUID.test(String(row.paymentId))||
       typeof row.type!=="string"||!row.type||!dateOk(row.createdAt))
      throw Error("Invalid Office notice order or identity");
    const value=row.payment;
    if(!value||typeof value!=="object"||Array.isArray(value))
      throw Error("Invalid Office payment projection");
    const payment=value as Record<string,unknown>;
    if(payment.id!==row.paymentId||typeof payment.service!=="string"||!payment.service||
       typeof payment.amountMinor!=="string"||
       !/^[1-9][0-9]{0,18}$/.test(payment.amountMinor)||
       BigInt(payment.amountMinor)>MAX_ID||
       payment.status!=="SIMULATED_SUCCESS"||!dateOk(payment.createdAt))
      throw Error("Invalid Office payment projection");
    last=BigInt(id);
    items.push({id,paymentId:row.paymentId as string,type:row.type,
      createdAt:row.createdAt,payment:{
        id:payment.id as string,service:payment.service,
        amountMinor:payment.amountMinor,status:"SIMULATED_SUCCESS",
        createdAt:payment.createdAt,
      }});
  }
  if(page.nextAfterId!==last.toString()||
     (page.hasMore&&items.length===0))
    throw Error("Office notice cursor did not advance");
  return {items,nextAfterId:page.nextAfterId,hasMore:page.hasMore};
}

/** Isolated loader: return nothing on any incomplete page or network error. */
export async function loadOfficeStoryCursorNotices(
  requestPage:(afterId:string,limit:number)=>Promise<unknown>,
  limit=100,maxPages=2000,
):Promise<OfficeStoryCursorNotice[]>{
  if(!Number.isInteger(limit)||limit<1||limit>100||
     !Number.isInteger(maxPages)||maxPages<1||maxPages>2000)throw Error("Invalid Office notice page limit");
  const notices:OfficeStoryCursorNotice[]=[];
  const seen=new Set<string>();
  let afterId="0";
  for(let page=0;page<maxPages;page++){
    const data=parseOfficeStoryCursorPage(await requestPage(afterId,limit),afterId,limit);
    for(const item of data.items){
      if(seen.has(item.id))throw Error("Duplicate Office notice across cursor pages");
      seen.add(item.id);notices.push(item);
    }
    if(!data.hasMore)return notices;
    afterId=data.nextAfterId;
  }
  throw Error("Office notice cursor exceeded safe retrieval limit");
}

async function fetchPage(afterId:string,limit:number,authorization:string):Promise<unknown>{
  const response=await fetch(ENDPOINT+"/notifications/page?afterId="+
    encodeURIComponent(afterId)+"&limit="+limit,{
      method:"GET",cache:"no-store",headers:{Accept:"application/json",Authorization:"Bearer "+authorization},
    });
  if(response.status===401||response.status===403)throw new OfficeNoticeAuthorizationError();
  if(!response.ok)throw Error("Office notice page temporarily unavailable");
  const responseData:unknown=await response.json();
  if(!responseData||typeof responseData!=="object")throw Error("Invalid Office notice response");
  const wrapper=responseData as Record<string,unknown>;
  if(wrapper.success!==true||wrapper.simulationOnly!==true)
    throw Error("Invalid Office notice source");
  return wrapper.data;
}

/**
 * Publish only after every cursor page and the current officer's authenticated
 * SQL read-state batch have been verified. No partial result or tab-cache fallback.
 */
export async function getVerifiedOfficerStoryNotices():Promise<{
  officerUid:string;notices:OfficeStoryCursorNotice[];readIds:string[];
}> {
  const start=await getOfficeStoryNoticeReadState([]);
  // Reuse the officer session already verified by the SQL read-state contract,
  // rather than letting an anonymous public GET disclose even synthetic notices.
  const {data,error}=await getAuditSqlClient().auth.getSession();
  const session=data.session;
  if(error||!session||session.user.id!==start.officerUid||
     typeof session.access_token!=="string"||!session.access_token)
    throw new OfficeNoticeAuthorizationError();
  const notices=await loadOfficeStoryCursorNotices(
    (afterId,limit)=>fetchPage(afterId,limit,session.access_token));
  const accepted=notices.filter(item=>item.type==="NEW_SIMULATED_PAYMENT");
  const readIds:string[]=[];
  for(let offset=0;offset<accepted.length;offset+=100){
    const batch=accepted.slice(offset,offset+100).map(item=>item.id);
    const verified=await getOfficeStoryNoticeReadState(batch);
    if(verified.officerUid!==start.officerUid)throw Error("Office officer changed during notice pagination");
    readIds.push(...verified.notices.filter(item=>item.isRead).map(item=>item.noticeId));
  }
  const end=await getOfficeStoryNoticeReadState([]);
  if(end.officerUid!==start.officerUid)throw Error("Office officer changed during notice pagination");
  return {officerUid:start.officerUid,notices:accepted,readIds};
}
