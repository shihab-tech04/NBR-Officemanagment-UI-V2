import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInThisContext } from 'node:vm';
import { createHash } from 'node:crypto';

// Tests the ACTUAL isolated W5 source helper, not a copied implementation.
// No signed Auth, private registry, hosted SQL, real taxpayer or calculation.
const source = readFileSync(new URL(
  '../supabase/functions/nbr-tax-engine/index.ts', import.meta.url), 'utf8');
function extract(name) {
  const begin = source.indexOf('function ' + name + '(');
  assert.ok(begin >= 0, 'MISSING_' + name);
  const end = source.indexOf('\n}\n', begin);
  assert.ok(end > begin, 'UNTERMINATED_' + name);
  return source.slice(begin, end + 2);
}
const executable = stripTypeScriptTypes(
  extract('canonical') + '\n' + extract('verifiedCanonicalAuditTrace'));
const { canonical, verifiedCanonicalAuditTrace } = runInThisContext(
  '(() => {' + executable +
  '\nreturn { canonical, verifiedCanonicalAuditTrace }; })()');
const sha = s => createHash('sha256').update(s, 'utf8').digest('hex');
const base = {
  individual: [{ kind: 'income', amount: '100000.50', source: 'বাংলা 😀' }],
  rules: [{ id: 'synthetic-rule', state: 'NEEDS_FACTS', amount: 0.1,
    trace: { 'প্রমাণ': ['সূত্র', { '🔑': true }], empty: [] } }],
  amounts: null, engine_version: 'isolated-review',
  input_hash: 'a'.repeat(64), rule_set_hash: 'b'.repeat(64),
  result_status: 'NEEDS_FACTS', applied_rule_count: 0,
  needs_fact_count: 1, blocked_rule_count: 0, parameter_revision: 1,
  actor_user_id: '60000000-0000-4000-8000-000000000001',
  taxpayer_record_id: '50000000-0000-4000-8000-000000000001',
  assessment_year: '2026-27', income_year: '2025-26',
  authorized_request_hash: 'a'.repeat(64),
  idempotency_key: 'synthetic-only-00001', receipt_hash: 'c'.repeat(64),
  contract_version: 'NBR_ENGINE_CITIZEN_V2_REVIEW',
};
test('W5 auditTrace producer guard is wired before the private atomic RPC', () => {
  const guardCall = source.indexOf('const canonicalAuditTrace = verifiedCanonicalAuditTrace(auditTrace);');
  const commitCall = source.indexOf('"nbr_commit_evaluation_versioned_candidate"', guardCall);
  assert.ok(guardCall > 0 && commitCall > guardCall);
  assert.ok(source.slice(guardCall, commitCall).includes('AUDIT_TRACE_ENCODING_UNSAFE'));
});
test('three W5 auditTrace disposition shapes retain exact canonical evidence', () => {
  for (const status of ['CALCULATED', 'NEEDS_FACTS', 'FAIL_CLOSED']) {
    const trace = structuredClone(base);
    trace.result_status = status;
    trace.amounts = status === 'CALCULATED'
      ? { gross: '100000.50', net: '500.00' } : null;
    const bytes = verifiedCanonicalAuditTrace(trace);
    assert.equal(bytes, canonical(trace));
    assert.equal(bytes, canonical(JSON.parse(bytes)));
    assert.match(sha(bytes), /^[a-f0-9]{64}$/);
    assert.equal(JSON.parse(bytes).result_status, status);
    assert.equal(JSON.parse(bytes).rules[0].trace['প্রমাণ'][1]['🔑'], true);
  }
});
test('W5 auditTrace guard rejects unsafe nested producer values', () => {
  const cyclic = {}; cyclic.self = cyclic;
  const getter = {}; Object.defineProperty(getter, 'x',
    { enumerable: true, get() { return 1; } });
  const hidden = {}; Object.defineProperty(hidden, 'x', { value: 1 });
  const sparse = new Array(1);
  const extra = [1]; extra.other = 2;
  const deep = {}; let cursor = deep;
  for (let i = 0; i < 66; i++) cursor = cursor.nested = {};
  const negatives = [
    { nested: undefined }, { nested: NaN }, { nested: Infinity },
    { nested: -Infinity }, { nested: 9007199254740992 },
    { nested: 1n }, { nested: () => 1 },
    { nested: new Date('2026-01-01') }, { nested: sparse },
    { nested: extra }, { nested: getter }, { nested: hidden },
    { nested: cyclic }, { nested: deep },
    { nested: String.fromCharCode(0xd800) },
    { [String.fromCharCode(0xdc00)]: 'bad' },
    { [Symbol('private')]: 'bad' },
    { nested: 'x'.repeat(262145) },
  ];
  for (const nested of negatives) {
    assert.throws(() => verifiedCanonicalAuditTrace({ ...base, ...nested }));
  }
  for (const invalidRoot of [null, [], 42, 'string']) {
    assert.throws(() => verifiedCanonicalAuditTrace(invalidRoot));
  }
});
test('W5 canonical encoding rejects altered bytes and accepts Unicode scalar pairs', () => {
  const trace = { ...base, emoji: '😀', bangla: 'বাংলা' };
  const bytes = verifiedCanonicalAuditTrace(trace);
  assert.ok(bytes.includes('😀'));
  assert.ok(bytes.includes('বাংলা'));
  assert.notEqual(bytes, bytes + ' ');
  assert.notEqual(sha(bytes), sha(bytes + ' '));
});

