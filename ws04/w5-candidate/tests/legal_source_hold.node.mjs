import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = new URL('../evidence/t3-reg-11-sro268-2025-official-source-hold.json', import.meta.url);
const source = JSON.parse(readFileSync(file, 'utf8'));

// Review-only source intake: predecessor texts were read from NBR-hosted PDFs, but
// raw PDF bytes, legal applicability, savings and same-day repeal are NOT certified.
// This is NOT a Gazette PDF byte/hash verification,
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

  // The two actual predecessor texts have now been located and read. SRO156
  // appears as a Gazette reproduction in NBR's 2024-25 circular; SRO154
  // appears as an NBR-hosted Gazette PDF. This is NOT a legal applicability
  // opinion, an approved tax rate, or proof of raw PDF file identity.
  const pred = record.predecessorSourceReadback;
  assert.equal(pred.status, 'OFFICIAL_PREDECESSOR_TEXT_READ_REVIEW_ONLY');
  assert.equal(pred.pdfBytesVerified, false);
  assert.equal(pred.taxpayerApplicabilityApproved, false);
  assert.equal(pred.savingsAdjudicated, false);
  assert.equal(pred.legalEffectOfSameDayRepealAdjudicated, false);
  assert.equal(pred.records.length, 2);
  const [fund, amendment] = pred.records;
  assert.equal(fund.sro, '156-Ain/IncomeTax-31/2024');
  assert.equal(fund.sourceKind, 'NBR_OFFICIAL_CIRCULAR_REPRODUCED_GAZETTE_TEXT');
  const fundUrl = new URL(fund.sourceUrl);
  assert.equal(fundUrl.protocol, 'https:');
  assert.equal(fundUrl.hostname, 'nbr.gov.bd');
  assert.equal(fundUrl.pathname, '/uploads/paripatra/Paripatra_2024-2025_final_amended.pdf');
  assert.equal(fund.locator.appendix, 'Appendix 19');
  assert.equal(fund.locator.pdfPageIndexZeroBased, 291);
  assert.equal(fund.gazetteDate, '2024-05-29');
  assert.equal(fund.effectiveFrom, '2024-07-01');
  assert.equal(fund.statutoryPower, 'Income Tax Act 2023, section 76(1)');
  assert.deepEqual(fund.fundCategories, [
    'Recognized Provident Fund', 'Approved Gratuity Fund',
    'Approved Superannuation Fund', 'Approved Pension Fund',
  ]);
  assert.equal(fund.historicalRateText, '15%');
  assert.equal(fund.historicalRateAuthorizedForEngine, false);
  assert.equal(fund.sourcePdfSha256, null);
  assert.equal(amendment.sro, '154-Ain/IncomeTax-9/2025');
  assert.equal(amendment.sourceKind, 'NBR_OFFICIAL_GAZETTE_PDF');
  const amendmentUrl = new URL(amendment.sourceUrl);
  assert.equal(amendmentUrl.protocol, 'https:');
  assert.equal(amendmentUrl.hostname, 'nbr.gov.bd');
  assert.equal(amendmentUrl.pathname, '/uploads/sros/IT_SRO-154.pdf');
  assert.equal(amendment.locator.pdfPageIndexZeroBased, 0);
  assert.equal(amendment.gazetteDate, '2025-05-26');
  assert.equal(amendment.nbrIndexDate, '2025-06-02');
  assert.equal(amendment.effectiveFrom, '2025-07-01');
  assert.equal(amendment.effectiveFrom, record.source.effectiveFrom);
  assert.equal(amendment.statutoryPower, 'Income Tax Act 2023, section 76(3)');
  assert.equal(amendment.amendsSro, '158-Ain/IncomeTax/2014');
  assert.equal(amendment.sameEffectiveDateAsSro268Repeal, true);
  assert.equal(amendment.omittedSubclausesIndependentlyCrosswalked, false);
  assert.equal(amendment.sourcePdfSha256, null);
  // SRO154 modifies SRO158/2014; it does NOT establish that the entire 2014
  // SRO was repealed. Both predecessor lines still require legal adjudication.
  assert.equal(record.applicability.originalPredecessorTextsIndependentlyCompared, false);

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
  ['historical 15% rate promoted to engine', r=>{r.predecessorSourceReadback.records[0].historicalRateAuthorizedForEngine=true;}],
  ['fund category replaced with generic taxpayer', r=>{r.predecessorSourceReadback.records[0].fundCategories[0]='All taxpayers';}],
  ['SRO156 historical effective date changed', r=>{r.predecessorSourceReadback.records[0].effectiveFrom='2025-07-01';}],
  ['SRO154 base notification substituted', r=>{r.predecessorSourceReadback.records[1].amendsSro='156-Ain/IncomeTax-31/2024';}],
  ['SRO154 same-day repeal silently ignored', r=>{r.predecessorSourceReadback.records[1].sameEffectiveDateAsSro268Repeal=false;}],
  ['SRO154 Gazette replaced by untrusted host', r=>{r.predecessorSourceReadback.records[1].sourceUrl='https://example.org/fake.pdf';}],
  ['SRO154 PDF checksum fabricated', r=>{r.predecessorSourceReadback.records[1].sourcePdfSha256='0'.repeat(64);}],
  ['predecessor readback treated as legal approval', r=>{r.predecessorSourceReadback.taxpayerApplicabilityApproved=true;}],
  ['frozen registry edit', r=>{r.frozenRegistryModified=true;}],
]) {
  test('rejects '+name, () => {
    const candidate=clone();
    mutate(candidate);
    assert.throws(()=>assertReviewHold(candidate));
  });
}
