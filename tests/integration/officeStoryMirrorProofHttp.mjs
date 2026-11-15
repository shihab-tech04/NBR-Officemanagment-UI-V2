/** WS3 Office Edge ingress guard: execute the actual shipped handler.
 * No hosted requests, no SQL writes, no mock approval of a source payment.
 */
import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import vm from 'node:vm';
import {transformSync} from 'esbuild';

const source=readFileSync('supabase/functions/demo-story1-office/index.ts','utf8');
const compiled=transformSync(source,{loader:'ts',format:'cjs',target:'es2022'}).code;
let handler=null,remoteCalls=0,sqlCalls=0;
const module={exports:{}};
const box={
 console,URL,Response,Request,Headers,TextEncoder,AbortSignal,BigInt,
 module,exports:module.exports,
 require(name){
  assert.match(name,/^npm:@supabase\/supabase-js@/);
  return {createClient:()=>({rpc:async()=>{sqlCalls++;throw Error('Never read SQL without valid proof');}})};
 },
 fetch:async()=>{remoteCalls++;throw Error('Never fetch source without valid proof');},
 Deno:{
  env:{get(key){
   if(key==='SUPABASE_ANON_KEY')return 'isolated-publishable';
   if(key==='SUPABASE_URL')return 'https://isolated-office.invalid';
   return null;
  }},
  serve(callback){handler=callback;}
 }
};
vm.runInNewContext(compiled,box,{filename:'office-story-mirror-proof.ts',timeout:5000});
assert.equal(typeof handler,'function');
const id='11111111-2222-4333-8444-555555555555';
const sessionId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const url='http://127.0.0.1/demo-story1-office/mirror';
async function request(body,proof){
 const headers={'Content-Type':'application/json'};
 if(proof!==undefined)headers['x-taxpay-office-mirror-proof']=proof;
 const response=await handler(new Request(url,{method:'POST',headers,body:JSON.stringify(body)}));
 return {status:response.status,body:await response.json()};
}
let result=await request({id,sessionId});
assert.equal(result.status,403);assert.equal(result.body.error,'MIRROR_PROOF_REQUIRED');
result=await request({id,sessionId},'not-a-proof');
assert.equal(result.status,403);
result=await request({id,sessionId},'v1.0000000000.'+'a'.repeat(42));
assert.equal(result.status,403);
result=await request({id:'not-a-uuid',sessionId},'v1.1234567890.'+'a'.repeat(43));
assert.equal(result.status,400);
result=await request({id,sessionId:'not-a-uuid'},'v1.1234567890.'+'a'.repeat(43));
assert.equal(result.status,400);
assert.equal(remoteCalls,0,'Missing/invalid proof caused a privileged source fetch');
assert.equal(sqlCalls,0,'Missing/invalid proof caused a privileged Office SQL call');
const methods=await handler(new Request(url,{method:'OPTIONS'}));
assert.equal(methods.status,204);
console.log('PASS: real Office Edge handler requires source-bound proof at ingress, malformed IDs and proofs fail before network/SQL, preflight preserved; no hosted access');


// WS3 authorization mirror: the real Edge handler must source-read the
// synthetic authorization first, then use the service key for its private RPC.
// A caller's forged status is never forwarded to Office SQL.
let authMirrorHandler=null,authSourceReads=0;
const authMirrorSql=[];
const sourceAuthorization={id,status:'PENDING',payerId:'user1',taxpayerId:'user2'};
const authMirrorBox={
 ...box,
 require(name){
  assert.match(name,/^npm:@supabase\\/supabase-js@/);
  return {createClient:(_url,roleKey)=>({
   rpc:async(name,args)=>{
    authMirrorSql.push({name,args,roleKey});
    return {data:{id,status:'PENDING'},error:null};
   }
  })};
 },
 fetch:async(sourceUrl)=>{
  authSourceReads++;
  assert.ok(sourceUrl.endsWith('/authorizations/'+id+'/snapshot'));
  return new Response(JSON.stringify({success:true,data:sourceAuthorization}),{status:200});
 },
 Deno:{env:{get(name){
   if(name==='SUPABASE_ANON_KEY')return 'isolated-public-key';
   if(name==='SUPABASE_URL')return 'https://isolated-office.invalid';
   if(name==='SUPABASE_SERVICE_ROLE_KEY')return 'isolated-private-office-key';
   return null;
 }},serve(callback){authMirrorHandler=callback;}},
};
vm.runInNewContext(compiled,authMirrorBox,{filename:'office-private-auth-mirror.ts',timeout:5000});
const authorizationUrl='http://127.0.0.1/demo-story1-office/authorization/mirror';
let authResponse=await authMirrorHandler(new Request(authorizationUrl,{
 method:'POST',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({id,status:'SIMULATED_SUCCESS'})
}));
assert.equal(authResponse.status,200);
assert.equal(authSourceReads,1);
assert.equal(authMirrorSql.length,1);
assert.equal(authMirrorSql[0].name,'demo_auth_office_mirror');
assert.equal(authMirrorSql[0].roleKey,'isolated-private-office-key');
assert.equal(authMirrorSql[0].args.p_input.status,'PENDING');
authResponse=await authMirrorHandler(new Request(authorizationUrl,{
 method:'POST',body:JSON.stringify({id:'invalid',status:'COMPLETED'})
}));
assert.equal(authResponse.status,400);
assert.equal(authSourceReads,1);
assert.equal(authMirrorSql.length,1);
console.log('PASS: authorization snapshot source-read before service-only Office RPC; forged caller status discarded; invalid ID denied');

