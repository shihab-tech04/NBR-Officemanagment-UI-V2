// WS02 isolated integration of EXACT pinned WS04 W5 producer with actual WS02 private atomic RPC.
// Synthetic fixtures, disposable PostgreSQL 17 ONLY. Not JWT/owner provenance or statutory approval.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInThisContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const edge = readFileSync('ws04-current-reviewed-source/ws04/w5-candidate/supabase/functions/nbr-tax-engine/index.ts', 'utf8');
const sqlSource = readFileSync('ws02/isolated_owner_receipt_contract.sql', 'utf8');
function extract(name) {
  const start = edge.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'WS04_HELPER_MISSING_' + name);
  const end = edge.indexOf('\n}\n', start);
  assert.ok(end > start, 'WS04_HELPER_UNTERMINATED_' + name);
  return edge.slice(start, end + 2);
}
const { canonical, verifiedCanonicalAuditTrace } = runInThisContext(
  '(() => {' + stripTypeScriptTypes(extract('canonical') + '\n' +
  extract('verifiedCanonicalAuditTrace')) +
  '\nreturn { canonical, verifiedCanonicalAuditTrace }; })()');
const digest = s => createHash('sha256').update(s, 'utf8').digest('hex');
const args = ['p_auth_user_id', 'p_taxpayer_record_id', 'p_assessment_year',
  'p_idempotency_key', 'p_request_hash', 'p_receipt_hash', 'p_trace_hash',
  'p_result_state', 'p_audit_trace'];
