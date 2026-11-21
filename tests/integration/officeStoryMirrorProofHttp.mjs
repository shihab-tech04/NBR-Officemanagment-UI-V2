/** WS3 Office Edge ingress guard: execute the actual shipped handler.
 * No hosted requests, no SQL writes, no mock approval of a source payment.
 */
import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
import vm from 'node:vm';
import {transformSync} from 'esbuild';

// Load the same allowlisted local routing helper imported by the production Edge.
// Retain the fail-closed npm and local import restrictions in the test VM.
function loadOfficeLocalModule(specifier){
 assert.equal(specifier,'./mirrorSource.ts','Unexpected local Edge dependency');
 const sourceFile='supabase/functions/demo-story1-office/mirrorSource.ts';
 const sourceCode=readFileSync(sourceFile,'utf8');
 const js=transformSync(sourceCode,{loader:'ts',format:'cjs',target:'es2022'}).code;
 const isolated={exports:{}};
 vm.runInNewContext(js,{module:isolated,exports:isolated.exports,URL,Object,Error},
  {filename:sourceFile,timeout:5000});
 return isolated.exports;
}

const source=readFileSync('supabase/functions/demo-story1-office/index.ts','utf8');
const compiled=transformSync(source,{loader:'ts',format:'cjs',target:'es2022'}).code;
// Resolve the actual allowlisted source helper in each isolated Edge VM.
// Never substitute a permissive stub for payment-source authorization.
const mirrorSourceModule={exports:{}};
vm.runInNewContext(transformSync(
 readFileSync('supabase/functions/demo-story1-office/mirrorSource.ts','utf8'),
 {loader:'ts',format:'cjs',target:'es2022'}).code,
 {module:mirrorSourceModule,exports:mirrorSourceModule.exports,URL},
 {filename:'office-mirror-source.ts',timeout:5000});

