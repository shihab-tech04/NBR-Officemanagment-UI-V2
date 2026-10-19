/** Office Management v1: public, synthetic-only handoff API.
 * This function never calls the protected office_v1_query, payment_v1_*
 * RPCs, or any real taxpayer source. Synthetic TaxPay transactions are read
 * through the corresponding public-only TaxPay handoff gateway.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';

const ROUTES: Record<string,string> = {
  '/dashboard/kpis':'dashboard_kpis',
  '/dashboard/submissions/recent':'dashboard_submissions_recent',
  '/dashboard/psr/kpis':'dashboard_psr_kpis',
  '/dashboard/psr/circle-summary':'dashboard_psr_circle_summary',
  '/dashboard/psr/recent':'dashboard_psr_recent',
  '/dashboard/returns/offline-summary':'dashboard_returns_offline_summary',
  '/dashboard/litigation/summary':'dashboard_litigation_summary',
  '/dashboard/tax-categories':'dashboard_tax_categories',
  '/returns/approvals':'returns_approvals',
  '/returns/online':'returns_online',
  '/returns/offline':'returns_offline',
  '/returns/archive':'returns_archive',
  '/psr/approvals':'psr_approvals',
  '/psr/edit-requests':'psr_edit_requests',
  '/psr/double-entry/status':'psr_double_entry_status',
  '/psr/double-entry/verification':'psr_double_entry_verification',
  '/psr/dormant':'psr_dormant',
  '/appeals':'appeals',
  '/tribunal':'tribunal',
  '/demand-payment/demands':'demand_payment_demands',
  '/demand-payment/refunds':'demand_payment_refunds',
  '/certificates/requests':'certificates_requests',
  '/certificates/edit-requests':'certificates_edit_requests',
  '/certificates/disposals':'certificates_disposals',
  '/admin/users':'admin_users',
  '/admin/special-registrations':'admin_special_registrations',
  '/admin/time-extensions':'admin_time_extensions',
  '/admin/audit-selections':'admin_audit_selections',
};
const CORS = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS',
  'Cache-Control':'no-store',
};
function respond(payload:unknown,status=200):Response {
  return new Response(JSON.stringify(payload),{
    status,headers:{...CORS,'Content-Type':'application/json; charset=utf-8'},
  });
}
function matchRoute(path:string):{name:string;filters:Record<string,string>}|null {
  const normalized=path.replace(/^\/office-handoff-api/,'')
    .replace(/^\/api\/v1/,'').replace(/\/$/,'')||'/';
  if(ROUTES[normalized])return{name:ROUTES[normalized],filters:{}};
  const litigation=normalized.match(/^\/litigation\/([A-Za-z0-9_-]{1,60})$/);
  if(litigation)return{name:'litigation_cases',filters:{caseType:litigation[1]}};
  const ledger=normalized.match(/^\/demand-payment\/ledger\/([0-9]{12}|DEMO-TIN-[0-9]{3})$/);
  if(ledger)return{name:'demand_payment_ledger',filters:{tin:ledger[1]}};
  return null;
}
const TAXPAY_HANDOFF='https://eyqhoavnitkrajvyqvxn.supabase.co/functions/v1/taxpay-handoff-api/api/v1';
const uuidRE=/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function proxyPath(request:Request,url:URL):string|null {
  const path=url.pathname.replace(/^\/office-handoff-api/,'')
    .replace(/^\/api\/v1/,'').replace(/\/$/,'');
  if(path==='/payments/transactions'&&request.method==='GET'){
    const n=Number(url.searchParams.get('limit')??'100');
    if(!Number.isInteger(n)||n<1||n>100)return null;
    return '/office/inbox?limit='+n;
  }
  const m=path.match(/^\/payments\/transactions\/([0-9a-fA-F-]{36})(\/review|\/state)?$/);
  if(!m||!uuidRE.test(m[1]))return null;
  if(request.method==='GET'&&!m[2])return '/payments/'+m[1];
  if(request.method==='POST'&&m[2]==='/review')
    return '/office/payments/'+m[1]+'/review';
  if(request.method==='POST'&&m[2]==='/state')
    return '/office/payments/'+m[1]+'/state';
  return null;
}
function sampleActionPath(path:string):{route:string;sampleId:string;kind:string}|null {
  const normalized=path.replace(/^\/office-handoff-api/,'')
    .replace(/^\/api\/v1/,'').replace(/\/$/,'');
  const match=normalized.match(/^(.*)\/(SAMPLE-[0-9]{3})\/(status|history)$/);
  if(!match)return null;
  const source=matchRoute('/office-handoff-api/api/v1'+match[1]);
  return source?{route:source.name,sampleId:match[2],kind:match[3]}:null;
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
  const url=new URL(req.url);
  const proxied=proxyPath(req,url);
  if(proxied){
    try{
      const body=req.method==='POST'?await req.text():undefined;
      if(body&&body.length>4096)
        return respond({success:false,code:'INVALID_BODY_SIZE'},400);
      const upstream=await fetch(TAXPAY_HANDOFF+proxied,{
        method:req.method,
        headers:{'Content-Type':'application/json'},
        body,signal:AbortSignal.timeout(10000),
      });
      const response=await upstream.text();
      return new Response(response,{
        status:upstream.status,headers:{...CORS,'Content-Type':'application/json; charset=utf-8'},
      });
    }catch(error){
      console.error('synthetic TaxPay bridge:',error instanceof Error?error.message:'unknown');
      return respond({success:false,code:'TAXPAY_HANDOFF_UNAVAILABLE'},502);
    }
  }
  const actionPath=sampleActionPath(url.pathname);
  if(actionPath){
    if(!((actionPath.kind==='history'&&req.method==='GET')||
       (actionPath.kind==='status'&&req.method==='PATCH')))
      return respond({success:false,code:'METHOD_NOT_ALLOWED'},405);
    const endpoint=Deno.env.get('SUPABASE_URL');
    const key=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    if(!endpoint||!key)return respond({success:false,code:'BACKEND_NOT_CONFIGURED'},503);
    try{
      const client=createClient(endpoint,key,{auth:{persistSession:false,autoRefreshToken:false}});
      let rpc:string;
      let args:Record<string,unknown>;
      if(actionPath.kind==='history'){
        rpc='office_v1_handoff_status_history';
        args={p_route:actionPath.route,p_sample_id:actionPath.sampleId,p_limit:100};
      }else{
        const body=await req.text();
        if(body.length>2048)return respond({success:false,code:'INVALID_BODY_SIZE'},400);
        const input=JSON.parse(body);
        if(!input||typeof input!=='object'||Array.isArray(input))
          return respond({success:false,code:'INVALID_BODY'},400);
        rpc='office_v1_handoff_set_status';
        args={p_route:actionPath.route,p_sample_id:actionPath.sampleId,
          p_new_status:input.status,p_actor_code:input.actorCode,
          p_reason:input.reason,p_idempotency_key:input.idempotencyKey,
          p_expected_revision:input.expectedRevision??null};
      }
      const {data,error}=await client.rpc(rpc,args);
      if(error){
        const detail=error.message;
        const status=/RECORD_NOT_FOUND/.test(detail)?404:
          /CONFLICT|COLLISION|UNCHANGED|LIMIT/.test(detail)?409:
          /INVALID_|NOT_IN_ROUTE_CONTRACT|NOT_SUPPORTED/.test(detail)?400:500;
        if(status===500)console.error('sample status:',detail);
        return respond({success:false,code:status===500?'BACKEND_ERROR':detail.split(':')[0]},status);
      }
      return respond({success:true,data,origin:'SYNTHETIC_HANDOFF'});
    }catch(error){
      console.error('sample action:',error instanceof Error?error.message:'unknown');
      return respond({success:false,code:'INVALID_BODY'},400);
    }
  }
  if(req.method!=='GET')return respond({success:false,code:'METHOD_NOT_ALLOWED'},405);
  const matched=matchRoute(url.pathname);
  if(!matched)return respond({success:false,code:'UNKNOWN_OFFICE_ROUTE'},404);
  const page=Number(url.searchParams.get('page')??'1');
  const perPage=Number(url.searchParams.get('perPage')??'20');
  if(!Number.isInteger(page)||page<1||page>100000||
     !Number.isInteger(perPage)||perPage<1||perPage>100)
    return respond({success:false,code:'INVALID_QUERY_PARAMETERS'},400);
  const filters:Record<string,string>={...matched.filters};
  const allowed=new Set(['search','circle','zone','assessmentYear',
    'status','fromDate','toDate']);
  for(const [key,value] of url.searchParams){
    if(key==='page'||key==='perPage')continue;
    if(!allowed.has(key)||value.length>100)
      return respond({success:false,code:'INVALID_QUERY_FILTER'},400);
    filters[key]=value;
  }
  // Reject invalid calendar dates and inverted intervals at the HTTP boundary.
  const parseDate=(value:string|null):boolean=>{
    if(value===null||value==='')return true;
    if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(value))return false;
    const [y,m,d]=value.split('-').map(Number);
    const parsed=new Date(Date.UTC(y,m-1,d));
    return parsed.getUTCFullYear()===y&&parsed.getUTCMonth()+1===m&&parsed.getUTCDate()===d;
  };
  const fromDate=filters.fromDate??null,toDate=filters.toDate??null;
  if(!parseDate(fromDate)||!parseDate(toDate)||
      (fromDate&&toDate&&fromDate>toDate))
    return respond({success:false,code:'INVALID_DATE_FILTER'},400);
  const endpoint=Deno.env.get('SUPABASE_URL');
  const key=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  if(!endpoint||!key)return respond({success:false,code:'BACKEND_NOT_CONFIGURED'},503);
  try{
    const client=createClient(endpoint,key,{
      auth:{persistSession:false,autoRefreshToken:false},
    });
    const {data,error}=await client.rpc('office_v1_handoff_query',{
      p_route:matched.name,p_page:page,p_per_page:perPage,p_filters:filters,
    });
    if(error){
      if(/INVALID_QUERY|INVALID_DATE_FILTER|INVALID_QUERY_FILTER/.test(error.message))
        return respond({success:false,code:'INVALID_QUERY_PARAMETERS'},400);
      console.error('handoff API:',error.message);
      return respond({success:false,code:'BACKEND_ERROR'},500);
    }
    return respond(data);
  }catch(e){
    console.error('handoff API:',e instanceof Error?e.message:'unknown error');
    return respond({success:false,code:'BACKEND_ERROR'},500);
  }
});
