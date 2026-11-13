import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const PG_BIGINT_MAX=9223372036854775807n;
const validDate=(value:unknown)=>typeof value==="string"&&Number.isFinite(Date.parse(value));
const validUuid=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validNoticePage=(data:unknown,afterId:bigint,limit:number):boolean=>{
 if(!data||typeof data!=="object"||Array.isArray(data))return false;
 const page=data as {items?:unknown;nextAfterId?:unknown;hasMore?:unknown};
 if(!Array.isArray(page.items)||typeof page.nextAfterId!=="string"||
    typeof page.hasMore!=="boolean"||page.items.length>limit)return false;
 if(!/^(0|[1-9][0-9]*)$/.test(page.nextAfterId)||page.nextAfterId.length>19)return false;
 const next=BigInt(page.nextAfterId);
 if(next>PG_BIGINT_MAX||next<afterId)return false;
 let previous=afterId;
 for(const value of page.items){
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const item=value as Record<string,unknown>;
  if(typeof item.id!=="string"||item.id.length>19||
     !/^[1-9][0-9]*$/.test(item.id)||!validUuid(item.paymentId)||
     typeof item.type!=="string"||!item.type||!validDate(item.createdAt))return false;
  const id=BigInt(item.id);
  if(id<=previous||id>PG_BIGINT_MAX)return false;
  previous=id;
  const payment=item.payment;
  if(!payment||typeof payment!=="object"||Array.isArray(payment))return false;
  const record=payment as Record<string,unknown>;
  if(record.id!==item.paymentId||typeof record.service!=="string"||!record.service||
     typeof record.amountMinor!=="string"||!/^[1-9][0-9]*$/.test(record.amountMinor)||
     record.amountMinor.length>19||BigInt(record.amountMinor)>PG_BIGINT_MAX||
     record.status!=="SIMULATED_SUCCESS"||!validDate(record.createdAt))return false;
 }
 const expected=page.items.length?String(previous):String(afterId);
 if(page.nextAfterId!==expected)return false;
 if(page.hasMore&&(page.items.length!==limit||previous<=afterId))return false;
 return true;
};
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 const path=new URL(req.url).pathname.replace(/^\/demo-story1-office/,"");
 const key=Deno.env.get("SUPABASE_ANON_KEY")??Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
 const url=Deno.env.get("SUPABASE_URL");
 if(!key||!url)return respond({success:false,error:"BACKEND_UNAVAILABLE"},503);
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 // Direct Data API callers may NOT mirror synthetic payments. Only this Edge
 // verifies TaxPay's short-lived server-signed proof and then uses service_role.
 let rpcClient=client;
 try{
   let rpc:string;let args:Record<string,unknown>={};
   let noticePageCheck:{afterId:bigint;limit:number}|null=null;
   if(req.method==="POST"&&path==="/mirror"){
      const txt=await req.text();if(txt.length>16000)return respond({success:false,error:"PAYLOAD_TOO_LARGE"},400);
      const incoming=JSON.parse(txt);
      if(!incoming?.id||!incoming?.sessionId)return respond({success:false,error:"INVALID_MIRROR"},400);
      // Use the source SQL read-back, never an unverified caller snapshot.
      const sourceUrl="https://eyqhoavnitkrajvyqvxn.supabase.co/functions/v1/demo-story1-taxpay/payments/"
         +encodeURIComponent(incoming.id)+"?sessionId="+encodeURIComponent(incoming.sessionId);
      // Forward TaxPay's short-lived, payment+session-bound proof to TaxPay.
      // Never trust the caller's payment snapshot or store the proof in Office.
      const mirrorProof=req.headers.get("x-taxpay-office-mirror-proof");
      const source=await fetch(sourceUrl,{
        headers:mirrorProof?{"x-taxpay-office-mirror-proof":mirrorProof}:undefined,
        signal:AbortSignal.timeout(10000)});
      if(!source.ok)return respond({success:false,error:"SOURCE_RECORD_NOT_FOUND"},424);
      const sourceResponse=await source.json();
      if(!sourceResponse?.success||sourceResponse.simulationOnly!==true||
         sourceResponse.data?.id!==incoming.id||sourceResponse.data?.status!=="SIMULATED_SUCCESS")
        return respond({success:false,error:"SOURCE_RECORD_NOT_READY"},424);
      const record=sourceResponse.data;
      const serverKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??(()=>{
        const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(!raw)return null;
        try{const value=(JSON.parse(raw) as Record<string,string>).default;
          return typeof value==="string"&&value?value:null;}catch{return null;}
      })();
      if(!serverKey)return respond({success:false,error:"BACKEND_UNAVAILABLE"},503);
      rpcClient=createClient(url,serverKey,{auth:{persistSession:false,autoRefreshToken:false}});
      rpc="demo_story1_mirror";
      args={p_input:{id:record.id,sessionId:incoming.sessionId,
         service:record.data.service,amountMinor:record.data.amountMinor,
         data:record.data,status:record.status,createdAt:record.createdAt}};
   }else if(req.method==="POST"&&path==="/authorization/mirror"){
      const raw=await req.text();if(raw.length>200)return respond({success:false,error:"PAYLOAD_TOO_LARGE"},400);
      const incoming=JSON.parse(raw),id=incoming.id;
      if(typeof id!=="string"||!/^[0-9a-fA-F-]{36}$/.test(id))return respond({success:false,error:"INVALID_ID"},400);
      // Never accept a caller-supplied authorization state: read TaxPay SQL back.
      const sourceUrl="https://eyqhoavnitkrajvyqvxn.supabase.co/functions/v1/demo-story1-taxpay/authorizations/"
        +encodeURIComponent(id)+"/snapshot";
      const res=await fetch(sourceUrl,{signal:AbortSignal.timeout(10000)});
      if(!res.ok)return respond({success:false,error:"SOURCE_AUTHORIZATION_MISSING"},424);
      const snapshot=await res.json();
      if(!snapshot?.success||snapshot.data?.id!==id)return respond({success:false,error:"SOURCE_AUTHORIZATION_INVALID"},424);
      rpc="demo_auth_office_mirror";args={p_input:snapshot.data};
   }else if(req.method==="GET"&&path==="/payments"){
      const u=new URL(req.url),page=Number(u.searchParams.get("page")??"1"),
            perPage=Number(u.searchParams.get("perPage")??"100");
      if(!Number.isSafeInteger(page)||!Number.isSafeInteger(perPage)||page<1||perPage<1||perPage>100)
        return respond({success:false,error:"INVALID_PAGINATION"},400);
      rpc="demo_story1_office_payment_page";args={p_page:page,p_per_page:perPage};
   }
   else if(req.method==="GET"&&path==="/notifications/page"){
      const u=new URL(req.url),afterId=u.searchParams.get("afterId")??"0",
            limitRaw=u.searchParams.get("limit")??"100";
      if(afterId.length>19||!/^(0|[1-9][0-9]*)$/.test(afterId)||!/^[1-9][0-9]{0,2}$/.test(limitRaw))
        return respond({success:false,error:"INVALID_PAGINATION"},400);
      const afterIdValue=BigInt(afterId),limit=Number(limitRaw);
      if(afterIdValue>PG_BIGINT_MAX||!Number.isSafeInteger(limit)||limit<1||limit>100)
        return respond({success:false,error:"INVALID_PAGINATION"},400);
      noticePageCheck={afterId:afterIdValue,limit};
      rpc="demo_story1_office_notice_page";args={p_after_id:afterId,p_limit:limit};
   }else if(req.method==="GET"&&path==="/notifications"){rpc="demo_story1_office_notices";}
   else return respond({success:false,error:"NOT_FOUND"},404);
   const {data,error}=await rpcClient.rpc(rpc,args);
   if(error){console.error("office story1",error.code,error.message);return respond({success:false,error:error.message.startsWith("MIRROR_CONFLICT")?"MIRROR_CONFLICT":"DATABASE_ERROR"},409);}
   if(rpc==="demo_story1_office_notice_page"&&noticePageCheck&&
      !validNoticePage(data,noticePageCheck.afterId,noticePageCheck.limit))
     return respond({success:false,error:"INVALID_NOTIFICATION_PAGE"},502);
   return respond({success:true,data,simulationOnly:true});
 }catch(e){console.error("office story1 request",e);return respond({success:false,error:"INVALID_INPUT"},400)}
});