// WS2/WS3 Office notice cursor bearer contract: the *actual* Edge handler
// rejects anonymous and bad-session reads before any Office SQL request.
let cursorHandler=null;
const verifiedTokens=[],noticeSql=[];
const validToken='isolated-active-officer-jwt';
const cursorBox={
 ...box,
 require(name){
   assert.match(name,/^npm:@supabase\/supabase-js@/);
   return {createClient:(_url,_key,opts)=>({
     auth:{getUser:async(token)=>{
       verifiedTokens.push(token);
       return token===validToken
         ? {data:{user:{id:'80000000-0000-4000-8000-000000000011',is_anonymous:false}},error:null}
         : {data:{user:null},error:{message:'unauthorized'}};
     }},
     rpc:async(name,args)=>{
       noticeSql.push({name,args,bearer:opts?.global?.headers?.Authorization});
       const exactId='9007199254740993';
       return {data:{items:[{
         id:exactId,paymentId:id,type:'NEW_SIMULATED_PAYMENT',createdAt:'2026-11-14T00:00:00Z',
         payment:{id,service:'ADVANCE_TAX',amountMinor:'125050',
           status:'SIMULATED_SUCCESS',createdAt:'2026-11-14T00:00:00Z'}
       }],nextAfterId:exactId,hasMore:false},error:null};
     },
   })};
 },
 Deno:{...box.Deno,serve(callback){cursorHandler=callback;}},
};
vm.runInNewContext(compiled,cursorBox,{filename:'office-notice-auth.ts',timeout:5000});
assert.equal(typeof cursorHandler,'function');
const cursorUrl='http://127.0.0.1/demo-story1-office/notifications/page?afterId=0&limit=100';
async function cursorRequest(address,bearer){
 const headers={};
 if(bearer!==undefined)headers.Authorization=bearer;
 const response=await cursorHandler(new Request(address,{method:'GET',headers}));
 return {status:response.status,body:await response.json()};
}
let cursor=await cursorRequest(cursorUrl);
assert.equal(cursor.status,401);
assert.equal(cursor.body.error,'OFFICE_OFFICER_AUTH_REQUIRED');
cursor=await cursorRequest(cursorUrl,'Bearer invalid-token');
assert.equal(cursor.status,401);
cursor=await cursorRequest(cursorUrl+'0','Bearer '+validToken);
assert.equal(cursor.status,400);
assert.equal(noticeSql.length,0,'Anonymous/invalid cursor reached Office SQL');
cursor=await cursorRequest(cursorUrl,'Bearer '+validToken);
assert.equal(cursor.status,200);
assert.equal(cursor.body.success,true);
assert.equal(cursor.body.data.items[0].id,'9007199254740993');
assert.equal(cursor.body.data.items[0].payment.amountMinor,'125050');
assert.equal(noticeSql.length,1);
assert.equal(noticeSql[0].name,'demo_story1_office_notice_page');
assert.equal(noticeSql[0].args.p_after_id,'0');
assert.equal(noticeSql[0].bearer,'Bearer '+validToken);
assert.deepEqual(verifiedTokens,['invalid-token',validToken]);
assert.equal((await cursorHandler(new Request(cursorUrl,{method:'OPTIONS'}))).status,204);
console.log('PASS: real Office notice Edge handler denies anonymous/invalid bearer, forwards existing officer token, keeps bigint IDs precise, and preserves CORS preflight');

