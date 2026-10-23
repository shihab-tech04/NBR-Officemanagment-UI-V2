import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';

// Actual WS04 candidate handler, isolated mocks, no Supabase connection.
// Negative acceptance ONLY; no source law or tax amount is certified.
const file = new URL('../supabase/functions/nbr-tax-engine/index.ts', import.meta.url);
const source = readFileSync(file, 'utf8');
const executable = stripTypeScriptTypes(source.replace(
  /^import \{ createClient \} from .*;$/m,
  'const { createClient } = __testDeps;',
));

function harness(year = {
  id:'isolated-year', assessment_year:'2026-27', income_year:'2025-26',
  state:'active', is_executable:true, legal_cutoff:'2026-09-30',
}) {
  const seen = { ruleReads:0, authCalls:0, ownershipCalls:0, reserveCalls:0 };
  let handler;
  const client = {
    auth:{ async getUser(token) {
      seen.authCalls++;
      return token === 'valid.test.token'
        ? {data:{user:{id:'isolated-auth-user'}},error:null}
        : {data:{user:null},error:{message:'Invalid'}};
    }},
    async rpc(name) {
      if (name === 'nbr_authorize_citizen_evaluation') {
        seen.ownershipCalls++;
        return {data:true,error:null};
      }
      if (name === 'nbr_reserve_citizen_evaluation') {
        seen.reserveCalls++;
        return {data:{state:'RESERVED'},error:null};
      }
      throw Error('Unexpected privileged SQL RPC: '+name);
    },
    from(name) {
      const query = {
        select(){return this;},eq(){return this;},in(){return this;},order(){return this;},
        async maybeSingle(){return {data:name === 'nbr_tax_years' ? year : null,error:null};},
        then(resolve,reject){
          if(name === 'nbr_rule_versions') seen.ruleReads++;
          return Promise.resolve({data:[],error:null}).then(resolve,reject);
        },
      };
      return query;
    },
  };
  const runtime = {
    __testDeps:{createClient:()=>client},
    Deno:{serve:fn=>{handler=fn;},env:{get:key=>{
      if(key === 'NBR_TAX_EXECUTION_ENABLED') return 'true';
      if(key === 'SUPABASE_SERVICE_ROLE_KEY') return 'test-service-role-not-a-secret';
      if(key === 'NBR_TAX_ALLOWED_ORIGINS') return 'https://valid.synthetic.invalid';
      return 'https://synthetic.invalid';
    }}},
    Response,Request,URL,crypto:webcrypto,TextEncoder,console,
  };
  runInNewContext(executable,runtime,{filename:'isolated-ws04-temporal-gate.js',timeout:5000});
  assert.equal(typeof handler,'function');
  return {
    seen,
    async request(overrides={}) {
      const body = {
        assessmentYear:year.assessment_year,
        incomeYear:year.income_year,
        contractVersion:'NBR_ENGINE_CITIZEN_V2_REVIEW',
        legalEventDate:'2026-07-10',
        expectedSourceCutoff:'2026-09-30',
        expectedRuleSetHash:'a'.repeat(64),
        expectedParameterRevision:1,
        idempotencyKey:'isolated-temporal-case-0000001',
        taxpayerRecordId:'50000000-0000-4000-8000-000000000001',
        taxpayer:{entityType:'individual',residency:'resident',industryCode:'not_applicable',specialCategory:'none'},
        returnData:{incomeHeads:{employment:'0'}},
        ...overrides,
      };
      const res=await handler(new Request('https://synthetic.invalid/functions/v1/nbr-tax-engine',{
        method:'POST',headers:{authorization:'Bearer valid.test.token'},
        body:JSON.stringify(body),
      }));
      return {code:res.status,body:await res.json()};
    },
  };
}

test('a July 2026 withholding transaction cannot select AY2026-27 / IY2025-26 by source cutoff alone',async()=>{
  const h=harness();
  const r=await h.request({transactionRuleIds:['WH-R4-04']});
  assert.equal(r.code,409);
  assert.equal(r.body.code,'TRANSACTION_PERIOD_REVIEW_REQUIRED');
  assert.equal(h.seen.ruleReads,0);
});

