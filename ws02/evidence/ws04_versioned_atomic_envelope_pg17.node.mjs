// Versioned-byte private wrapper regression, derived from the exact WS04->WS02 isolated integration test.
// Synthetic PG17 only; no real taxpayer identity, no public PostgREST exposure.
// WS02 isolated integration of EXACT pinned WS04 W5 producer with actual WS02 private atomic RPC.
// Synthetic fixtures, disposable PostgreSQL 17 ONLY. Not JWT/owner provenance or statutory approval.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInThisContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const edge = readFileSync('ws04-current-reviewed-source/ws04/w5-candidate/supabase/functions/nbr-tax-engine/index.ts', 'utf8');
const sqlSource = readFileSync('ws02/isolated_versioned_atomic_envelope.sql', 'utf8');
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
  'p_result_state', 'p_audit_trace', 'p_trace_bytes', 'p_trace_encoding_version'];
const callStart = edge.indexOf('"nbr_commit_evaluation_versioned_candidate", {');
assert.ok(callStart > 0, 'EDGE_VERSIONED_ATOMIC_RPC_NOT_CALLED');
assert.ok(!edge.includes('"nbr_commit_evaluation_atomically", {'), 'EDGE_LEGACY_ATOMIC_RPC_BYPASS');
const callEnd = edge.indexOf('});', callStart);
assert.ok(callEnd > callStart, 'EDGE_ATOMIC_RPC_CALL_UNTERMINATED');
const edgeCall = edge.slice(callStart, callEnd);
const edgeArgs = [...edgeCall.matchAll(/\b(p_[a-z_]+)\s*:/g)].map(m => m[1]);
assert.deepEqual(edgeArgs, args, 'EDGE_VERSIONED_ATOMIC_RPC_ELEVEN_ARGUMENTS_DRIFT');
const sqlStart = sqlSource.indexOf('CREATE FUNCTION ws02_owner.nbr_commit_evaluation_versioned_candidate(');
assert.ok(sqlStart > 0, 'SQL_ATOMIC_RPC_MISSING');
const sqlEnd = sqlSource.indexOf(') RETURNS boolean', sqlStart);
assert.ok(sqlEnd > sqlStart, 'SQL_ATOMIC_RPC_SIGNATURE_MISSING');
const sqlArgs = [...sqlSource.slice(sqlStart, sqlEnd).matchAll(/\b(p_[a-z_]+)\s+(?:uuid|text|jsonb)/g)].map(m => m[1]);
assert.deepEqual(sqlArgs, args, 'SQL_VERSIONED_ATOMIC_RPC_ELEVEN_ARGUMENTS_DRIFT');
assert.ok(edge.includes('validatedAuditTrace = JSON.parse(canonicalAuditTrace)'));
assert.ok(edgeCall.includes('p_audit_trace: validatedAuditTrace'));
assert.ok(edgeCall.includes('p_trace_bytes: canonicalAuditTrace'));
assert.ok(edgeCall.includes('p_trace_encoding_version: "NBR_W5_CANONICAL_UTF8_V1"'));
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
  // Idempotency collision BEFORE finalization: the same actor and slot key
  // cannot substitute a different request, even with a freshly valid W5
  // canonical audit snapshot and matching SHA-256. Synthetic PG17 only.
  const collisionRequestHash = 'e'.repeat(64);
  const collisionSnapshot = { ...snapshot, authorized_request_hash: collisionRequestHash };
  const collisionBytes = verifiedCanonicalAuditTrace(collisionSnapshot);
  const collisionDigest = digest(collisionBytes);
  const collision = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(collisionRequestHash)},
 ${q(receiptHash)},${q(collisionDigest)},${q(status)},
 ${q(JSON.stringify(collisionSnapshot))}::jsonb,${q(collisionBytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.deepEqual(collision, ['f'],
    'RESERVED_IDEMPOTENCY_KEY_ACCEPTED_DIFFERENT_REQUEST_' + status);
  const collisionReadback = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
      WHERE idem_key=${q(idem)})::text || ':' ||
      (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
      (SELECT request_hash FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
      COALESCE((SELECT receipt_hash FROM ws02_owner.slots
        WHERE idem_key=${q(idem)}),'NULL');`);
  assert.deepEqual(collisionReadback, ['0:RESERVED:' + requestHash + ':NULL'],
    'RESERVED_REQUEST_COLLISION_MUTATED_SLOT_OR_AUDIT_' + status);
  const wrongActor = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 '60000000-0000-4000-8000-000000000099',${q(record)},'2026-27',
 ${q(idem)},${q(requestHash)},${q(receiptHash)},${q(traceHash)},
 ${q(status)},${q(JSON.stringify(snapshot))}::jsonb,${q(bytes)},'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.ok(wrongActor.includes('f'), 'WS02_WRONG_ACTOR_ACCEPTED_' + status);
  const crossYear = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2027-28',
 ${q(idem)},${q(requestHash)},${q(receiptHash)},${q(traceHash)},
 ${q(status)},${q(JSON.stringify(snapshot))}::jsonb,${q(bytes)},'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.ok(crossYear.includes('f'), 'WS02_CROSS_YEAR_ACCEPTED_' + status);
  // All failures must leave the reserved slot unfinalized and without audit rows.
  const forged = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q('0'.repeat(64))},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(bytes)},'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.ok(forged.includes('f'), 'FORGED_SHA_ACCEPTED_' + status);
  const versionDrift = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(traceHash)},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(bytes)},'UNKNOWN_VERSION');`);
  assert.ok(versionDrift.includes('f'), 'UNKNOWN_ENCODING_VERSION_ACCEPTED_' + status);
  const byteDrift = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(traceHash)},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(bytes.replace('বাংলা', 'tampered'))},
 'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.ok(byteDrift.includes('f'), 'ALTERED_CANONICAL_BYTES_ACCEPTED_' + status);
  const changed = { ...snapshot, engine_version: 'changed-after-hash' };
  const jsonbDrift = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(traceHash)},${q(status)},
 ${q(JSON.stringify(changed))}::jsonb,${q(bytes)},'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.ok(jsonbDrift.includes('f'), 'JSONB_SEMANTIC_DRIFT_ACCEPTED_' + status);
  const before = pg(`SELECT count(*) FROM ws02_owner.evaluation_logs WHERE idem_key=${q(idem)};`);
  assert.deepEqual(before, ['0'], 'NEGATIVE_COMMIT_LEFT_AUDIT_' + status);
  // Owner revocation after reservation but before finalization must be enforced
  // by the *versioned* Edge-to-SQL path, not merely by the initial reservation.
  // Synthetic owner row only: this is NOT real JWT/session revocation.
  const revokedOwner = pg(`UPDATE ws02_owner.owners SET state='REVOKED'
    WHERE record_id=${q(record)} AND assessment_year='2026-27'
      AND actor_id=${q(actor)} AND state='ACTIVE' RETURNING state;`);
  assert.deepEqual(revokedOwner, ['REVOKED'], 'SYNTHETIC_OWNER_REVOCATION_SETUP_FAILED_' + status);
  const afterRevocation = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(traceHash)},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(bytes)},'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.deepEqual(afterRevocation, ['f'], 'REVOKED_OWNER_VERSIONED_COMMIT_ACCEPTED_' + status);
  const revocationReadback = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
      WHERE idem_key=${q(idem)})::text || ':' ||
      (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
      COALESCE((SELECT receipt_hash FROM ws02_owner.slots
        WHERE idem_key=${q(idem)}),'NULL');`);
  assert.deepEqual(revocationReadback, ['0:RESERVED:NULL'],
    'REVOKED_OWNER_LEFT_AUDIT_RECEIPT_OR_FINALIZED_SLOT_' + status);
  const restoredOwner = pg(`UPDATE ws02_owner.owners SET state='ACTIVE'
    WHERE record_id=${q(record)} AND assessment_year='2026-27'
      AND actor_id=${q(actor)} AND state='REVOKED' RETURNING state;`);
  assert.deepEqual(restoredOwner, ['ACTIVE'], 'SYNTHETIC_OWNER_RESTORE_FAILED_' + status);
  // Owner reassignment after reservation: neither the previous owner nor the
  // newly assigned owner may finalize the *previous owner's* reserved slot.
  // This is synthetic PG17 authorization only, not citizen identity provenance.
  const transferredActor = '60000000-0000-4000-8000-000000000077';
  const transferred = pg(`UPDATE ws02_owner.owners SET actor_id=${q(transferredActor)}
    WHERE record_id=${q(record)} AND assessment_year='2026-27'
      AND actor_id=${q(actor)} AND state='ACTIVE' RETURNING actor_id;`);
  assert.deepEqual(transferred, [transferredActor],
    'SYNTHETIC_OWNER_TRANSFER_SETUP_FAILED_' + status);
  const oldOwnerCommit = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(traceHash)},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(bytes)},'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.deepEqual(oldOwnerCommit, ['f'],
    'OWNER_TRANSFER_VERSIONED_COMMIT_ACCEPTED_' + status);
  const newOwnerSnapshot = { ...snapshot, actor_user_id: transferredActor };
  const newOwnerBytes = verifiedCanonicalAuditTrace(newOwnerSnapshot);
  const newOwnerHash = digest(newOwnerBytes);
  const newOwnerCommit = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(transferredActor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(newOwnerHash)},${q(status)},
 ${q(JSON.stringify(newOwnerSnapshot))}::jsonb,
 ${q(newOwnerBytes)},'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.deepEqual(newOwnerCommit, ['f'],
    'NEW_OWNER_HIJACKED_PREVIOUS_OWNER_RESERVATION_' + status);
  const transferReadback = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
      WHERE idem_key=${q(idem)})::text || ':' ||
      (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
      COALESCE((SELECT receipt_hash FROM ws02_owner.slots
        WHERE idem_key=${q(idem)}),'NULL');`);
  assert.deepEqual(transferReadback, ['0:RESERVED:NULL'],
    'OWNER_TRANSFER_LEFT_AUDIT_RECEIPT_OR_FINALIZED_SLOT_' + status);
  const transferredBack = pg(`UPDATE ws02_owner.owners SET actor_id=${q(actor)}
    WHERE record_id=${q(record)} AND assessment_year='2026-27'
      AND actor_id=${q(transferredActor)} AND state='ACTIVE' RETURNING actor_id;`);
  assert.deepEqual(transferredBack, [actor],
    'SYNTHETIC_OWNER_TRANSFER_RESTORE_FAILED_' + status);
  // Synthetic producer-capability revocation: an already RESERVED slot must not
  // be finalizable by a producer role after its wrapper EXECUTE grant is removed.
  // This tests PostgreSQL function ACL revocation, NOT JWT/session revocation.
  if (i === 0) {
    const signature = 'ws02_owner.nbr_commit_evaluation_versioned_candidate(uuid,uuid,text,text,text,text,text,text,jsonb,text,text)';
    pg('REVOKE EXECUTE ON FUNCTION ' + signature + ' FROM ws02_owner_engine;');
    const revoked = spawnSync('psql', ['-X','-Atq','-v','ON_ERROR_STOP=1'], {
      input: `SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(traceHash)},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(bytes)},'NBR_W5_CANONICAL_UTF8_V1');`,
      encoding: 'utf8', timeout: 20000,
    });
    assert.notEqual(revoked.status, 0, 'REVOKED_PRODUCER_EXECUTE_ACCEPTED');
    assert.match(revoked.stderr, /permission denied for function/, 'REVOKED_PRODUCER_ACL_NOT_ENFORCED');
    const unchanged = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
      WHERE idem_key=${q(idem)})::text || ':' ||
      (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)});`);
    assert.deepEqual(unchanged, ['0:RESERVED'], 'REVOKED_PRODUCER_LEFT_AUDIT_OR_RECEIPT');
    pg('GRANT EXECUTE ON FUNCTION ' + signature + ' TO ws02_owner_engine;');
    assert.deepEqual(pg(`SELECT has_function_privilege('ws02_owner_engine',
      ${q(signature)},'EXECUTE')::text;`), ['true'], 'PRODUCER_GRANT_NOT_RESTORED');
  }
  const commit = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',
 ${q(idem)},${q(requestHash)},${q(receiptHash)},${q(traceHash)},
 ${q(status)},${q(JSON.stringify(snapshot))}::jsonb,${q(bytes)},'NBR_W5_CANONICAL_UTF8_V1');`);
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
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',
 ${q(idem)},${q(requestHash)},${q(receiptHash)},${q(traceHash)},
 ${q(status)},${q(JSON.stringify(snapshot))}::jsonb,${q(bytes)},'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.ok(replay.includes('f'), 'WS02_DUPLICATE_FINALIZATION_ACCEPTED_' + status);
  // A repeated idempotency key must not rewrite an already-finalized receipt
  // even when a producer supplies a newly valid canonical trace and digest.
  // This is a disposable PG17 replay-integrity test, not a live Auth test.
  const replacementReceipt = 'd'.repeat(64);
  const alteredReceiptTrace = { ...snapshot, receipt_hash: replacementReceipt };
  const alteredReceiptBytes = verifiedCanonicalAuditTrace(alteredReceiptTrace);
  const alteredReceiptDigest = digest(alteredReceiptBytes);
  const receiptReplay = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',
 ${q(idem)},${q(requestHash)},${q(replacementReceipt)},${q(alteredReceiptDigest)},
 ${q(status)},${q(JSON.stringify(alteredReceiptTrace))}::jsonb,
 ${q(alteredReceiptBytes)},'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.deepEqual(receiptReplay, ['f'],
    'FINALIZED_IDEMPOTENCY_KEY_ACCEPTED_DIFFERENT_RECEIPT_' + status);
  const alteredTrace = { ...snapshot, engine_version: 'synthetic-replay-tampered' };
  const alteredBytes = verifiedCanonicalAuditTrace(alteredTrace);
  const alteredDigest = digest(alteredBytes);
  const traceReplay = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',
 ${q(idem)},${q(requestHash)},${q(receiptHash)},${q(alteredDigest)},
 ${q(status)},${q(JSON.stringify(alteredTrace))}::jsonb,
 ${q(alteredBytes)},'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.deepEqual(traceReplay, ['f'],
    'FINALIZED_IDEMPOTENCY_KEY_ACCEPTED_DIFFERENT_TRACE_' + status);
  const immutable = pg(`SELECT row_to_json(x)::text FROM (
SELECT e.audit_trace, e.trace_hash, e.result_state, s.state, s.receipt_hash
FROM ws02_owner.evaluation_logs e JOIN ws02_owner.slots s
USING (actor_id,record_id,assessment_year,idem_key)
WHERE e.idem_key=${q(idem)}) x;`);
  assert.equal(immutable.length, 1, 'FINALIZED_REPLAY_CHANGED_ROW_COUNT_' + status);
  assert.deepEqual(JSON.parse(immutable[0]), saved,
    'FINALIZED_REPLAY_MUTATED_AUDIT_OR_RECEIPT_' + status);
}
// The synthetic engine must NOT bypass the envelope by calling the old RPC.
const direct = spawnSync('psql', ['-X','-Atq','-v','ON_ERROR_STOP=1'], {
  input: `SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_atomically(
 '60000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000010','2026-27',
 'ws04-snapshot-atomic-0001',repeat('a',64),repeat('b',64),
 repeat('c',64),'NEEDS_FACTS','{}'::jsonb);`,
  encoding: 'utf8', timeout: 20000,
});
assert.notEqual(direct.status, 0, 'LEGACY_ATOMIC_RPC_BYPASS_ACCEPTED');
assert.match(direct.stderr, /permission denied for function/, 'LEGACY_ATOMIC_RPC_NOT_DENIED_BY_ACL');
const acl = pg(`SELECT has_function_privilege('ws02_owner_engine',
 'ws02_owner.nbr_commit_evaluation_atomically(uuid,uuid,text,text,text,text,text,text,jsonb)',
 'EXECUTE')::text;`);
assert.deepEqual(acl, ['false'], 'DIRECT_ATOMIC_GRANT_REAPPEARED');

console.log('PASS_SCOPED_WS04_VERSIONED_BYTES_PRIVATE_ATOMIC_ENVELOPE_THREE_STATES_AND_BYPASS_DENIAL_ONLY');
console.log('HOLD: synthetic role only; SQL checks supplied bytes/digest/JSONB equality, not independent JS canonicality or trusted producer. No signed Auth, real owner source, statutory amounts or deployment.');
