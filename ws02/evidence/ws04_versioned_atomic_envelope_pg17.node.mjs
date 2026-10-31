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
// Bound untrusted UTF-8 trace bytes in a separate IF before JSON parsing.
// A combined OR expression does not guarantee short-circuit evaluation order.
const wrapperBody = sqlSource.slice(sqlEnd, sqlSource.indexOf('END $versioned$;', sqlEnd));
const sizeGuard = wrapperBody.indexOf("IF p_trace_bytes IS NULL\n    OR pg_catalog.octet_length(pg_catalog.convert_to(p_trace_bytes,'UTF8')) > 262144");
const sizeGuardExit = wrapperBody.indexOf('THEN RETURN false; END IF;', sizeGuard);
const jsonbSizeGuard = wrapperBody.indexOf('pg_catalog.octet_length(p_audit_trace::text) > 262144');
const jsonbSizeGuardExit = wrapperBody.indexOf('THEN RETURN false; END IF;', jsonbSizeGuard);
const outerBraceGuard = wrapperBody.indexOf("IF pg_catalog.left(p_trace_bytes,1) IS DISTINCT FROM '{'");
const jsonParseGuard = wrapperBody.indexOf('(p_trace_bytes IS JSON OBJECT WITH UNIQUE KEYS)');
assert.ok(sizeGuard >= 0 && sizeGuardExit > sizeGuard &&
  jsonbSizeGuard > sizeGuardExit && jsonbSizeGuardExit > jsonbSizeGuard &&
  outerBraceGuard > jsonbSizeGuardExit && jsonParseGuard > outerBraceGuard,
  'OVERSIZED_TRACE_BYTES_AND_JSONB_MUST_BE_REJECTED_BEFORE_JSON_PARSE');
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
    individual: [{ kind: 'synthetic', evidence: 'বাংলা 😀 /path', values: [0.1, true, null] }],
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
  // The reviewed JS canonical encoder never inserts whitespace between JSON
  // tokens. Recompute a VALID digest for equivalent noncanonical JSON and
  // verify the isolated private wrapper rejects it without consuming the slot.
  // Whitespace inside quoted strings (e.g. 'বাংলা 😀') remains legal.
  const structuralWhitespace = [
    ['colon', bytes.replace('":', '": ')],
    ['comma', bytes.replace(',"', ', "')],
    ['array', bytes.replace('[{', '[ {')],
    ['object', bytes.replace('{"', '{ "')],
  ];
  for (const [variant, alteredBytes] of structuralWhitespace) {
    assert.notEqual(alteredBytes, bytes, 'STRUCTURAL_WHITESPACE_FIXTURE_NO_CHANGE_' + variant);
    assert.deepEqual(JSON.parse(alteredBytes), snapshot,
      'STRUCTURAL_WHITESPACE_CHANGED_JSON_SEMANTICS_' + variant);
    const alteredDigest = digest(alteredBytes);
    assert.notEqual(alteredDigest, traceHash);
    const denied = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(alteredDigest)},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(alteredBytes)},'NBR_W5_CANONICAL_UTF8_V1');`);
    assert.deepEqual(denied, ['f'],
      'RECOMPUTED_HASH_STRUCTURAL_WHITESPACE_ACCEPTED_' + status + '_' + variant);
  }
  // JSON.stringify removes redundant fractional zeroes from numeric JSON.
  // JSONB, JSON.parse and a recomputed SHA alone cannot distinguish 0.1
  // from 0.10/0.100/0.10e0. The private wrapper must reject those bytes.
  const fractionalZeroVariants = [
    ['one_zero', '0.10'],
    ['two_zeroes', '0.100'],
    ['exponent', '0.10e0'],
  ];
  for (const [kind, noncanonicalNumber] of fractionalZeroVariants) {
    const needle = '[0.1,true,null]';
    assert.ok(bytes.includes(needle), 'FRACTIONAL_ZERO_FIXTURE_MISSING_' + kind);
    const alteredBytes = bytes.replace(needle, '[' + noncanonicalNumber + ',true,null]');
    assert.notEqual(alteredBytes, bytes);
    assert.deepEqual(JSON.parse(alteredBytes), snapshot,
      'FRACTIONAL_ZERO_JSON_SEMANTICS_DRIFT_' + kind);
    const rejected = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(digest(alteredBytes))},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(alteredBytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
    assert.deepEqual(rejected, ['f'],
      'VALID_HASH_REDUNDANT_FRACTIONAL_ZERO_ACCEPTED_' + kind + '_' + status);
    const readback = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
      WHERE idem_key=${q(idem)})::text || ':' ||
      (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
      COALESCE((SELECT receipt_hash FROM ws02_owner.slots
        WHERE idem_key=${q(idem)}),'NULL');`);
    assert.deepEqual(readback, ['0:RESERVED:NULL'],
      'REDUNDANT_FRACTIONAL_ZERO_MUTATED_AUDIT_OR_RECEIPT_' + kind + '_' + status);
  }
  // JSON.stringify collapses negative zero to 0. Valid JSON -0 variants
  // with freshly recomputed SHA must not be accepted by the private wrapper.
  // The fixture's applied_rule_count=0 is synthetic, never a tax amount.
  const negativeZeroVariants = [
    ['integer', '-0'], ['exponent', '-0e2'],
    ['upper_exponent', '-0E+2'], ['fraction', '-0.0'],
  ];
  for (const [kind, noncanonicalNumber] of negativeZeroVariants) {
    const needle = '"applied_rule_count":0';
    assert.ok(bytes.includes(needle), 'NEGATIVE_ZERO_FIXTURE_MISSING_' + kind);
    const alteredBytes = bytes.replace(needle,
      '"applied_rule_count":' + noncanonicalNumber);
    assert.notEqual(alteredBytes, bytes);
    assert.equal(canonical(JSON.parse(alteredBytes)), bytes,
      'NEGATIVE_ZERO_CHANGED_CANONICAL_SEMANTICS_' + kind);
    const denied = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(digest(alteredBytes))},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(alteredBytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
    assert.deepEqual(denied, ['f'],
      'VALID_HASH_NEGATIVE_ZERO_ACCEPTED_' + kind + '_' + status);
    const unchanged = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
      WHERE idem_key=${q(idem)})::text || ':' ||
      (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
      COALESCE((SELECT receipt_hash FROM ws02_owner.slots
        WHERE idem_key=${q(idem)}),'NULL');`);
    assert.deepEqual(unchanged, ['0:RESERVED:NULL'],
      'NEGATIVE_ZERO_MUTATED_AUDIT_OR_RECEIPT_' + kind + '_' + status);
  }
  // Zero exponents are valid JSON but never emitted by JSON.stringify.
  // Recompute a valid SHA and prove all three result states fail closed.
  const zeroExponentVariants = [
    ['lower', '0.1e0'], ['upper', '0.1E0'],
    ['positive', '0.1e+0'], ['negative', '0.1e-0'],
  ];
  for (const [kind, noncanonicalNumber] of zeroExponentVariants) {
    const needle = '[0.1,true,null]';
    assert.ok(bytes.includes(needle), 'ZERO_EXPONENT_FIXTURE_MISSING_' + kind);
    const alteredBytes = bytes.replace(needle, '[' + noncanonicalNumber + ',true,null]');
    assert.notEqual(alteredBytes, bytes);
    assert.deepEqual(JSON.parse(alteredBytes), snapshot,
      'ZERO_EXPONENT_CHANGED_JSON_SEMANTICS_' + kind);
    const denied = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(digest(alteredBytes))},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(alteredBytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
    assert.deepEqual(denied, ['f'],
      'VALID_HASH_ZERO_EXPONENT_ACCEPTED_' + kind + '_' + status);
    const unchanged = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
      WHERE idem_key=${q(idem)})::text || ':' ||
      (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
      COALESCE((SELECT receipt_hash FROM ws02_owner.slots
        WHERE idem_key=${q(idem)}),'NULL');`);
    assert.deepEqual(unchanged, ['0:RESERVED:NULL'],
      'ZERO_EXPONENT_MUTATED_AUDIT_OR_RECEIPT_' + kind + '_' + status);
  }
  // Exponents padded with a leading zero are valid JSON but never
  // emitted by the reviewed W5 JSON.stringify producer.
  const paddedExponentVariants = [
    ['lower', '0e01'], ['upper', '0E01'],
    ['positive', '0e+01'], ['negative', '0e-01'],
  ];
  for (const [kind, noncanonicalNumber] of paddedExponentVariants) {
    const needle = '"applied_rule_count":0';
    assert.ok(bytes.includes(needle), 'PADDED_EXPONENT_FIXTURE_MISSING_' + kind);
    const alteredBytes = bytes.replace(needle, '"applied_rule_count":' + noncanonicalNumber);
    assert.equal(canonical(JSON.parse(alteredBytes)), bytes,
      'PADDED_EXPONENT_CHANGED_CANONICAL_SEMANTICS_' + kind);
    const denied = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(digest(alteredBytes))},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(alteredBytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
    assert.deepEqual(denied, ['f'],
      'VALID_HASH_PADDED_EXPONENT_ACCEPTED_' + kind + '_' + status);
    const unchanged = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
      WHERE idem_key=${q(idem)})::text || ':' ||
      (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
      COALESCE((SELECT receipt_hash FROM ws02_owner.slots
        WHERE idem_key=${q(idem)}),'NULL');`);
    assert.deepEqual(unchanged, ['0:RESERVED:NULL'],
      'PADDED_EXPONENT_MUTATED_AUDIT_OR_RECEIPT_' + kind + '_' + status);
  }
  // JSON.stringify emits a literal solidus, not an escaped solidus.
  // Equivalent escaped-solidus bytes with a freshly recomputed digest must
  // fail before any audit/receipt commit; the unescaped canonical positive
  // path is exercised by the ordinary successful commit later in this loop.
  const escapedSolidusBytes = bytes.replace(
    'বাংলা 😀 /path', String.raw`বাংলা 😀 \/path`);
  assert.notEqual(escapedSolidusBytes, bytes, 'ESCAPED_SOLIDUS_FIXTURE_NO_CHANGE');
  assert.deepEqual(JSON.parse(escapedSolidusBytes), snapshot,
    'ESCAPED_SOLIDUS_CHANGED_JSON_SEMANTICS_' + status);
  const escapedSolidusHash = digest(escapedSolidusBytes);
  const escapedSolidusDenied = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(escapedSolidusHash)},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(escapedSolidusBytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.deepEqual(escapedSolidusDenied, ['f'],
    'VALID_HASH_ESCAPED_SOLIDUS_ACCEPTED_' + status);
  // W5 JSON.stringify emits printable ASCII literally, including property
  // names, values and '/'. A caller can recompute a valid SHA for equivalent
  // \\u00XX bytes; the private PG17 wrapper must still fail closed.
  const unicodeAsciiVariants = [
    ['key', bytes.replace('engine_version',
      'engine_versi' + String.fromCharCode(92) + 'u006fn')],
    ['value', bytes.replace('/path',
      '/p' + String.fromCharCode(92) + 'u0061th')],
    ['slash', bytes.replace('/path',
      String.fromCharCode(92) + 'u002fpath')],
  ];
  for (const [variant, unicodeBytes] of unicodeAsciiVariants) {
    assert.notEqual(unicodeBytes, bytes,
      'PRINTABLE_UNICODE_FIXTURE_NO_CHANGE_' + variant);
    assert.deepEqual(JSON.parse(unicodeBytes), snapshot,
      'PRINTABLE_UNICODE_CHANGED_JSON_SEMANTICS_' + variant);
    const unicodeHash = digest(unicodeBytes);
    const rejected = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(unicodeHash)},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(unicodeBytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
    assert.deepEqual(rejected, ['f'],
      'VALID_HASH_PRINTABLE_UNICODE_ESCAPE_ACCEPTED_' + variant + '_' + status);
  }
  // Non-ASCII Unicode escapes and escaped surrogate pairs decode to the same
  // JSONB as the reviewed W5 literal UTF-8 output, but are not its bytes.
  // Reject valid recomputed SHA-256 representations without finalization.
  const unicodeNonAsciiVariants = [
    ['bengali_value', bytes.replace('বাংলা', String.raw`\u09acাংলা`)],
    ['bengali_key', bytes.replace('প্রমাণ', String.raw`\u09aa্রমাণ`)],
    ['emoji_pair', bytes.replace('😀', String.raw`\ud83d\ude00`)],
  ];
  for (const [variant, unicodeBytes] of unicodeNonAsciiVariants) {
    assert.notEqual(unicodeBytes, bytes,
      'NONASCII_UNICODE_FIXTURE_NO_CHANGE_' + variant);
    assert.deepEqual(JSON.parse(unicodeBytes), snapshot,
      'NONASCII_UNICODE_CHANGED_JSON_SEMANTICS_' + variant);
    const unicodeHash = digest(unicodeBytes);
    const rejected = pg(`SET ROLE ws02_owner_engine;
 SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
  ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
  ${q(receiptHash)},${q(unicodeHash)},${q(status)},
  ${q(JSON.stringify(snapshot))}::jsonb,${q(unicodeBytes)},
  'NBR_W5_CANONICAL_UTF8_V1');`);
    assert.deepEqual(rejected, ['f'],
      'VALID_HASH_NONASCII_UNICODE_ESCAPE_ACCEPTED_' + variant + '_' + status);
  }
  // Synthetic reserved slot for control-escape canonicality; not real Auth.
  // Long-form control escapes and uppercase hex retain JSONB meaning and a
  // valid recomputed SHA-256, but are not reviewed W5 JSON.stringify bytes.
  const controlIdem = idem + '-ctrl';
  const controlSnapshot = { ...snapshot, idempotency_key: controlIdem,
    control_probe: String.fromCharCode(8, 9, 10, 12, 13, 31) };
  const controlBytes = verifiedCanonicalAuditTrace(controlSnapshot);
  assert.deepEqual(JSON.parse(controlBytes), controlSnapshot);
  const controlReserve = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_reserve_citizen_evaluation(
 ${q(actor)},${q(record)},'2026-27',${q(controlIdem)},${q(requestHash)},
 'NBR_ENGINE_CITIZEN_V2_REVIEW')->>'state';`);
  assert.deepEqual(controlReserve, ['RESERVED'],
    'CONTROL_ESCAPE_RESERVATION_FAILED_' + status);
  for (const [kind, canonicalEscape, noncanonicalEscape] of [
    ['backspace', String.raw`\b`, String.raw`\u0008`],
    ['tab', String.raw`\t`, String.raw`\u0009`],
    ['newline', String.raw`\n`, String.raw`\u000a`],
    ['formfeed', String.raw`\f`, String.raw`\u000c`],
    ['return', String.raw`\r`, String.raw`\u000d`],
    ['uppercase_hex', String.raw`\u001f`, String.raw`\u001F`],
  ]) {
    assert.ok(controlBytes.includes(canonicalEscape),
      'CONTROL_CANONICAL_ESCAPE_FIXTURE_MISSING_' + kind);
    const alteredBytes = controlBytes.replace(canonicalEscape, noncanonicalEscape);
    assert.notEqual(alteredBytes, controlBytes);
    assert.deepEqual(JSON.parse(alteredBytes), controlSnapshot,
      'CONTROL_ESCAPE_CHANGED_JSON_SEMANTICS_' + kind);
    const denied = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(controlIdem)},${q(requestHash)},
 ${q(receiptHash)},${q(digest(alteredBytes))},${q(status)},
 ${q(JSON.stringify(controlSnapshot))}::jsonb,${q(alteredBytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
    assert.deepEqual(denied, ['f'],
      'NONCANONICAL_CONTROL_ESCAPE_ACCEPTED_' + kind + '_' + status);
  }
  const controlBefore = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
    WHERE idem_key=${q(controlIdem)})::text || ':' ||
    (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(controlIdem)}) || ':' ||
    COALESCE((SELECT receipt_hash FROM ws02_owner.slots
      WHERE idem_key=${q(controlIdem)}),'NULL');`);
  assert.deepEqual(controlBefore, ['0:RESERVED:NULL'],
    'NONCANONICAL_CONTROL_ESCAPE_MUTATED_AUDIT_OR_RECEIPT_' + status);
  const canonicalControlCommit = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(controlIdem)},${q(requestHash)},
 ${q(receiptHash)},${q(digest(controlBytes))},${q(status)},
 ${q(JSON.stringify(controlSnapshot))}::jsonb,${q(controlBytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.deepEqual(canonicalControlCommit, ['t'],
    'CANONICAL_CONTROL_ESCAPE_POSITIVE_DENIED_' + status);
  const controlAfter = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
    WHERE idem_key=${q(controlIdem)} AND audit_trace->>'control_probe' =
      ${q(controlSnapshot.control_probe)})::text || ':' ||
    (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(controlIdem)}) || ':' ||
    (SELECT receipt_hash FROM ws02_owner.slots
      WHERE idem_key=${q(controlIdem)});`);
  assert.deepEqual(controlAfter, ['1:FINALIZED:' + receiptHash],
    'CANONICAL_CONTROL_ESCAPE_AUDIT_RECEIPT_READBACK_FAILED_' + status);
  const unicodeNonAsciiReadback = pg(`SELECT
  (SELECT count(*) FROM ws02_owner.evaluation_logs WHERE idem_key=${q(idem)})::text || ':' ||
  (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
  COALESCE((SELECT receipt_hash FROM ws02_owner.slots WHERE idem_key=${q(idem)}),'NULL');`);
  assert.deepEqual(unicodeNonAsciiReadback, ['0:RESERVED:NULL'],
    'NONASCII_UNICODE_MUTATED_AUDIT_OR_RECEIPT_' + status);
  const unicodeAsciiReadback = pg(`SELECT
 (SELECT count(*) FROM ws02_owner.evaluation_logs WHERE idem_key=${q(idem)})::text || ':' ||
 (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
 COALESCE((SELECT receipt_hash FROM ws02_owner.slots WHERE idem_key=${q(idem)}),'NULL');`);
  assert.deepEqual(unicodeAsciiReadback, ['0:RESERVED:NULL'],
    'PRINTABLE_UNICODE_MUTATED_AUDIT_OR_RECEIPT_' + status);
  const escapedSolidusReadback = pg(`SELECT
 (SELECT count(*) FROM ws02_owner.evaluation_logs WHERE idem_key=${q(idem)})::text || ':' ||
 (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
 COALESCE((SELECT receipt_hash FROM ws02_owner.slots WHERE idem_key=${q(idem)}),'NULL');`);
  assert.deepEqual(escapedSolidusReadback, ['0:RESERVED:NULL'],
    'ESCAPED_SOLIDUS_MUTATED_AUDIT_OR_RECEIPT_' + status);
  const whitespaceReadback = pg(`SELECT
 (SELECT count(*) FROM ws02_owner.evaluation_logs WHERE idem_key=${q(idem)})::text || ':' ||
 (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
 COALESCE((SELECT receipt_hash FROM ws02_owner.slots WHERE idem_key=${q(idem)}),'NULL');`);
  assert.deepEqual(whitespaceReadback, ['0:RESERVED:NULL'],
    'STRUCTURAL_WHITESPACE_MUTATED_SLOT_OR_AUDIT_' + status);
  const changed = { ...snapshot, engine_version: 'changed-after-hash' };
  const jsonbDrift = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(traceHash)},${q(status)},
 ${q(JSON.stringify(changed))}::jsonb,${q(bytes)},'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.ok(jsonbDrift.includes('f'), 'JSONB_SEMANTIC_DRIFT_ACCEPTED_' + status);
  // JSON OBJECT WITH UNIQUE KEYS and SHA-256 equality alone permit valid
  // JSON with outer whitespace. The reviewed W5 canonical producer emits a
  // brace-delimited object with NO surrounding bytes. All variants below have
  // valid hashes and identical JSONB meaning; private SQL must fail closed.
  for (const [kind, noncanonicalBytes] of [
    ['leading_space', ' ' + bytes],
    ['trailing_newline', bytes + '\n'],
    ['both_sides', '\t' + bytes + '\r\n'],
  ]) {
    assert.deepEqual(JSON.parse(noncanonicalBytes), snapshot,
      'OUTER_WHITESPACE_JSON_SEMANTICS_DRIFT_' + kind);
    assert.notEqual(noncanonicalBytes, bytes);
    const noncanonicalHash = digest(noncanonicalBytes);
    const rejected = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(noncanonicalHash)},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(noncanonicalBytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
    assert.deepEqual(rejected, ['f'],
      'NONCANONICAL_OUTER_WHITESPACE_ACCEPTED_' + kind + '_' + status);
    const readback = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
      WHERE idem_key=${q(idem)})::text || ':' ||
      (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
      COALESCE((SELECT receipt_hash FROM ws02_owner.slots
        WHERE idem_key=${q(idem)}),'NULL');`);
    assert.deepEqual(readback, ['0:RESERVED:NULL'],
      'OUTER_WHITESPACE_MUTATED_AUDIT_OR_RECEIPT_' + kind + '_' + status);
  }
  // A small canonical trace must not trigger parsing/digest work when the
  // independently supplied JSONB is oversized. No audit or receipt mutation.
  const oversizedJsonb = { ...snapshot, untrusted_extra: 'x'.repeat(262145) };
  assert.ok(Buffer.byteLength(JSON.stringify(oversizedJsonb), 'utf8') > 262144);
  assert.ok(Buffer.byteLength(bytes, 'utf8') < 262144);
  const oversizedJsonbCommit = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(traceHash)},${q(status)},
 ${q(JSON.stringify(oversizedJsonb))}::jsonb,${q(bytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.deepEqual(oversizedJsonbCommit, ['f'],
    'OVERSIZED_JSONB_WITH_SMALL_VALID_TRACE_ACCEPTED_' + status);
  const oversizedJsonbReadback = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
      WHERE idem_key=${q(idem)})::text || ':' ||
      (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
      COALESCE((SELECT receipt_hash FROM ws02_owner.slots
        WHERE idem_key=${q(idem)}),'NULL');`);
  assert.deepEqual(oversizedJsonbReadback, ['0:RESERVED:NULL'],
    'OVERSIZED_JSONB_MUTATED_AUDIT_OR_RECEIPT_' + status);
  // JSONB collapses duplicate keys. A valid digest and matching JSONB are
  // insufficient unless PostgreSQL independently rejects duplicate source keys.
  // Check both root and nested objects before any atomic audit/receipt commit.
  for (const [kind, needle, duplicate] of [
    ['root', '"engine_version":"synthetic-isolated"',
      '"engine_version":"synthetic-isolated","engine_version":"synthetic-isolated"'],
    ['nested', '"🔑":"সূত্র"', '"🔑":"সূত্র","🔑":"সূত্র"'],
    // JSONB decodes escaped key spellings before comparing keys. Prove that
    // aliases of the SAME key cannot bypass SQL UNIQUE KEYS enforcement.
    // String.raw preserves literal backslashes for the PostgreSQL JSON parser.
    ['root_unicode_escape', '"engine_version":"synthetic-isolated"',
      String.raw`"engine_version":"synthetic-isolated","\u0065ngine_version":"synthetic-isolated"`],
    ['nested_surrogate_escape', '"🔑":"সূত্র"',
      String.raw`"🔑":"সূত্র","\ud83d\udd11":"সূত্র"`],
  ]) {
    assert.ok(bytes.includes(needle), 'DUPLICATE_KEY_FIXTURE_MISSING_' + kind);
    const duplicateBytes = bytes.replace(needle, duplicate);
    assert.notEqual(duplicateBytes, bytes);
    assert.deepEqual(JSON.parse(duplicateBytes), snapshot,
      'DUPLICATE_KEY_JSONB_SEMANTIC_EQUIVALENCE_FAILED_' + kind);
    const duplicateHash = digest(duplicateBytes);
    const duplicateCommit = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(duplicateHash)},${q(status)},
 ${q(JSON.stringify(snapshot))}::jsonb,${q(duplicateBytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
    assert.deepEqual(duplicateCommit, ['f'],
      'DUPLICATE_' + kind + '_KEY_ACCEPTED_WITH_VALID_DIGEST_' + status);
    const duplicateReadback = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
        WHERE idem_key=${q(idem)})::text || ':' ||
        (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
        COALESCE((SELECT receipt_hash FROM ws02_owner.slots
          WHERE idem_key=${q(idem)}),'NULL');`);
    assert.deepEqual(duplicateReadback, ['0:RESERVED:NULL'],
      'DUPLICATE_' + kind + '_KEY_MUTATED_AUDIT_OR_RECEIPT_' + status);
  }
  // Even a syntactically valid, SHA-256-consistent JSON trace must be rejected
  // when its UTF-8 byte count exceeds the private SQL envelope's 256 KiB cap.
  // Non-ASCII payload deliberately stays below the limit in JS code units:
  // a character-count check would incorrectly accept it. Synthetic PG17 only.
  const oversizedSnapshot = { ...snapshot,
    individual: [{ kind: 'synthetic', evidence: '😀'.repeat(65536) }] };
  const oversizedBytes = canonical(oversizedSnapshot);
  assert.ok(oversizedBytes.length < 262144,
    'UTF8_LIMIT_TEST_NOT_MULTIBYTE_' + status);
  assert.ok(Buffer.byteLength(oversizedBytes, 'utf8') > 262144,
    'UTF8_LIMIT_TEST_NOT_OVERSIZED_' + status);
  const oversizedDigest = digest(oversizedBytes);
  const oversizedCommit = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},'2026-27',${q(idem)},${q(requestHash)},
 ${q(receiptHash)},${q(oversizedDigest)},${q(status)},
 ${q(JSON.stringify(oversizedSnapshot))}::jsonb,${q(oversizedBytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.deepEqual(oversizedCommit, ['f'],
    'OVERSIZED_UTF8_TRACE_WITH_VALID_DIGEST_ACCEPTED_' + status);
  const oversizedReadback = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
      WHERE idem_key=${q(idem)})::text || ':' ||
      (SELECT state FROM ws02_owner.slots WHERE idem_key=${q(idem)}) || ':' ||
      COALESCE((SELECT receipt_hash FROM ws02_owner.slots
        WHERE idem_key=${q(idem)}),'NULL');`);
  assert.deepEqual(oversizedReadback, ['0:RESERVED:NULL'],
    'OVERSIZED_UTF8_TRACE_MUTATED_AUDIT_OR_RECEIPT_' + status);
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
  // Same taxpayer, actor and idempotency key in a second *authorized* AY:
  // reject a first-year audit trace against the second-year slot, then
  // finalize only with a matching second-year trace. This tests composite
  // year isolation, not the legal validity of either assessment year.
  const nextYear = '2027-28';
  const nextReceipt = 'f'.repeat(64);
  const nextOwner = pg(`INSERT INTO ws02_owner.owners
    (record_id,assessment_year,actor_id,state)
    VALUES (${q(record)},${q(nextYear)},${q(actor)},'ACTIVE')
    RETURNING assessment_year;`);
  assert.deepEqual(nextOwner, [nextYear], 'SECOND_YEAR_OWNER_FIXTURE_FAILED_' + status);
  const nextReserve = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_reserve_citizen_evaluation(
 ${q(actor)},${q(record)},${q(nextYear)},${q(idem)},${q(requestHash)},
 'NBR_ENGINE_CITIZEN_V2_REVIEW')->>'state';`);
  assert.deepEqual(nextReserve, ['RESERVED'],
    'SAME_IDEMPOTENCY_KEY_DIFFERENT_YEAR_RESERVATION_FAILED_' + status);
  const mismatchedYearTrace = { ...snapshot, receipt_hash: nextReceipt };
  const mismatchedYearBytes = verifiedCanonicalAuditTrace(mismatchedYearTrace);
  const mismatchedYearResult = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},${q(nextYear)},${q(idem)},${q(requestHash)},
 ${q(nextReceipt)},${q(digest(mismatchedYearBytes))},${q(status)},
 ${q(JSON.stringify(mismatchedYearTrace))}::jsonb,${q(mismatchedYearBytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.deepEqual(mismatchedYearResult, ['f'],
    'SECOND_YEAR_SLOT_ACCEPTED_FIRST_YEAR_TRACE_' + status);
  const nextBefore = pg(`SELECT (SELECT count(*) FROM ws02_owner.evaluation_logs
      WHERE actor_id=${q(actor)} AND record_id=${q(record)}
        AND assessment_year=${q(nextYear)} AND idem_key=${q(idem)})::text || ':' ||
      (SELECT state FROM ws02_owner.slots WHERE actor_id=${q(actor)}
        AND record_id=${q(record)} AND assessment_year=${q(nextYear)}
        AND idem_key=${q(idem)}) || ':' ||
      COALESCE((SELECT receipt_hash FROM ws02_owner.slots
        WHERE actor_id=${q(actor)} AND record_id=${q(record)}
          AND assessment_year=${q(nextYear)} AND idem_key=${q(idem)}),'NULL');`);
  assert.deepEqual(nextBefore, ['0:RESERVED:NULL'],
    'SECOND_YEAR_MISMATCH_MUTATED_AUDIT_OR_RECEIPT_' + status);
  const nextSnapshot = { ...snapshot, assessment_year: nextYear,
    income_year: '2026-27', receipt_hash: nextReceipt };
  const nextBytes = verifiedCanonicalAuditTrace(nextSnapshot);
  const nextCommit = pg(`SET ROLE ws02_owner_engine;
SELECT ws02_owner.nbr_commit_evaluation_versioned_candidate(
 ${q(actor)},${q(record)},${q(nextYear)},${q(idem)},${q(requestHash)},
 ${q(nextReceipt)},${q(digest(nextBytes))},${q(status)},
 ${q(JSON.stringify(nextSnapshot))}::jsonb,${q(nextBytes)},
 'NBR_W5_CANONICAL_UTF8_V1');`);
  assert.deepEqual(nextCommit, ['t'], 'SECOND_YEAR_VALID_COMMIT_FAILED_' + status);
  const yearReadback = pg(`SELECT assessment_year || ':' || state || ':' ||
      receipt_hash FROM ws02_owner.slots
    WHERE actor_id=${q(actor)} AND record_id=${q(record)} AND idem_key=${q(idem)}
    ORDER BY assessment_year;`);
  assert.deepEqual(yearReadback,
    ['2026-27:FINALIZED:' + receiptHash, nextYear + ':FINALIZED:' + nextReceipt],
    'YEAR_SCOPED_SLOTS_OR_RECEIPTS_CROSSED_' + status);
  const yearAuditReadback = pg(`SELECT assessment_year || ':' ||
      (audit_trace->>'assessment_year') || ':' || receipt_hash
    FROM ws02_owner.evaluation_logs
    WHERE actor_id=${q(actor)} AND record_id=${q(record)} AND idem_key=${q(idem)}
    ORDER BY assessment_year;`);
  assert.deepEqual(yearAuditReadback,
    ['2026-27:2026-27:' + receiptHash, nextYear + ':' + nextYear + ':' + nextReceipt],
    'YEAR_SCOPED_AUDIT_TRACE_OR_RECEIPT_CROSSED_' + status);
}
console.log('PASS_SCOPED_NEGATIVE_ZERO_VALID_HASH_REJECTED_TWELVE_CASES_THREE_STATES');
console.log('PASS_SCOPED_PADDED_EXPONENT_VALID_HASH_REJECTED_TWELVE_CASES_THREE_STATES');
console.log('PASS_SCOPED_ZERO_EXPONENT_VALID_HASH_REJECTED_TWELVE_CASES_THREE_STATES');
console.log('PASS_SCOPED_REDUNDANT_FRACTIONAL_ZERO_VALID_HASH_REJECTED_NINE_CASES_THREE_STATES');
console.log('PASS_SCOPED_ESCAPED_SOLIDUS_VALID_HASH_REJECTED_THREE_STATES');
console.log('PASS_SCOPED_PRINTABLE_ASCII_UNICODE_ESCAPES_VALID_HASH_REJECTED_NINE_CASES_THREE_STATES');
console.log('PASS_SCOPED_NONASCII_UNICODE_ESCAPES_VALID_HASH_REJECTED_NINE_CASES_THREE_STATES');
console.log('PASS_SCOPED_NONCANONICAL_CONTROL_ESCAPES_18_NEGATIVES_3_CANONICAL_POSITIVES');
console.log('PASS_SCOPED_STRUCTURAL_WHITESPACE_RECOMPUTED_SHA_REJECTED_TWELVE_CASES_THREE_STATES');
console.log('PASS_SCOPED_OUTER_WHITESPACE_NONCANONICAL_JSON_REJECTED_NINE_CASES_THREE_STATES');
console.log('PASS_SCOPED_CROSS_YEAR_SAME_KEY_TWO_AUTHORIZED_YEARS_THREE_STATES');
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