test('atomic RPC receives a validated immutable-by-copy JSON snapshot, not the mutable producer object', () => {
  const start = source.indexOf('const auditTrace = {');
  const end = source.indexOf('if (atomicCommitError', start);
  assert.ok(start > 0 && end > start, 'MISSING_ATOMIC_TRACE_BOUNDARY');
  const segment = source.slice(start, end);
  assert.ok(segment.includes('canonicalAuditTrace = verifiedCanonicalAuditTrace(auditTrace);'));
  assert.ok(segment.includes('validatedAuditTrace = JSON.parse(canonicalAuditTrace)'));
  assert.ok(segment.includes('auditTraceHash = await sha256(canonicalAuditTrace);'));
  assert.ok(segment.includes('p_audit_trace: validatedAuditTrace,'));
  assert.ok(segment.includes('p_trace_bytes: canonicalAuditTrace,'));
  assert.ok(segment.includes('p_trace_encoding_version: "NBR_W5_CANONICAL_UTF8_V1",'));
  assert.ok(segment.includes('"nbr_commit_evaluation_versioned_candidate"'));
  assert.ok(!segment.includes('"nbr_commit_evaluation_atomically"'));
  assert.ok(segment.indexOf('auditTraceHash = await sha256(canonicalAuditTrace);') <
    segment.indexOf('p_trace_bytes: canonicalAuditTrace,'));
  assert.ok(!segment.includes('p_audit_trace: auditTrace,'));
  const producer = structuredClone(base);
  const canonicalBytes = verifiedCanonicalAuditTrace(producer);
  const transmitted = JSON.parse(canonicalBytes);
  const originalDigest = sha(canonicalBytes);
  producer.actor_user_id = '60000000-0000-4000-8000-000000000099';
  producer.rules[0].trace['প্রমাণ'][1]['🔑'] = false;
  producer.rules.push({ id: 'injected-after-validation' });
  assert.equal(sha(verifiedCanonicalAuditTrace(transmitted)), originalDigest);
  assert.deepEqual(JSON.parse(canonicalBytes), transmitted);
  assert.notEqual(sha(verifiedCanonicalAuditTrace(producer)), originalDigest);
  assert.equal(transmitted.actor_user_id, base.actor_user_id);
  assert.equal(transmitted.rules.length, 1);
  assert.equal(transmitted.rules[0].trace['প্রমাণ'][1]['🔑'], true);
});

console.log('WS04_AUDIT_TRACE_PRODUCER_FAIL_CLOSED_ISOLATED_ONLY');

test('private versioned envelope binds exact canonical bytes, digest and detached snapshot', () => {
  for (const status of ['CALCULATED', 'NEEDS_FACTS', 'FAIL_CLOSED']) {
    const producer = structuredClone(base);
    producer.result_status = status;
    const bytes = verifiedCanonicalAuditTrace(producer);
    const transmitted = JSON.parse(bytes);
    const digest = sha(bytes);
    assert.equal(sha(verifiedCanonicalAuditTrace(transmitted)), digest);
    assert.equal(transmitted.result_status, status);
    producer.actor_user_id = '60000000-0000-4000-8000-000000000099';
    assert.notEqual(sha(verifiedCanonicalAuditTrace(producer)), digest);
    assert.notEqual(sha(bytes + ' '), digest);
    assert.equal(sha(bytes), digest);
  }
});
