#!/usr/bin/env node
// Independent no-credential production security smoke. Never submit real tax facts.
const endpoint = process.env.NBR_ENGINE_PUBLIC_URL ??
  'https://gtorruuhvohafapctxym.supabase.co/functions/v1/nbr-tax-engine';
if (!endpoint.startsWith('https://') || !endpoint.endsWith('/nbr-tax-engine')) {
  throw new Error('Unexpected engine URL; refusing security probe');
}
const fakeYear = '__SECURITY_AUDIT_NONEXISTENT_YEAR__';
async function probe(path, method = 'GET', bearer = '') {
  const headers = { accept: 'application/json' };
  if (method === 'POST') headers['content-type'] = 'application/json';
  if (bearer) headers.authorization = 'Bearer ' + bearer;
  const response = await fetch(endpoint + path, {
    method, headers, redirect: 'error', signal: AbortSignal.timeout(15000),
    ...(method === 'POST' ? { body: JSON.stringify({ assessmentYear: fakeYear }) } : {})
  });
  let data = {};
  try { data = await response.json(); }
  catch { throw new Error(method + ' ' + path + ' response was not JSON (HTTP ' + response.status + ')'); }
  return { status: response.status, data };
}
function check(condition, label) {
  if (!condition) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
const health = await probe('/health');
check(health.status === 200 && typeof health.data.engineVersion === 'string',
  'GET health is still publicly readable');
const years = await probe('/years');
check(years.status === 200 && Array.isArray(years.data.years),
  'GET years remains a public read-only observation');
const active = years.data.years.find(y => y.assessmentYear === '2026-27');
const draft = years.data.years.find(y => y.assessmentYear === '2027-28');
check(active?.executable === true && draft?.executable === false,
  'SQL year observation preserves active and draft flags');
const status = await probe('/status');
check(status.status === 200 && status.data.ok === true &&
  status.data.ruleCount === 366 && status.data.runtimeBindingCount === 366,
  'GET status reflects all frozen rule and binding identities');
const anonymous = await probe('', 'POST');
check(anonymous.status === 401 && anonymous.data.status === 'FAIL_CLOSED' &&
  anonymous.data.submissionReady === false && anonymous.data.code === 'TAXPAYER_AUTH_REQUIRED',
  'Anonymous POST is refused before any tax calculation or logging');
const invalid = await probe('', 'POST', 'invalid-bearer-token-for-safety-probe');
check(invalid.status === 401 && invalid.data.status === 'FAIL_CLOSED' &&
  invalid.data.submissionReady === false && invalid.data.code === 'TAXPAYER_SESSION_INVALID',
  'Invalid-session POST is refused before any tax calculation or logging');
console.log('All public and anonymous fail-closed smoke checks passed; authenticated ownership remains NOT TESTED.');
