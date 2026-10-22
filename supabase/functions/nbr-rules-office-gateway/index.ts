import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const allowedOrigins=new Set(["https://shihab-tech04.github.io","http://localhost:5173"]);
function headers(origin:string|null):HeadersInit {
  return {
    "Access-Control-Allow-Origin":origin && allowedOrigins.has(origin)?origin:"https://shihab-tech04.github.io",
    "Access-Control-Allow-Headers":"authorization, x-nbr-rule-session, apikey, content-type",
    "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
    "Content-Type":"application/json",
    "Cache-Control":"no-store",
    "Vary":"Origin"
  };
}
Deno.serve(async (request:Request)=>{
 const origin=request.headers.get("origin");
 const common=headers(origin);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:common});
 const sessionAuto = request.method==="POST" && new URL(request.url).pathname.endsWith("/session/auto");
 if(request.method!=="GET"&&!sessionAuto)return Response.json({error:"Method not allowed"},{status:405,headers:common});
 if(origin&&!allowedOrigins.has(origin))return Response.json({error:"Origin not allowed"},{status:403,headers:common});
 const incoming=new URL(request.url);
 const parts=incoming.pathname.split("/").filter(Boolean);
 const pos=parts.lastIndexOf("nbr-rules-office-gateway");
 const route=parts.slice(pos+1);
 const verb=route[0]||"";
 const valid=sessionAuto||(verb==="public"&&route.length===2&&route[1]==="years")||
  (["years","groups","summary","gates","audit","engine-parameters"].includes(verb)&&route.length===1)||
  (verb==="rules"&&route.length<=2&&(!route[1]||/^[A-Za-z0-9_-]{1,100}$/.test(route[1])));
 if(!valid)return Response.json({error:"Route not found"},{status:404,headers:common});
 const token=request.headers.get("authorization");
 const ruleSession=request.headers.get("x-nbr-rule-session");
 if(verb!=="public"&&(!token||!token.startsWith("Bearer ")||(!ruleSession&&!sessionAuto)))
  return Response.json({error:"Administrator authentication required"},{status:401,headers:common});
 const base=Deno.env.get("SUPABASE_URL");
 if(!base)return Response.json({error:"Project configuration missing"},{status:503,headers:common});
 const target=new URL(base+"/functions/v1/nbr-rules-api/"+route.map(encodeURIComponent).join("/"));
 target.search=incoming.search;
 const forward=new Headers({"accept":"application/json"});
 if(token)forward.set("authorization",token);
 if(ruleSession)forward.set("x-nbr-rule-session",ruleSession);
 const reply=await fetch(target,{method:request.method,headers:forward,redirect:"error"});
 const responseHeaders=new Headers(common);
 return new Response(reply.body,{status:reply.status,headers:responseHeaders});
});