test('a transaction-map claim has the same cross-income-year denial',async()=>{
  const h=harness();
  const r=await h.request({transactions:{'WH-R4-04':{grossBill:'20000'}}});
  assert.equal(r.code,409);
  assert.equal(r.body.code,'TRANSACTION_PERIOD_REVIEW_REQUIRED');
  assert.equal(h.seen.ruleReads,0);
});

test('matching income-period date passes this guard but cannot compute without 366 rules',async()=>{
  const h=harness();
  const r=await h.request({legalEventDate:'2026-06-30',transactionRuleIds:['WH-R4-04']});
  assert.equal(r.code,503);
  assert.equal(r.body.status,'FAIL_CLOSED');
  assert.notEqual(r.body.code,'TRANSACTION_PERIOD_REVIEW_REQUIRED');
  assert.equal(h.seen.ruleReads,1);
});

test('a non-transaction event is not silently treated as a withholding transaction',async()=>{
  const h=harness();
  const r=await h.request({legalEventDate:'2026-07-10'});
  assert.equal(r.code,503);
  assert.equal(h.seen.ruleReads,1);
});

test('the next income year remains draft and denies calculation',async()=>{
  const h=harness({id:'isolated-year',assessment_year:'2027-28',income_year:'2026-27',
    state:'draft',is_executable:false,legal_cutoff:null});
  const r=await h.request({assessmentYear:'2027-28',incomeYear:'2026-27',
    legalEventDate:'2026-07-10',transactionRuleIds:['WH-R4-04']});
  assert.equal(r.code,409);
  assert.equal(r.body.code,'UNAPPROVED_YEAR');
  assert.equal(h.seen.ruleReads,0);
});

test('ruleFacts-only transaction candidate cannot bypass recorded income-year boundary',async()=>{
  const h=harness();
  const r=await h.request({ruleFacts:{'WH-R4-04':{baseAmount:'1000'}}});
  assert.equal(r.code,409);
  assert.equal(r.body.code,'TRANSACTION_PERIOD_REVIEW_REQUIRED');
  assert.equal(h.seen.ruleReads,0);
});

test('unknown structured fact outside the income period is conservatively held for typed event review',async()=>{
  const h=harness();
  const r=await h.request({ruleFacts:{'UNCLASSIFIED-REVIEW-ONLY':{baseAmount:'100'}}});
  assert.equal(r.code,409);
  assert.equal(r.body.code,'TRANSACTION_PERIOD_REVIEW_REQUIRED');
  assert.equal(h.seen.ruleReads,0);
});

test('in-period structured rule facts do not become approved tax calculation without full registry',async()=>{
  const h=harness();
  const r=await h.request({legalEventDate:'2026-06-30',ruleFacts:{'WH-R4-04':{baseAmount:'1000'}}});
  assert.equal(r.code,503);
  assert.equal(r.body.status,'FAIL_CLOSED');
  assert.equal(h.seen.ruleReads,1);
});

test('explicit nested July transaction date cannot hide behind a June global event date',async()=>{
  const h=harness();
  const r=await h.request({legalEventDate:'2026-06-30',
    transactions:{'WH-R4-04':{eventDate:'2026-07-10',grossBill:'1000'}}});
  assert.equal(r.code,409);
  assert.equal(r.body.code,'TRANSACTION_EVENT_DATE_CONFLICT');
  assert.equal(h.seen.ruleReads,0);
});

test('multiple transaction dates are not silently collapsed into one global event',async()=>{
  const h=harness();
  const r=await h.request({legalEventDate:'2026-06-30',
    transactions:{'A':{eventDate:'2026-06-30'},'B':{eventDate:'2026-07-01'}}});
  assert.equal(r.code,409);
  assert.equal(r.body.code,'TRANSACTION_EVENT_DATE_CONFLICT');
  assert.equal(h.seen.ruleReads,0);
});

test('undated transaction cannot inherit caller-selected event date',async()=>{
  const h=harness();
  const r=await h.request({legalEventDate:'2026-06-30',
    transactions:{'WH-R4-04':{grossBill:'1000'}}});
  assert.equal(r.code,422);
  assert.equal(r.body.code,'TRANSACTION_EVENT_DATE_REQUIRED');
  assert.equal(h.seen.ruleReads,0);
});

