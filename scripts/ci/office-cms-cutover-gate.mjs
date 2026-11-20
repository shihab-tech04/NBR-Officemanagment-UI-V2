/** Fail-closed Office CMS counterpart of Sohojkor's signed Taxpayer-v2 cutover.
 * Original CMS keeps working by default; never deploy a v2 Office publisher
 * without signed evidence bound to the exact reviewed Office source tree.
 * No privileged database/API secret belongs in a browser build.
 */
import { createPublicKey, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const OLD = 'https://eyqhoavnitkrajvyqvxn.supabase.co';
export const V2 = 'https://gmuhitmaynfhipcvbvkh.supabase.co';
const officeId = 'ihbtabrvmyiwikqqbhrf';
const sha40 = /^[a-f0-9]{40}$/;
const sha64 = /^[a-f0-9]{64}$/;
const required = [
  'originalSqlAuthRestore','targetSqlAuthRestore','officeSqlAuthRestore',
  'originalStorageRestore','targetStorageRestore','originalAccountIdentity',
  'paymentIdempotency','officeAuthorizedReadback','storageByteIntegrity',
  'rollbackRehearsal','protectedReleaseApproval','officeCmsV2Readback',
  'taxpayerLiveV2Readback',
];

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function verifiedEvidence(x, now) {
  const t = Date.parse(x?.verifiedAt);
  return x?.passed === true && sha64.test(x.sha256 || '') &&
    Number.isFinite(t) && t <= now && t >= now - 7 * 86400_000;
}
export function verifyOfficeCmsCutover({
  cmsUrl, publishableKey, proofJson, publicKey, officeTreeSha, now = Date.now(),
}) {
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey || ''))
    throw Error('Office CMS requires publishable-only credentials');
  if (cmsUrl === OLD) return 'original';
  if (cmsUrl !== V2) throw Error('Unknown Office CMS backend refused');
  if (!proofJson || !publicKey || !sha40.test(officeTreeSha || ''))
    throw Error('Office-v2 CMS cutover blocked: signed release proof absent');
  let envelope;
  try { envelope = JSON.parse(proofJson); }
  catch { throw Error('Office-v2 CMS cutover blocked: malformed proof'); }
  const p = envelope?.payload;
  const issued = Date.parse(p?.issuedAt), expires = Date.parse(p?.expiresAt);
  if (p?.schema !== 'sohojkor-hybrid-cutover-v1' ||
      p?.source !== OLD || p?.target !== V2 || p?.office !== officeId ||
      p?.officeTreeSha !== officeTreeSha || !sha40.test(p?.treeSha || '') ||
      !sha40.test(p?.taxpayerDeployedCommit || '') ||
      !Number.isFinite(issued) || !Number.isFinite(expires) ||
      issued > now || issued < now - 7 * 86400_000 ||
      expires <= now || expires > now + 7 * 86400_000)
    throw Error('Office-v2 CMS cutover blocked: incorrect source, target, tree, or approval period');
  for (const key of required) {
    if (!verifiedEvidence(p.evidence?.[key], now))
      throw Error('Office-v2 CMS cutover blocked: missing verified ' + key);
  }
  if (p.historyMode === 'no-settled-payments') {
    for (const key of ['legacyNonFinancialEvidence','legacyRecordsRetainedReadOnly']) {
      if (!verifiedEvidence(p.evidence?.[key], now))
        throw Error('Office-v2 CMS cutover blocked: missing verified ' + key);
    }
  } else if (p.historyMode === undefined || p.historyMode === 'reconcile') {
    if (!verifiedEvidence(p.evidence?.originalPaymentOwnerScope, now))
      throw Error('Office-v2 CMS cutover blocked: missing verified originalPaymentOwnerScope');
  } else throw Error('Office-v2 CMS cutover blocked: unknown payment-history mode');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.signature || ''))
    throw Error('Office-v2 CMS cutover blocked: invalid signature');
  let key;
  try { key = createPublicKey(publicKey); }
  catch { throw Error('Office-v2 CMS cutover blocked: invalid verifier'); }
  if (key.asymmetricKeyType !== 'ed25519' ||
      !verify(null, Buffer.from(canonical(p)), key, Buffer.from(envelope.signature,'base64')))
    throw Error('Office-v2 CMS cutover blocked: signature invalid');
  return 'v2-approved';
}
function getTree() {
  try { return execFileSync('git', ['rev-parse','HEAD^{tree}'], {encoding:'utf8'}).trim(); }
  catch { return ''; }
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  try {
    console.log('OFFICE_CMS_PRIMARY=' + verifyOfficeCmsCutover({
      cmsUrl: process.env.VITE_TAXPAY_CMS_SUPABASE_URL,
      publishableKey: process.env.VITE_TAXPAY_CMS_SUPABASE_PUBLISHABLE_KEY,
      proofJson: process.env.SOHOJKOR_CUTOVER_SIGNED_PROOF,
      publicKey: process.env.SOHOJKOR_CUTOVER_APPROVER_PUBLIC_KEY,
      officeTreeSha: getTree(),
    }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
