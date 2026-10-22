import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const allowedOrigins = new Set(["https://shihab-tech04.github.io", "http://localhost:5173"]);
const isId = (s:string) => /^[A-Za-z0-9_-]{1,100}$/.test(s);
function cors(origin:string|null): HeadersInit {
  return {
    "Access-Control-Allow-Origin":origin&&allowedOrigins.has(origin)?origin:"https://shihab-tech04.github.io",
    "Access-Control-Allow-Headers":"authorization,x-nbr-rule-session,apikey,content-type,accept",
    "Access-Control-Allow-Methods":"GET,POST,PATCH,OPTIONS",
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "Vary":"Origin"
  };
}
Deno.serve(async (request:Request) => {
 const origin=request.headers.get("origin"), headers=cors(origin);
 const reply=(status:number,error:string)=>Response.json({error},{status,headers});
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(origin&&!allowedOrigins.has(origin))return reply(403,"Origin not allowed");
 const url=new URL(request.url);
 const segments=url.pathname.split("/").filter(Boolean);
 const pos=segments.lastIndexOf("nbr-rules-office-gateway");
 if(pos<0)return reply(404,"Route not found");
 const route=segments.slice(pos+1),first=route[0],second=route[1];
 const publicGet=request.method==="GET"&&first==="public"&&second==="years"&&route.length===2;
 const secureGet=request.method==="GET"&&(
    (["years","groups","summary","gates","audit","engine-parameters"].includes(first)&&route.length===1)||
    (first==="rules"&&(route.length===1||(route.length===2&&isId(second)))));
 const sessionAuto=request.method==="POST"&&first==="session"&&second==="auto"&&route.length===2;
 const securePost=request.method==="POST"&&route.length===2&&(
    (first==="session"&&second==="revoke")||(first==="years"&&second==="next"));
 const securePatch=request.method==="PATCH"&&route.length===2&&
    ["rules","groups","engine-parameters"].includes(first)&&isId(second);
 if(!(publicGet||secureGet||sessionAuto||securePost||securePatch))return reply(404,"Route not found");
 const token=request.headers.get("authorization");
 const session=request.headers.get("x-nbr-rule-session");
 if(!publicGet&&(!token||!token.startsWith("Bearer ")||(!session&&!sessionAuto)))
    return reply(401,"Administrator authentication required");
 const base=Deno.env.get("SUPABASE_URL");
 if(!base)return reply(503,"Project configuration missing");
 const target=new URL(base+"/functions/v1/nbr-rules-api/"+route.map(encodeURIComponent).join("/"));
 target.search=url.search;
 const forward=new Headers({"accept":"application/json"});
 if(token)forward.set("authorization",token);
 if(session)forward.set("x-nbr-rule-session",session);
 let body:string|undefined;
 if(securePatch||securePost){
   body=await request.text();
   if(body.length>65536)return reply(413,"Payload exceeds limit");
   try{if(body)JSON.parse(body)}catch{return reply(400,"Invalid JSON")}
   forward.set("content-type","application/json");
 }
 try {
   const upstream=await fetch(target,{method:request.method,headers:forward,body,redirect:"error"});
   return new Response(upstream.body,{status:upstream.status,headers});
 }catch{
   return reply(502,"Rules service unavailable");
 }
});