test('invalid civil-date transaction is rejected before reading tax rules',async()=>{
  const h=harness();
  const r=await h.request({legalEventDate:'2026-06-30',
    transactions:{'WH-R4-04':{eventDate:'2026-02-30'}}});
  assert.equal(r.code,422);
  assert.equal(r.body.code,'TRANSACTION_EVENT_DATE_REQUIRED');
  assert.equal(h.seen.ruleReads,0);
});

test('conflicting structured ruleFacts eventDate is not ignored',async()=>{
  const h=harness();
  const r=await h.request({legalEventDate:'2026-06-30',
    ruleFacts:{'WH-R4-04':{baseAmount:'1000',eventDate:'2026-07-10'}}});
  assert.equal(r.code,409);
  assert.equal(r.body.code,'RULE_EVENT_DATE_CONFLICT');
  assert.equal(h.seen.ruleReads,0);
});

test('same-date explicitly dated transaction passes the date guard but cannot bypass frozen-rule coverage',async()=>{
  const h=harness();
  const r=await h.request({legalEventDate:'2026-06-30',
    transactions:{'WH-R4-04':{eventDate:'2026-06-30',grossBill:'1000'}}});
  assert.equal(r.code,503);
  assert.equal(r.body.status,'FAIL_CLOSED');
  assert.equal(h.seen.ruleReads,1);
});

test('malformed transaction map cannot be silently disregarded',async()=>{
  const h=harness();
  const r=await h.request({legalEventDate:'2026-06-30',transactions:['2026-06-30']});
  assert.equal(r.code,422);
  assert.equal(r.body.code,'TRANSACTION_FACTS_UNVERIFIED');
  assert.equal(h.seen.ruleReads,0);
});

for (const [field, invalidSelection] of [
  ['transactionRuleIds', 'WH-R4-04'],
  ['transactionRuleIds', [null]],
  ['transactionRuleIds', ['WH-R4-04', 'WH-R4-04']],
  ['claimRuleIds', [{}]],
  ['paymentRuleIds', { 0: 'WH-R4-04' }],
]) {
  test('malformed ' + field + ' is rejected before privileged reads: ' +
    JSON.stringify(invalidSelection), async () => {
    const h = harness();
    const r = await h.request({ [field]: invalidSelection });
    assert.equal(r.code, 422);
    assert.equal(r.body.status, 'FAIL_CLOSED');
    assert.ok(r.body.invalidFacts.includes(field));
    assert.equal(h.seen.ruleReads, 0);
    assert.equal(h.seen.reserveCalls, 0);
  });
}

// Source-only atomic boundary checks; real PG17/Auth is separate.
test('no direct audit insert or split receipt finalize remains in the candidate',()=>{
  assert.equal(source.includes('supabase.from("nbr_engine_evaluation_log").insert'),false);
  assert.equal(source.includes('"nbr_finalize_citizen_evaluation"'),false);
  assert.ok(source.includes('"nbr_commit_evaluation_atomically"'));
});
test('atomic trace and call pin user, record, request, receipt, version and statuses',()=>{
  const i=source.indexOf('const auditTrace = {');
  const j=source.indexOf('const { data: atomicCommit',i);
  assert.ok(i>0 && j>i);
  const trace=source.slice(i,j);
  for(const token of ['individual: individual.trace','rules: results',
    'actor_user_id: authData.user.id','taxpayer_record_id: taxpayerRecordId',
    'authorized_request_hash: authorizedRequestHash','idempotency_key: body.idempotencyKey',
    'receipt_hash: receiptHash','result_status: fullReturnStatus'])
    assert.ok(trace.includes(token),token);
  const call=source.slice(j,source.indexOf('if (atomicCommitError',j));
  for(const token of ['p_auth_user_id: authData.user.id','p_request_hash: authorizedRequestHash',
    'p_receipt_hash: receiptHash','p_trace_hash: auditTraceHash',
    'p_result_state: fullReturnStatus','p_audit_trace: auditTrace'])
    assert.ok(call.includes(token),token);
});
test('atomic RPC unavailability fails closed',()=>{
  assert.ok(source.includes('atomicCommitError || atomicCommit !== true'));
  assert.ok(source.includes('code:"AUDIT_ATOMIC_COMMIT_UNAVAILABLE"'));
});
