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