let handler=null,remoteCalls=0,sqlCalls=0;
const module={exports:{}};
const box={
 console,URL,Response,Request,Headers,TextEncoder,AbortSignal,BigInt,
 module,exports:module.exports,
 require(name){
  if(name==='./mirrorSource.ts')return mirrorSourceModule.exports;
  if(name.startsWith('./'))return loadOfficeLocalModule(name);
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

// A valid proof still cannot make the caller's project label authoritative.
// Office must compare the requested route with the marker returned by the
// selected Taxpayer SQL Edge before it invokes the private mirror RPC.
let provenanceHandler=null,provenanceSourceReads=0;
const provenanceSql=[];
const sourceRecord={id,data:{service:'ADVANCE_TAX',amountMinor:1250,
  details:{payerTin:'111111111111',allocations:[{taxpayerTin:'222222222222',amountMinor:1250}]}},
  status:'SIMULATED_SUCCESS',createdAt:'2026-11-20T09:00:00.000Z',
  sourceProject:'original',sourceParentId:null,sourceRevision:'a'.repeat(64)};
const provenanceBox={
 ...box,
 require(name){
  if(name==='./mirrorSource.ts')return mirrorSourceModule.exports;
  if(name.startsWith('./'))return loadOfficeLocalModule(name);
  assert.match(name,/^npm:@supabase\/supabase-js@/);
  return {createClient:(_url,roleKey)=>({rpc:async(name,args)=>{
    provenanceSql.push({name,args,roleKey});
    return {data:{id,mirrored:true,replayed:false},error:null};
  }})};
 },
 fetch:async(sourceUrl,init)=>{
  provenanceSourceReads++;
  assert.ok(sourceUrl.endsWith('/payments/'+id+'?sessionId='+sessionId));
  assert.match(init?.headers?.['x-taxpay-office-mirror-proof']??'',/^v1\.[0-9]{10}\.[A-Za-z0-9_-]{43}$/);
  return new Response(JSON.stringify({success:true,simulationOnly:true,data:sourceRecord}),{status:200});
 },
 Deno:{env:{get(name){
   if(name==='SUPABASE_ANON_KEY')return 'isolated-public-key';
   if(name==='SUPABASE_URL')return 'https://isolated-office.invalid';
   if(name==='SUPABASE_SERVICE_ROLE_KEY')return 'isolated-private-office-key';
   return null;
 }},serve(callback){provenanceHandler=callback;}},
};
vm.runInNewContext(compiled,provenanceBox,{filename:'office-story-mirror-provenance.ts',timeout:5000});
const provenanceProof='v1.1234567890.'+'A'.repeat(43);
let provenanceResponse=await provenanceHandler(new Request(url,{method:'POST',
 headers:{'Content-Type':'application/json','x-taxpay-office-mirror-proof':provenanceProof},
 body:JSON.stringify({id,sessionId,sourceProject:'original'})}));
assert.equal(provenanceResponse.status,200);
assert.equal(provenanceSourceReads,1);
assert.equal(provenanceSql.length,1);
assert.equal(provenanceSql[0].name,'demo_story1_mirror');
assert.equal(provenanceSql[0].roleKey,'isolated-private-office-key');
assert.equal(provenanceSql[0].args.p_input.sourceProject,'original');
assert.equal(provenanceSql[0].args.p_input.sourceParentId,null);
assert.equal(provenanceSql[0].args.p_input.sourceRevision,'a'.repeat(64));
assert.equal(provenanceSql[0].args.p_input.data.details.payerTin,'111111111111');
assert.equal(provenanceSql[0].args.p_input.data.details.sourceProject,undefined,
  'Provenance must not mutate the original Taxpayer payment JSON');
provenanceResponse=await provenanceHandler(new Request(url,{method:'POST',
 headers:{'Content-Type':'application/json','x-taxpay-office-mirror-proof':provenanceProof},
 body:JSON.stringify({id,sessionId,sourceProject:'v2'})}));
assert.equal(provenanceResponse.status,424);
assert.equal((await provenanceResponse.json()).error,'SOURCE_PROVENANCE_INVALID');
assert.equal(provenanceSourceReads,2);
assert.equal(provenanceSql.length,1,'A forged source-project marker reached private Office SQL');
console.log('PASS: Office persists only the project marker returned by signed Taxpayer SQL, captures parent/revision, preserves source JSON and blocks project-mismatch before SQL');


// WS3 authorization mirror: the real Edge handler must source-read the
// synthetic authorization first, then use the service key for its private RPC.
// A caller's forged status is never forwarded to Office SQL.
let authMirrorHandler=null,authSourceReads=0;
const authMirrorSql=[];
const authProof='v1.1234567890.'+'A'.repeat(43);
const sourceAuthorization={id,status:'PENDING',payerId:'user1',taxpayerId:'user2'};
const authMirrorBox={
 ...box,
 require(name){
  if(name==='./mirrorSource.ts')return mirrorSourceModule.exports;
  if(name.startsWith('./'))return loadOfficeLocalModule(name);
  assert.ok(name.startsWith('npm:@supabase/supabase-js@'));
  return {createClient:(_url,roleKey)=>({
   rpc:async(name,args)=>{
    authMirrorSql.push({name,args,roleKey});
    return {data:{id,status:'PENDING'},error:null};
   }
  })};
 },
 fetch:async(sourceUrl,init)=>{
  authSourceReads++;
  assert.ok(sourceUrl.endsWith('/authorizations/'+id+'/snapshot'));
  assert.equal(init?.headers?.['x-taxpay-office-authorization-proof'],authProof);
  return new Response(JSON.stringify({success:true,simulationOnly:true,data:sourceAuthorization}),{status:200});
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
assert.equal(authResponse.status,403);
assert.equal((await authResponse.json()).error,'AUTHORIZATION_MIRROR_PROOF_REQUIRED');
assert.equal(authSourceReads,0);
assert.equal(authMirrorSql.length,0);
authResponse=await authMirrorHandler(new Request(authorizationUrl,{
 method:'POST',headers:{'Content-Type':'application/json',
  'x-taxpay-office-authorization-proof':'forged'},
 body:JSON.stringify({id})
}));
assert.equal(authResponse.status,403);
assert.equal(authSourceReads,0);
assert.equal(authMirrorSql.length,0);
authResponse=await authMirrorHandler(new Request(authorizationUrl,{
 method:'POST',headers:{'Content-Type':'application/json',
  'x-taxpay-office-authorization-proof':authProof},
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
console.log('PASS: authorization mirror rejects missing/malformed proofs before network/SQL, forwards proof to Taxpayer source, uses private Office RPC only after verified source readback, and rejects forged caller status');

// WS2/WS3 Office notice cursor bearer contract: the *actual* Edge handler
// rejects anonymous and bad-session reads before any Office SQL request.
let cursorHandler=null;
const verifiedTokens=[],noticeSql=[];
const validToken='isolated-active-officer-jwt';
const cursorBox={
 ...box,
 require(name){
  if(name==='./mirrorSource.ts')return mirrorSourceModule.exports;
   if(name.startsWith('./'))return loadOfficeLocalModule(name);
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
  if(name==='./mirrorSource.ts')return mirrorSourceModule.exports;
   if(name.startsWith('./'))return loadOfficeLocalModule(name);
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

// F-178 Office document/audit readback uses the same officer-authenticated
// Edge path and validates the full approved Unicode envelope without truncation.
let remarksHandler=null;
const remarksCalls=[];
const maximumRemarks='😀'.repeat(4000);
const remarksPayload={paymentId:repeatId,challanRemarks:maximumRemarks,receiptReference:'SIM-REMARKS'};
const remarksBox={
 ...box,
 require(name){
  if(name==='./mirrorSource.ts')return mirrorSourceModule.exports;
  if(name.startsWith('./'))return loadOfficeLocalModule(name);
  assert.match(name,/^npm:@supabase\/supabase-js@/);
  return {createClient:(_url,_key,opts)=>({
   auth:{getUser:async(token)=>token===validToken
    ?{data:{user:{id:'80000000-0000-4000-8000-000000000011',is_anonymous:false}},error:null}
    :{data:{user:null},error:{message:'Unauthorized'}}},
   rpc:async(name,args)=>{
    remarksCalls.push({name,args,bearer:opts?.global?.headers?.Authorization});
    return {data:remarksPayload,error:null};
   },
  })};
 },
 Deno:{...box.Deno,serve(callback){remarksHandler=callback;}},
};
vm.runInNewContext(compiled,remarksBox,{filename:'office-challan-remarks-auth.ts',timeout:5000});
const remarksAddress='http://127.0.0.1/demo-story1-office/payments/'+repeatId+'/remarks';
async function queryRemarks(url,bearer){
 const headers=bearer?{Authorization:bearer}:{};
 const response=await remarksHandler(new Request(url,{method:'GET',headers}));
 return {status:response.status,body:await response.json()};
}
let remarksReadback=await queryRemarks(remarksAddress);
assert.equal(remarksReadback.status,401);
assert.equal(remarksReadback.body.error,'OFFICE_OFFICER_AUTH_REQUIRED');
remarksReadback=await queryRemarks(
 'http://127.0.0.1/demo-story1-office/payments/not-a-uuid/remarks','Bearer '+validToken);
assert.equal(remarksReadback.status,400);
assert.equal(remarksCalls.length,0,'Anonymous/invalid Office remarks read reached SQL');
remarksReadback=await queryRemarks(remarksAddress,'Bearer '+validToken);
assert.equal(remarksReadback.status,200);
assert.equal(remarksReadback.body.data.paymentId,repeatId);
assert.equal(remarksReadback.body.data.challanRemarks,maximumRemarks);
assert.equal([...remarksReadback.body.data.challanRemarks].length,4000);
assert.equal(Buffer.byteLength(remarksReadback.body.data.challanRemarks,'utf8'),16000);
assert.equal(remarksCalls.length,1);
assert.equal(remarksCalls[0].name,'payment_v1_office_guarded_challan_remarks');
assert.equal(remarksCalls[0].args.p_payment_id,repeatId);
assert.equal(remarksCalls[0].bearer,'Bearer '+validToken);
console.log('PASS WS3 Office F-178 Edge: officer-gated exact 4,000-codepoint/16,000-byte remarks readback, invalid IDs denied before SQL');
