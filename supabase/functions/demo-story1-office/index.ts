import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 const path=new URL(req.url).pathname.replace(/^\/demo-story1-office/,"");
 const key=Deno.env.get("SUPABASE_ANON_KEY")??Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
 const url=Deno.env.get("SUPABASE_URL");
 if(!key||!url)return respond({success:false,error:"BACKEND_UNAVAILABLE"},503);
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
   let rpc:string;let args:Record<string,unknown>={};
   if(req.method==="POST"&&path==="/mirror"){
      const txt=await req.text();if(txt.length>16000)return respond({success:false,error:"PAYLOAD_TOO_LARGE"},400);
      rpc="demo_story1_mirror";args={p_input:JSON.parse(txt)};
   }else if(req.method==="GET"&&path==="/payments"){rpc="demo_story1_office_list";}
   else if(req.method==="GET"&&path==="/notifications"){rpc="demo_story1_office_notices";}
   else return respond({success:false,error:"NOT_FOUND"},404);
   const {data,error}=await client.rpc(rpc,args);
   if(error){console.error("office story1",error.code,error.message);return respond({success:false,error:error.message.startsWith("MIRROR_CONFLICT")?"MIRROR_CONFLICT":"DATABASE_ERROR"},409);}
   return respond({success:true,data,simulationOnly:true});
 }catch(e){console.error("office story1 request",e);return respond({success:false,error:"INVALID_INPUT"},400)}
});