const callStart = edge.indexOf('"nbr_commit_evaluation_atomically", {');
assert.ok(callStart > 0, 'EDGE_ATOMIC_RPC_NOT_CALLED');
const callEnd = edge.indexOf('});', callStart);
assert.ok(callEnd > callStart, 'EDGE_ATOMIC_RPC_CALL_UNTERMINATED');
const edgeCall = edge.slice(callStart, callEnd);
const edgeArgs = [...edgeCall.matchAll(/\b(p_[a-z_]+)\s*:/g)].map(m => m[1]);
assert.deepEqual(edgeArgs, args, 'EDGE_ATOMIC_RPC_NINE_ARGUMENTS_DRIFT');
const sqlStart = sqlSource.indexOf('CREATE FUNCTION ws02_owner.nbr_commit_evaluation_atomically(');
assert.ok(sqlStart > 0, 'SQL_ATOMIC_RPC_MISSING');
const sqlEnd = sqlSource.indexOf(') RETURNS boolean', sqlStart);
assert.ok(sqlEnd > sqlStart, 'SQL_ATOMIC_RPC_SIGNATURE_MISSING');
const sqlArgs = [...sqlSource.slice(sqlStart, sqlEnd).matchAll(/\b(p_[a-z_]+)\s+(?:uuid|text|jsonb)/g)].map(m => m[1]);
assert.deepEqual(sqlArgs, args, 'SQL_ATOMIC_RPC_NINE_ARGUMENTS_DRIFT');
assert.ok(edge.includes('validatedAuditTrace = JSON.parse(canonicalAuditTrace)'));
assert.ok(edgeCall.includes('p_audit_trace: validatedAuditTrace'));
assert.ok(edge.includes('auditTraceHash = await sha256(canonicalAuditTrace)'));
const q = v => "'" + String(v).replaceAll("'", "''") + "'";
function pg(sql) {
  const r = spawnSync('psql', ['-X', '-Atq', '-v', 'ON_ERROR_STOP=1'], {
    input: sql, encoding: 'utf8', timeout: 20000,
  });
  assert.equal(r.status, 0, 'DISPOSABLE_PG17_SQL_FAILED: ' + r.stderr);
  return r.stdout.trim().split('\n').filter(Boolean);
}
const actor = '60000000-0000-4000-8000-000000000001';
const requestHash = 'a'.repeat(64);
const receiptHash = 'b'.repeat(64);
for (const [i, status] of ['NEEDS_FACTS', 'FAIL_CLOSED', 'CALCULATED'].entries()) {
  const record = '50000000-0000-4000-8000-' + String(i + 10).padStart(12, '0');
  const idem = 'ws04-snapshot-atomic-' + String(i + 1).padStart(4, '0');
  const amounts = status === 'CALCULATED' ? {
    totalIncome: '100000.50', taxFreeThreshold: '0', grossTax: '100.00',
    rebate: '0', netTax: '100.00', taxPaid: '0', balanceDue: '100.00',
  } : null;
  const original = {
    individual: [{ kind: 'synthetic', evidence: 'বাংলা 😀', values: [0.1, true, null] }],
    rules: [{ id: 'synthetic-only', state: status, trace: { 'প্রমাণ': [{ '🔑': 'সূত্র' }] } }],
    amounts, engine_version: 'synthetic-isolated',
    input_hash: requestHash, rule_set_hash: 'c'.repeat(64),
    result_status: status, applied_rule_count: 0, needs_fact_count: 1,
    blocked_rule_count: status === 'FAIL_CLOSED' ? 1 : 0,
    parameter_revision: 1, actor_user_id: actor, taxpayer_record_id: record,
    assessment_year: '2026-27', income_year: '2025-26',
    authorized_request_hash: requestHash, idempotency_key: idem,
    receipt_hash: receiptHash, contract_version: 'NBR_ENGINE_CITIZEN_V2_REVIEW',
  };
  const bytes = verifiedCanonicalAuditTrace(original);
  const snapshot = JSON.parse(bytes);
  const traceHash = digest(bytes);
  assert.equal(canonical(snapshot), bytes, 'WS04_CANONICAL_SNAPSHOT_DRIFT');
  // Mutation after snapshot must never alter the bytes/hash sent to SQL.
  original.actor_user_id = '60000000-0000-4000-8000-000000000099';
  original.rules[0].trace['প্রমাণ'][0]['🔑'] = 'tampered';
  assert.equal(digest(canonical(snapshot)), traceHash);
  assert.notEqual(digest(verifiedCanonicalAuditTrace(original)), traceHash);
  const reserve = pg(`BEGIN;
INSERT INTO ws02_owner.owners(record_id,assessment_year,actor_id,state)
VALUES (${q(record)},'2026-27',${q(actor)},'ACTIVE');
SET LOCAL ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_reserve_citizen_evaluation(
  ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
  'NBR_ENGINE_CITIZEN_V2_REVIEW')->>'state';
COMMIT;`);
  assert.ok(reserve.includes('RESERVED'), 'WS02_RESERVATION_FAILED_' + status);
  const wrongActor = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_atomically(
 '60000000-0000-4000-8000-000000000099',${q(record)},'2026-27',
 ${q(idem)},${q(requestHash)},${q(receiptHash)},${q(traceHash)},
 ${q(status)},${q(JSON.stringify(snapshot))}::jsonb);`);
  assert.ok(wrongActor.includes('f'), 'WS02_WRONG_ACTOR_ACCEPTED_' + status);
  const crossYear = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_atomically(
 ${q(actor)},${q(record)},'2027-28',
 ${q(idem)},${q(requestHash)},${q(receiptHash)},${q(traceHash)},
 ${q(status)},${q(JSON.stringify(snapshot))}::jsonb);`);
  assert.ok(crossYear.includes('f'), 'WS02_CROSS_YEAR_ACCEPTED_' + status);
  const before = pg(`SELECT count(*) FROM ws02_owner.evaluation_logs WHERE idem_key=${q(idem)};`);
  assert.deepEqual(before, ['0'], 'NEGATIVE_COMMIT_LEFT_AUDIT_' + status);
  const commit = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_atomically(
 ${q(actor)},${q(record)},'2026-27',
 ${q(idem)},${q(requestHash)},${q(receiptHash)},${q(traceHash)},
 ${q(status)},${q(JSON.stringify(snapshot))}::jsonb);`);
  assert.ok(commit.includes('t'), 'WS02_ATOMIC_COMMIT_FAILED_' + status);
  const read = pg(`SELECT row_to_json(x)::text FROM (
SELECT e.audit_trace, e.trace_hash, e.result_state, s.state, s.receipt_hash
FROM ws02_owner.evaluation_logs e JOIN ws02_owner.slots s
USING (actor_id,record_id,assessment_year,idem_key)
WHERE e.idem_key=${q(idem)}) x;`);
  assert.equal(read.length, 1, 'WS02_ATOMIC_READBACK_ROW_COUNT_' + status);
  const saved = JSON.parse(read[0]);
  assert.deepEqual(saved.audit_trace, snapshot, 'WS02_JSONB_TRACE_SEMANTIC_DRIFT_' + status);
  assert.equal(saved.trace_hash, traceHash, 'WS02_TRANSMITTED_HASH_DRIFT_' + status);
  assert.equal(saved.result_state, status);
  assert.equal(saved.state, 'FINALIZED');
  assert.equal(saved.receipt_hash, receiptHash);
  const replay = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_atomically(
 ${q(actor)},${q(record)},'2026-27',
 ${q(idem)},${q(requestHash)},${q(receiptHash)},${q(traceHash)},
 ${q(status)},${q(JSON.stringify(snapshot))}::jsonb);`);
  assert.ok(replay.includes('f'), 'WS02_DUPLICATE_FINALIZATION_ACCEPTED_' + status);
}
console.log('PASS_SCOPED_WS04_EXACT_SNAPSHOT_WS02_ATOMIC_PG17_THREE_STATES_ONLY');
console.log('HOLD: Synthetic role, no signed Auth, no SQL-side digest enforcement, no taxpayer owner source, no certified tax amounts.');
