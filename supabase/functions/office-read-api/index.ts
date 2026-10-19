/** Authenticated Office read gateway for all 30 existing frontend routes.
 * Supabase JWT is validated against Auth; the per-role SQL API owns access.
 * Routes return a structured source-unavailable response until an authoritative
 * upstream feed is connected. No fixture fallback or service-role browser key.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';

const FIXED_ROUTES: Record<string,string> = {
  '/dashboard/kpis': 'dashboard_kpis',
  '/dashboard/submissions/recent': 'dashboard_submissions_recent',
  '/dashboard/psr/kpis': 'dashboard_psr_kpis',
  '/dashboard/psr/circle-summary': 'dashboard_psr_circle_summary',
  '/dashboard/psr/recent': 'dashboard_psr_recent',
  '/dashboard/returns/offline-summary': 'dashboard_returns_offline_summary',
  '/dashboard/litigation/summary': 'dashboard_litigation_summary',
  '/dashboard/tax-categories': 'dashboard_tax_categories',
  '/returns/approvals': 'returns_approvals',
  '/returns/online': 'returns_online',
  '/returns/offline': 'returns_offline',
  '/returns/archive': 'returns_archive',
  '/psr/approvals': 'psr_approvals',
  '/psr/edit-requests': 'psr_edit_requests',
  '/psr/double-entry/status': 'psr_double_entry_status',
  '/psr/double-entry/verification': 'psr_double_entry_verification',
  '/psr/dormant': 'psr_dormant',
  '/appeals': 'appeals',
  '/tribunal': 'tribunal',
  '/demand-payment/demands': 'demand_payment_demands',
  '/demand-payment/refunds': 'demand_payment_refunds',
  '/certificates/requests': 'certificates_requests',
  '/certificates/edit-requests': 'certificates_edit_requests',
  '/certificates/disposals': 'certificates_disposals',
  '/admin/users': 'admin_users',
  '/admin/special-registrations': 'admin_special_registrations',
  '/admin/time-extensions': 'admin_time_extensions',
  '/admin/audit-selections': 'admin_audit_selections',
};
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store',
};
function json(value: unknown,status=200): Response {
  return new Response(JSON.stringify(value),{status,headers:{
    ...cors,'Content-Type':'application/json; charset=utf-8',
  }});
}
function resolveRoute(path: string): {route: string;extra: Record<string,string>}|null {
  const normalized=path.replace(/^\/office-read-api/, '').replace(/^\/api\/v1/,'').replace(/\/$/,'') || '/';
  const route=FIXED_ROUTES[normalized];
  if(route) return {route,extra:{}};
  const litigation=normalized.match(/^\/litigation\/([A-Za-z0-9_-]{1,60})$/);
  if(litigation) return {route:'litigation_cases',extra:{caseType:litigation[1]}};
  const ledger=normalized.match(/^\/demand-payment\/ledger\/([0-9]{12})$/);
  if(ledger) return {route:'demand_payment_ledger',extra:{tin:ledger[1]}};
  return null;
}
Deno.serve(async (request:Request)=>{
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
  if(request.method!=='GET') return json({success:false,code:'METHOD_NOT_ALLOWED'},405);
  const url=new URL(request.url);
  const contractPath=/\/_contracts\/?$/.test(url.pathname);
  const matched=contractPath ? null : resolveRoute(url.pathname);
  if(!contractPath&&!matched) return json({success:false,code:'UNKNOWN_OFFICE_ROUTE'},404);
  const header=request.headers.get('authorization') ?? '';
  const token=header.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token) return json({success:false,code:'AUTH_REQUIRED'},401);
  try{
    const base=Deno.env.get('SUPABASE_URL');
    const key=Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    if(!base||!key) throw Error('Supabase public client not configured');
    const client=createClient(base,key,{
      global:{headers:{Authorization:`Bearer ${token}`}},
      auth:{persistSession:false,autoRefreshToken:false},
    });
    const {data:userResult,error:authError}=await client.auth.getUser(token);
    if(authError||!userResult?.user) return json({success:false,code:'AUTH_REQUIRED'},401);
    if(contractPath){
      const {data,error}=await client.rpc('office_v1_contract_status');
      if(error) return formatRpcError(error.message);
      return json({success:true,data});
    }
    const page=Number(url.searchParams.get('page')??'1');
    const perPage=Number(url.searchParams.get('perPage')??'20');
    if(!Number.isInteger(page)||page<1||page>100000||
       !Number.isInteger(perPage)||perPage<1||perPage>100)
      return json({success:false,code:'INVALID_QUERY_PARAMETERS'},400);
    const filters: Record<string,string>={...matched!.extra};
    const allowed=new Set(['search','circle','zone','assessmentYear','status','fromDate','toDate']);
    for(const [key,value] of url.searchParams){
      if(key==='page'||key==='perPage') continue;
      if(!allowed.has(key)||value.length>100) return json({success:false,code:'INVALID_QUERY_FILTER'},400);
      filters[key]=value;
    }
    const {data,error}=await client.rpc('office_v1_query',{
      p_route:matched!.route,p_page:page,p_per_page:perPage,p_filters:filters,
    });
    if(error) return formatRpcError(error.message);
    return json(data);
  }catch(error){
    console.error('office-read-api failed',error instanceof Error?error.message:'Unknown');
    return json({success:false,code:'INTERNAL_ERROR'},500);
  }
});
function formatRpcError(detail:string):Response{
  if(detail.includes('OFFICE_ROLE_REQUIRED')) return json({success:false,code:'FORBIDDEN'},403);
  if(detail.includes('OFFICE_SOURCE_NOT_CONNECTED')||detail.includes('OFFICE_SOURCE_EMPTY'))
    return json({success:false,code:'SOURCE_NOT_CONNECTED'},424);
  if(detail.includes('UNKNOWN_OFFICE_ROUTE')) return json({success:false,code:'NOT_FOUND'},404);
  if(detail.includes('INVALID_QUERY_')||detail.includes('UNKNOWN_QUERY_FILTER'))
    return json({success:false,code:'INVALID_QUERY_PARAMETERS'},400);
  console.error('office-read-api rpc failure',detail);
  return json({success:false,code:'INTERNAL_ERROR'},500);
}
