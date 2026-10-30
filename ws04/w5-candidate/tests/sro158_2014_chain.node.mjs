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
    const u = new URL(s.officialPdf ?? s.officialCircular ?? s.officialIndex);
    assert.equal(u.protocol, 'https:');
    assert.equal(u.hostname, 'nbr.gov.bd');
    assert.equal(s.pdfSha256 === undefined ? s.sourceSha256 : s.pdfSha256, null);
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

/*
 * Cross-record integrity: the 2014→2025 historical source graph and the
 * independently recorded SRO268 Gazette intake must describe the SAME
 * notification relationships. Their individual tests alone cannot catch
 * drift between these two files. This check does not adjudicate legal effect.
 */
const sro268File = new URL('../evidence/t3-reg-11-sro268-2025-official-source-hold.json', import.meta.url);
const sro268Evidence = JSON.parse(readFileSync(sro268File, 'utf8'));

function assertCrossEvidenceConsistency(history, intake) {
  assert.equal(history.status, 'LEGAL_REVIEW_HOLD');
  assert.equal(intake.applicability.status, 'LEGAL_REVIEW_HOLD');
  const [base, amendment2017, repeal2023, amendment2025, repeal2025] = history.sources;
  const conflict = intake.priorRepealConflict;
  const predecessor154 = intake.predecessorSourceReadback.records.find(
    item => item.sro === amendment2025.sro
  );
  assert.ok(predecessor154, 'SRO154 must remain in predecessor source readback');
  assert.equal(base.sro, conflict.baseSro.sro);
  assert.equal(base.notificationDate, conflict.baseSro.gazetteDate);
  assert.equal(base.officialPdf, conflict.baseSro.officialNBRPdfLink);
  assert.equal(base.pdfBytesVerified, conflict.baseSro.sourcePdfRetrieved);
  assert.equal(base.pdfSha256, conflict.baseSro.sourcePdfSha256);
  assert.equal(amendment2017.amends, base.sro);
  assert.equal(repeal2023.sro, conflict.priorRepeal.sro);
  assert.equal(repeal2023.notificationDate, conflict.priorRepeal.gazetteDate);
  assert.equal(repeal2023.repeals, conflict.priorRepeal.namedRepealTarget);
  assert.equal(repeal2023.officialCircular, conflict.priorRepeal.officialCircular);
  assert.equal(amendment2025.sro, predecessor154.sro);
  assert.equal(amendment2025.notificationDate, predecessor154.gazetteDate);
  assert.equal(amendment2025.effectiveFrom, predecessor154.effectiveFrom);
  assert.equal(amendment2025.amends, predecessor154.amendsSro);
  assert.equal(amendment2025.officialPdf, predecessor154.sourceUrl);
  assert.equal(amendment2025.sro, conflict.laterAmendment.sro);
  assert.equal(amendment2025.amends, conflict.laterAmendment.amendsSro);
  assert.equal(repeal2025.sro, intake.source.sro);
  assert.equal(repeal2025.notificationDate, intake.source.gazetteDate);
  assert.equal(repeal2025.effectiveFrom, intake.source.effectiveFrom);
  assert.equal(repeal2025.repeals, amendment2025.sro);
  assert.equal(repeal2025.sro, conflict.laterAmendment.laterRepealedBy);
  assert.equal(repeal2025.effectiveFrom, conflict.laterAmendment.repealEffectiveFrom);
  const repealTarget154 = intake.repealTargets.filter(
    item => item.sroNumber === 154 && item.year === 2025
  );
  assert.equal(repealTarget154.length, 1, 'Exactly one SRO154/2025 repeal target');
  assert.equal(repealTarget154[0].date, amendment2025.notificationDate);
  assert.equal(history.review.ws01LegalSignoff, false);
  assert.equal(history.review.engineActivation, false);
  assert.equal(intake.applicability.engineActivation, false);
  assert.equal(conflict.ws01Adjudicated, false);
  assert.equal(conflict.engineActivation, false);
  assert.equal(history.frozenRegistryModified, false);
  assert.equal(intake.frozenRegistryModified, false);
  assert.equal(history.original137MatrixModified, false);
  assert.equal(intake.original137MatrixModified, false);
}

test('independent T3-REG-11 evidence records agree while legal HOLD remains', () => {
  assertCrossEvidenceConsistency(evidence, sro268Evidence);
});

for (const [name, mutate] of [
  ['2014 source URL drift', (h, i) => { h.sources[0].officialPdf = 'https://nbr.gov.bd/uploads/sros/changed.pdf'; }],
  ['2014 date drift', (h, i) => { i.priorRepealConflict.baseSro.gazetteDate = '2014-06-27'; }],
  ['2023 repealer identity drift', (h, i) => { i.priorRepealConflict.priorRepeal.sro = '168-Ain/IncomeTax/2023'; }],
  ['2023 repeal target drift', (h, i) => { h.sources[2].repeals = h.sources[1].sro; }],
  ['2023 circular source drift', (h, i) => { h.sources[2].officialCircular = 'https://nbr.gov.bd/uploads/paripatra/other.pdf'; }],
  ['2025 amendment original Gazette drift', (h, i) => { i.predecessorSourceReadback.records[1].sourceUrl = 'https://nbr.gov.bd/uploads/sros/other.pdf'; }],
  ['2025 amendment effective-date drift', (h, i) => { h.sources[3].effectiveFrom = '2025-07-02'; }],
  ['2025 repeal notification date drift', (h, i) => { h.sources[4].notificationDate = '2025-06-25'; }],
  ['2025 repeal target date drift', (h, i) => { i.repealTargets[1].date = '2025-05-27'; }],
  ['2025 repeal identity drift', (h, i) => { i.source.sro = '269-Ain/IncomeTax-13/2025'; }],
  ['historical chain silently approved', (h, i) => { h.review.ws01LegalSignoff = true; }],
  ['independent Gazette intake silently activated', (h, i) => { i.applicability.engineActivation = true; }],
]) {
  test('cross-record guard rejects '+name, () => {
    const h = structuredClone(evidence);
    const i = structuredClone(sro268Evidence);
    mutate(h, i);
    assert.throws(() => assertCrossEvidenceConsistency(h, i));
  });
}
