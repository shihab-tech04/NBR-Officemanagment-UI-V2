import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { OLD, V2, verifyOfficeCmsCutover } from './office-cms-cutover-gate.mjs';

const keys = generateKeyPairSync('ed25519');
const pub = keys.publicKey.export({format:'pem',type:'spki'});
const officeTreeSha='a'.repeat(40),taxTreeSha='b'.repeat(40);
const now=Date.parse('2026-11-15T17:00:00Z'),key='sb_publishable_example';
const checks=[
  'originalSqlAuthRestore','targetSqlAuthRestore','officeSqlAuthRestore',
  'originalStorageRestore','targetStorageRestore','originalAccountIdentity',
  'paymentIdempotency','officeAuthorizedReadback','storageByteIntegrity',
  'rollbackRehearsal','protectedReleaseApproval','officeCmsV2Readback',
  'taxpayerLiveV2Readback','legacyNonFinancialEvidence','legacyRecordsRetainedReadOnly',
];
const canonical=x=>Array.isArray(x)?'['+x.map(canonical).join(',')+']':x&&typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
function envelope(edit=()=>{}) {
  const payload={
    schema:'sohojkor-hybrid-cutover-v1',source:OLD,target:V2,office:'ihbtabrvmyiwikqqbhrf',
    officeTreeSha,treeSha:taxTreeSha,taxpayerDeployedCommit:'c'.repeat(40),
    issuedAt:'2026-11-15T16:50:00Z',expiresAt:'2026-11-15T18:00:00Z',
    historyMode:'no-settled-payments',
    evidence:Object.fromEntries(checks.map(k=>[k,{passed:true,sha256:'d'.repeat(64),verifiedAt:'2026-11-15T16:55:00Z'}])),
  };
  edit(payload);
  return JSON.stringify({payload,signature:sign(null,Buffer.from(canonical(payload)),keys.privateKey).toString('base64')});
}
const params=()=>({cmsUrl:V2,publishableKey:key,officeTreeSha,publicKey:pub,proofJson:envelope(),now});
test('original CMS remains available without a cutover proof',()=>{
  assert.equal(verifyOfficeCmsCutover({cmsUrl:OLD,publishableKey:key}),'original');
});
test('blocks unknown origins and privileged/absent client keys',()=>{
  assert.throws(()=>verifyOfficeCmsCutover({cmsUrl:'https://other.supabase.co',publishableKey:key}),/Unknown/);
  assert.throws(()=>verifyOfficeCmsCutover({cmsUrl:OLD,publishableKey:'sb_secret_privileged'}),/publishable/);
});
test('blocks V2 CMS if no signed approval exists',()=>{
  assert.throws(()=>verifyOfficeCmsCutover({cmsUrl:V2,publishableKey:key}),/signed release proof absent/);
});
test('accepts only precisely scoped signed approval with verified evidence',()=>{
  assert.equal(verifyOfficeCmsCutover(params()),'v2-approved');
});
test('rejects mismatched Office tree, missing Office readback and stale proof',()=>{
  assert.throws(()=>verifyOfficeCmsCutover({...params(),officeTreeSha:'e'.repeat(40)}),/incorrect source/);
  assert.throws(()=>verifyOfficeCmsCutover({...params(),proofJson:envelope(p=>{delete p.evidence.officeCmsV2Readback;})}),/officeCmsV2Readback/);
  assert.throws(()=>verifyOfficeCmsCutover({...params(),now:Date.parse('2026-11-16T18:00:00Z')}),/approval period/);
});
test('rejects tampered signature even with claims of valid approvals',()=>{
  const proof=JSON.parse(envelope());
  proof.payload.evidence.originalAccountIdentity.sha256='f'.repeat(64);
  assert.throws(()=>verifyOfficeCmsCutover({...params(),proofJson:JSON.stringify(proof)}),/signature invalid/);
});
test('no-history release requires retained archived evidence',()=>{
  assert.throws(()=>verifyOfficeCmsCutover({...params(),proofJson:envelope(p=>{delete p.evidence.legacyRecordsRetainedReadOnly;})}),/legacyRecordsRetainedReadOnly/);
});
test('normal reconciliation mode requires real owner proof',()=>{
  assert.throws(()=>verifyOfficeCmsCutover({...params(),proofJson:envelope(p=>{p.historyMode='reconcile';})}),/originalPaymentOwnerScope/);
});
