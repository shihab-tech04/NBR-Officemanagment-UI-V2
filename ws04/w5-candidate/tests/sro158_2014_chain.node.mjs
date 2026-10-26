import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Historical source-graph integrity only. No current-law approval, PDF byte
// authentication, tax-rate activation, real taxpayer data or production access.
const file = new URL('../evidence/t3-reg-11-sro158-2014-intervening-chain-review.json', import.meta.url);
const evidence = JSON.parse(readFileSync(file, 'utf8'));

function assertSourceChain(r) {
  assert.equal(r.recordId, 'T3-REG-11-SRO158-2014-INTERVENING-CHAIN');
  assert.equal(r.status, 'LEGAL_REVIEW_HOLD');
  assert.equal(r.sources.length, 5);
  const [base, amendment2017, repeal2023, amendment2025, repeal2025] = r.sources;
  assert.deepEqual(r.sources.map(s => s.sro), [
    '158-Ain/IncomeTax/2014', '207-Ain/IncomeTax/2017',
    '169-Ain/IncomeTax/2023', '154-Ain/IncomeTax-9/2025',
    '268-Ain/IncomeTax-13/2025',
  ]);
  assert.deepEqual(r.sources.map(s => s.kind), [
    'BASE_NOTIFICATION', 'INTERVENING_AMENDMENT', 'REPEAL',
    'PURPORTED_AMENDMENT_AFTER_REPEAL', 'REPEAL_OF_2025_AMENDMENT',
  ]);
  assert.deepEqual(r.sources.map(s => s.notificationDate), [
    '2014-06-26', '2017-06-21', '2023-05-23', '2025-05-26', '2025-06-24',
  ]);
  for (const s of r.sources) {
    const u = new URL(s.officialPdf ?? s.officialCircular);
    assert.equal(u.protocol, 'https:');
    assert.equal(u.hostname, 'nbr.gov.bd');
    assert.equal(s.pdfSha256 ?? s.sourceSha256, null);
  }
  assert.equal(new URL(base.officialPdf).pathname, '/uploads/sros/514.pdf');
  assert.equal(base.evidenceLevel, 'OFFICIAL_NBR_SEARCH_INDEX_AND_PARTIAL_PDF_TEXT_ONLY');
  assert.equal(base.pdfBytesVerified, false);
  assert.equal(base.fullTextCompared, false);
  assert.equal(base.reportedHistoricalRate, '25%');
  assert.equal(base.engineRateApproved, false);
  assert.equal(amendment2017.amends, base.sro);
  assert.equal(amendment2017.gazettePublicationDate, '2017-06-22');
  assert.equal(amendment2017.effectiveFrom, '2017-07-01');
  assert.equal(amendment2017.evidenceLevel, 'NBR_HOSTED_GAZETTE_EXTRACTED_TEXT_UNHASHED');
  assert.equal(amendment2017.pdfBytesVerified, false);
  assert.equal(amendment2017.reportedChange,
    'Adds Bangladesh Economic Zones Authority to the listed entities');
  assert.equal(amendment2017.engineEffectApproved, false);
  assert.equal(repeal2023.repeals, base.sro);
  assert.equal(repeal2023.originalGazetteVerified, false);
  assert.equal(repeal2023.locator, 'Appendix 8, printed page 241');
  assert.equal(amendment2025.amends, base.sro);
  assert.equal(repeal2025.repeals, amendment2025.sro);
  assert.equal(repeal2025.effectiveFrom, amendment2025.effectiveFrom);
  assert.equal(repeal2025.effectiveFrom, '2025-07-01');
  assert.equal(repeal2025.officialIndexDate, '2025-06-25');
  for (const key of [
    'original2014PdfBytesVerified', 'intervening2014To2023AmendmentsComplete',
    'priorRepealSavingsAdjudicated', 'revivalLegallyEstablished',
    'sameDay2025RepealAdjudicated', 'taxpayerScopeApproved',
    'assessmentIncomeYearApproved', 'ws01LegalSignoff', 'engineActivation',
  ]) assert.equal(r.review[key], false, 'Legal review gate must stay closed: '+key);
  assert.equal(r.frozenRegistryModified, false);
  assert.equal(r.original137MatrixModified, false);
}

test('historical 2014-2017-2023-2025 source chain remains review-only', () => {
  assertSourceChain(evidence);
});

for (const [name, mutate] of [
  ['original 2014 PDF falsely marked verified', r => { r.review.original2014PdfBytesVerified = true; }],
  ['2014 historical rate activated', r => { r.sources[0].engineRateApproved = true; }],
  ['2017 amendment target changed', r => { r.sources[1].amends = r.sources[3].sro; }],
  ['2017 effective date moved', r => { r.sources[1].effectiveFrom = '2018-07-01'; }],
  ['2017 addition silently changed', r => { r.sources[1].reportedChange = 'All taxpayers'; }],
  ['2017 official URL replaced', r => { r.sources[1].officialPdf = 'https://example.org/fake.pdf'; }],
  ['2017 raw PDF digest invented', r => { r.sources[1].pdfSha256 = '0'.repeat(64); }],
  ['2023 repeal target silently substituted', r => { r.sources[2].repeals = r.sources[1].sro; }],
  ['2023 savings declared without review', r => { r.review.priorRepealSavingsAdjudicated = true; }],
  ['2025 amendment declared valid by revival', r => { r.review.revivalLegallyEstablished = true; }],
  ['2025 same-day repeal moved', r => { r.sources[4].effectiveFrom = '2025-07-02'; }],
  ['2014-to-2023 amendment search falsely certified', r => { r.review.intervening2014To2023AmendmentsComplete = true; }],
  ['taxpayer/year applicability invented', r => { r.review.assessmentIncomeYearApproved = true; }],
  ['engine activation enabled', r => { r.review.engineActivation = true; }],
]) {
  test('rejects '+name, () => {
    const candidate = structuredClone(evidence);
    mutate(candidate);
    assert.throws(() => assertSourceChain(candidate));
  });
}
