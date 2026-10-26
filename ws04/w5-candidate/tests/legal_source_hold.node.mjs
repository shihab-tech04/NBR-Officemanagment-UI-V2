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
  // Official NBR Income Tax Circular 2025–26, Appendix 7 (printed p.152,
  // PDF zero-based page 157), independently repeats the Gazette repeal chain.
  // This is textual corroboration, NOT a PDF byte-hash or legal applicability approval.
  const circular = record.officialCircularCorroboration;
  const circularUrl = new URL(circular.url);
  assert.equal(circularUrl.protocol, 'https:');
  assert.equal(circularUrl.hostname, 'nbr.gov.bd');
  assert.equal(circularUrl.pathname, '/uploads/paripatra/Income-tax_Paripatra_2025-2026.pdf');
  assert.equal(circular.appendix, 'Appendix 7');
  assert.equal(circular.pdfPageIndexZeroBased, 157);
  assert.equal(circular.printedPage, 152);
  assert.equal(circular.pdfSha256, null);
  assert.equal(circular.sro, record.source.sro);
  assert.equal(circular.gazetteDate, record.source.gazetteDate);
  assert.equal(circular.effectiveFrom, record.source.effectiveFrom);
  assert.deepEqual(circular.repealTargets,
    record.repealTargets.map(({sroNumber,year,date})=>({sroNumber,year,date})));
  assert.equal(circular.legalAuthority, 'Income Tax Act 2023, section 76(3)');
  assert.equal(circular.doesNotDetermineTaxpayerOrAssessmentYearApplicability, true);
  assert.equal(record.applicability.originalPredecessorTextsIndependentlyCompared, false);
  assert.equal(record.applicability.laterAmendmentSearchCertified, false);
  assert.equal(record.applicability.circularCorroborationDoesNotLiftHold, true);

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
  ['circular wrong repealed SRO year', r=>{r.officialCircularCorroboration.repealTargets[1].year=2024;}],
  ['circular false Gazette date', r=>{r.officialCircularCorroboration.gazetteDate='2025-06-25';}],
  ['circular invented digest', r=>{r.officialCircularCorroboration.pdfSha256='f'.repeat(64);}],
  ['circular treated as legal approval', r=>{r.applicability.circularCorroborationDoesNotLiftHold=false;}],
  ['circular wrong official source', r=>{r.officialCircularCorroboration.url='https://example.org/unknown.pdf';}],
  ['unreviewed predecessor texts claimed reviewed', r=>{r.applicability.originalPredecessorTextsIndependentlyCompared=true;}],
  ['unreviewed later amendments claimed certified', r=>{r.applicability.laterAmendmentSearchCertified=true;}],
  ['frozen registry edit', r=>{r.frozenRegistryModified=true;}],
]) {
  test('rejects '+name, () => {
    const candidate=clone();
    mutate(candidate);
    assert.throws(()=>assertReviewHold(candidate));
  });
}
