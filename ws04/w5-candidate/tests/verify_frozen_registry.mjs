#!/usr/bin/env node
// Offline-only verification of a controlled NBR legal registry source.
// Never commit, upload, or print the registry contents. This script does not
// authorize a tax calculation or certify current law.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const EXPECTED_SOURCE_SHA256 = '34902bac07a459a4f0c051b90bfe3b4c492f2465d06c661bab18ab7f36252184';
const EXPECTED_IDENTITY_SHA256 = '0c917287e5f9c0d51b5cd77dea03f813d4fe8ccc382ec9fec74bf850cc444871';
const EXPECTED_RULE_COUNT = 366;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function verifyFrozenBytes(bytes, expected = {
  source: EXPECTED_SOURCE_SHA256,
  identity: EXPECTED_IDENTITY_SHA256,
  count: EXPECTED_RULE_COUNT,
}) {
  const sourceHash = sha256(bytes);
  if (sourceHash !== expected.source) throw Error('FROZEN_SOURCE_SHA_MISMATCH');
  let parsed;
  try { parsed = JSON.parse(bytes.toString('utf8')); }
  catch { throw Error('FROZEN_SOURCE_JSON_INVALID'); }
  if (!parsed || !Array.isArray(parsed.rules) || parsed.rules.length !== expected.count) {
    throw Error('FROZEN_RULE_COUNT_MISMATCH');
  }
  const ids = parsed.rules.map((rule) => rule?.rule_id);
  if (ids.some((id) => typeof id !== 'string' || id.length < 1 || id.length > 128 || id.trim() !== id || /[\x00-\x1f\x7f]/.test(id)) ||
      new Set(ids).size !== expected.count) {
    throw Error('FROZEN_RULE_IDENTITIES_INVALID');
  }
  const identityHash = sha256([...ids].sort().join('\n'));
  if (identityHash !== expected.identity) throw Error('FROZEN_IDENTITY_SHA_MISMATCH');
  return { sourceSha256: sourceHash, identitySha256: identityHash, ruleCount: ids.length };
}

if (process.argv[2] === '--self-test') {
  // The CI self-test is intentionally synthetic. It cannot claim that the
  // private frozen source was present or that the 89-case runtime passed.
  const valid = Buffer.from(JSON.stringify({ rules: [{ rule_id: 'A' }, { rule_id: 'B' }] }));
  const expected = { source: sha256(valid), identity: sha256('A\nB'), count: 2 };
  assert.deepEqual(verifyFrozenBytes(valid, expected), {
    sourceSha256: expected.source, identitySha256: expected.identity, ruleCount: 2,
  });
  assert.throws(() => verifyFrozenBytes(Buffer.from('tampered'), expected), /FROZEN_SOURCE_SHA_MISMATCH/);
  const duplicate = Buffer.from(JSON.stringify({ rules: [{ rule_id: 'A' }, { rule_id: 'A' }] }));
  assert.throws(() => verifyFrozenBytes(duplicate, { ...expected, source: sha256(duplicate) }),
    /FROZEN_RULE_IDENTITIES_INVALID/);
  const wrongCount = Buffer.from(JSON.stringify({ rules: [{ rule_id: 'A' }] }));
  assert.throws(() => verifyFrozenBytes(wrongCount, { ...expected, source: sha256(wrongCount) }),
    /FROZEN_RULE_COUNT_MISMATCH/);
  assert.throws(() => verifyFrozenBytes(valid, { ...expected, identity: '0'.repeat(64) }),
    /FROZEN_IDENTITY_SHA_MISMATCH/);
  console.log('PASS: offline frozen-registry verifier synthetic self-test (not original runtime)');
} else if (process.argv.length === 3 && process.argv[2] && !process.argv[2].startsWith('-')) {
  try {
    const result = verifyFrozenBytes(readFileSync(process.argv[2]));
    console.log(JSON.stringify({ status: 'FROZEN_BYTES_VERIFIED', ...result,
      caveat: 'Not a legal certification, original Agent 137, or installed/hosted E2E PASS' }));
  } catch (error) {
    console.error(String(error?.message ?? error));
    process.exitCode = 1;
  }
} else {
  console.error('Usage: node verify_frozen_registry.mjs <private-registry.json> | --self-test');
  process.exitCode = 2;
}