// WS5 legacy Office payment and notice endpoints must reject anonymous
// callers before SQL, then forward the existing verified officer session.
const legacyCases=[
  ['/payments?page=1&perPage=100','payment_v1_office_guarded_story_page'],
  ['/notifications','payment_v1_office_guarded_story_notices']
];
for(const [route,expectedRpc] of legacyCases){
 const address='http://127.0.0.1/demo-story1-office'+route;
 const before=noticeSql.length;
 let observed=await cursorRequest(address);
 assert.equal(observed.status,401,'Anonymous Office '+route+' must fail closed');
 assert.equal(observed.body.error,'OFFICE_OFFICER_AUTH_REQUIRED');
 observed=await cursorRequest(address,'Bearer invalid-token');
 assert.equal(observed.status,401,'Invalid Office token must not read '+route);
 assert.equal(noticeSql.length,before,'Anonymous Office '+route+' reached SQL');
 observed=await cursorRequest(address,'Bearer '+validToken);
 assert.equal(observed.status,200,'Authorized Office officer must retain '+route);
 assert.equal(observed.body.success,true);
 assert.equal(noticeSql.length,before+1);
 assert.equal(noticeSql.at(-1).name,expectedRpc);
 assert.equal(noticeSql.at(-1).bearer,'Bearer '+validToken);
}
console.log('PASS: legacy payment and notices Edge reads reject anonymous/invalid bearer, forward verified Office officer bearer to role-guarded SQL, and preserve existing source projection');


// WS3 Pay Again readback: the existing Office Auth bearer must be verified
// before requesting the new read-only, role-guarded SQL lineage function.
// Synthetic identity is a local JS stub only, never a hosted officer grant.
let lineageHandler=null;
const lineageCalls=[];
const repeatId='33333333-2222-4333-8444-555555555555';
const sourceId='44444444-2222-4333-8444-555555555555';
const lineagePayload={
 paymentId:repeatId,sourcePaymentId:sourceId,sourceMirrored:true,
 payerId:'user1',sourceReceiptReference:'SIM-SOURCE',repeatReceiptReference:'SIM-REPEAT',
 sourceCertificateReference:'SK-PC-'+sourceId,
 repeatCertificateReference:'SK-PC-'+repeatId,
 sourceAllocations:[{allocationId:'old-line-1',taxpayerTin:'222222222222',
   headId:121,assessmentYear:'2026-27',amountMinor:1500}],
 repeatAllocations:[{allocationId:'new-line-1',taxpayerTin:'222222222222',
   headId:121,assessmentYear:'2025-26',amountMinor:2000}]
};
const lineageBox={
 ...box,
 require(name){
   assert.match(name,/^npm:@supabase\/supabase-js@/);
   return {createClient:(_url,_key,opts)=>({
     auth:{getUser:async(token)=>token===validToken
       ?{data:{user:{id:'80000000-0000-4000-8000-000000000011',
          is_anonymous:false}},error:null}
       :{data:{user:null},error:{message:'Unauthorized'}}},
     rpc:async(name,args)=>{
       lineageCalls.push({name,args,bearer:opts?.global?.headers?.Authorization});
       return {data:lineagePayload,error:null};
     },
   })};
 },
 Deno:{...box.Deno,serve(callback){lineageHandler=callback;}},
};
vm.runInNewContext(compiled,lineageBox,{filename:'office-pay-again-auth.ts',timeout:5000});
const lineageAddress='http://127.0.0.1/demo-story1-office/payments/'+repeatId+'/lineage';
async function queryLineage(url,bearer){
 const headers=bearer?{Authorization:bearer}:{};
 const response=await lineageHandler(new Request(url,{method:'GET',headers}));
 return {status:response.status,body:await response.json()};
}
let lineage=await queryLineage(lineageAddress);
assert.equal(lineage.status,401);
assert.equal(lineage.body.error,'OFFICE_OFFICER_AUTH_REQUIRED');
lineage=await queryLineage(lineageAddress,'Bearer invalid-token');
assert.equal(lineage.status,401);
lineage=await queryLineage(
 'http://127.0.0.1/demo-story1-office/payments/not-a-uuid/lineage','Bearer '+validToken);
assert.equal(lineage.status,400);
assert.equal(lineageCalls.length,0,'Invalid Office bearer/id reached Pay Again SQL');
lineage=await queryLineage(lineageAddress,'Bearer '+validToken);
assert.equal(lineage.status,200);
assert.equal(lineage.body.success,true);
assert.equal(lineage.body.data.sourcePaymentId,sourceId);
assert.equal(lineage.body.data.sourceCertificateReference,'SK-PC-'+sourceId);
assert.equal(lineageCalls.length,1);
assert.equal(lineageCalls[0].name,'payment_v1_office_guarded_pay_again_lineage');
assert.equal(lineageCalls[0].args.p_payment_id,repeatId);
assert.equal(lineageCalls[0].bearer,'Bearer '+validToken);
console.log('PASS WS3 Office Pay Again Edge: invalid bearer, anonymous and invalid ID denied before SQL; verified JWT reaches existing role-guarded lineage RPC, preserving original and repeat references');
