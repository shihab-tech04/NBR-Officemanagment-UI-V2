#!/usr/bin/env node
// Portable, fail-closed change allowlist for a reviewed multi-tranche UX integration.
// Checks actual git diff; a test file or comment is never itself an approval.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export function verifyPaths(changed, manifest) {
  assert.equal(manifest.schema, 'ux/change-allowlist/v1');
  assert.ok(Array.isArray(manifest.approvedPaths) && manifest.approvedPaths.length > 0,
    'Nonempty independently reviewed allowed-path inventory required');
  assert.ok(manifest.approvedPaths.every(x => typeof x === 'string' && x.length > 0),
    'Approved path must be an exact nonempty string');
  assert.equal(new Set(manifest.approvedPaths).size, manifest.approvedPaths.length,
    'Duplicate approved path');
  assert.equal(manifest.status, 'SCOPE_ONLY', 'Allowlist cannot certify visual or product acceptance');
  const permitted = new Set(manifest.approvedPaths);
  const unexpected = [...new Set(changed)].filter(x => !permitted.has(x));
  return { ok: unexpected.length === 0, checked: changed.length, unexpected };
}

export function selfTest() {
  const m = { schema:'ux/change-allowlist/v1', status:'SCOPE_ONLY', approvedPaths:['src/a.ts','docs/allowlist.json'] };
  assert.equal(verifyPaths(['src/a.ts'],m).ok,true);
  assert.deepEqual(verifyPaths(['src/a.ts','src/evil.ts'],m).unexpected,['src/evil.ts']);
  assert.equal(verifyPaths([],m).ok,true);
  assert.throws(() => verifyPaths(['src/a.ts'],{...m,status:'ACCEPTED'}));
  assert.throws(() => verifyPaths(['src/a.ts'],{...m,approvedPaths:[]}));
  assert.throws(() => verifyPaths(['src/a.ts'],{...m,approvedPaths:['src/a.ts','src/a.ts']}));
  console.log('PASS: 6 positive/negative change-scope self-tests');
}

const flag = process.argv[2];
if (flag === '--self-test') selfTest();
else if (flag === '--check') {
  try {
    const idx = process.argv.indexOf('--base');
    assert.ok(idx > 0 && process.argv[idx+1], 'Explicit base SHA required');
    const base = process.argv[idx+1];
    assert.match(base, /^[a-f0-9]{40}$/, 'Base SHA must be a full Git commit SHA');
    const manifest = JSON.parse(fs.readFileSync('docs/ux/integration-change-allowlist.json','utf8'));
    const lines = execFileSync('git',['diff','--name-only',base,'HEAD'], {encoding:'utf8'}).trim();
    const changed = lines ? lines.split('\n') : [];
    const result = verifyPaths(changed,manifest);
    if (!result.ok) {
      console.error('BLOCKED: unapproved paths in combined PR:',result.unexpected.join(', '));
      process.exitCode=2;
    } else console.log(`PASS: ${result.checked} changed paths are individually approved for this integration scope. THIS IS NOT UX ACCEPTANCE.`);
  } catch(error) {
    console.error('BLOCKED: UX integration change-scope check:',error.message);
    process.exitCode=2;
  }
} else {
  console.error('Usage: node scripts/ux-pr-scope-check.mjs --self-test | --check --base <40-digit-SHA>');
  process.exitCode=2;
}