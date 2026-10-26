import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = new URL('../evidence/t3-reg-11-sro268-2025-official-source-hold.json', import.meta.url);
const source = JSON.parse(readFileSync(file, 'utf8'));

// Review-only source intake: this is NOT a Gazette PDF byte/hash verification,
// legal opinion, taxpayer applicability approval, or production rule migration.
function assertReviewHold(record) {
  assert.equal(record.recordId, 'T3-REG-11-SRO-268-2025');
  assert.equal(record.source.sro, '268-Ain/IncomeTax-13/2025');
  for (const key of ['officialPdf','officialIndex']) {
    const url = new URL(record.source[key]);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'nbr.gov.bd');
  }
  assert.equal(record.source.gazetteDate, '2025-06-24');
  assert.equal(record.source.indexDate, '2025-06-25');
  assert.equal(record.source.indexGazetteDateMismatch, true);
  assert.equal(record.source.effectiveFrom, '2025-07-01');
  assert.equal(record.source.pdfSha256, null);
  assert.equal(record.source.evidenceLevel, 'OFFICIAL_PDF_VISUALLY_READ_UNHASHED');
  assert.deepEqual(
    record.repealTargets.map(({sroNumber,year,date})=>[sroNumber,year,date]),
    [[156,2024,'2024-05-29'],[154,2025,'2025-05-26']],
  );
  assert.equal(record.applicability.status, 'LEGAL_REVIEW_HOLD');
  assert.equal(record.applicability.taxpayerScope, 'UNDETERMINED');
  assert.equal(record.applicability.savingsAnalysis, 'PENDING_WS01');
  assert.equal(record.applicability.assessmentYearEffect, 'UNDETERMINED');
  assert.equal(record.applicability.incomeYearEffect, 'UNDETERMINED');
  assert.equal(record.applicability.engineActivation, false);
  assert.equal(record.frozenRegistryModified, false);
  assert.equal(record.original137MatrixModified, false);
}

const clone = () => structuredClone(source);

test('official SRO268 source intake remains review-only, not certified', () => {
  assertReviewHold(source);
});

for (const [name,mutate] of [
  ['silent engine activation', r=>{r.applicability.engineActivation=true;}],
  ['uncertified source promotion', r=>{r.applicability.status='CERTIFIED';}],
  ['invented taxpayer scope', r=>{r.applicability.taxpayerScope='ALL';}],
  ['unreviewed savings', r=>{r.applicability.savingsAnalysis='APPROVED';}],
  ['wrong predecessor substitution', r=>{r.repealTargets[0].sroNumber=999;}],
  ['index date treated as Gazette date', r=>{r.source.gazetteDate='2025-06-25';}],
  ['unverified PDF digest claim', r=>{r.source.pdfSha256='a'.repeat(64);}],
  ['frozen registry edit', r=>{r.frozenRegistryModified=true;}],
]) {
  test('rejects '+name, () => {
    const candidate=clone();
    mutate(candidate);
    assert.throws(()=>assertReviewHold(candidate));
  });
}
