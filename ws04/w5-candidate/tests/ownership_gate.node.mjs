import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';

// Real, non-deployed W5 handler with in-memory RPC/Auth stubs.
// These tests do NOT verify a signed JWT, real revocation, tenant ownership,
// frozen 366-rule runtime, PostgreSQL permissions, or tax-law correctness.
const source = readFileSync(
  new URL('../supabase/functions/nbr-tax-engine/index.ts', import.meta.url),
  'utf8',
);
const executable = stripTypeScriptTypes(source.replace(
  /^import \{ createClient \} from .*;$/m,
  'const { createClient } = __testDeps;',
));
const signedActor = '60000000-0000-4000-8000-000000000001';
const ownedRecord = '50000000-0000-4000-8000-000000000001';

function harness({
  ownerData = true, ownerError = null,
  reservationData = { state: 'RESERVED' }, reservationError = null,
  yearData = { assessment_year: '2026-27', income_year: '2025-26',
    state: 'active', is_executable: true, legal_cutoff: '2026-09-30' },
  actorId = signedActor, revokeAfterFirstAuth = false,
} = {}) {
  const seen = { authCalls: 0, ownerCalls: 0, reserveCalls: 0,
    privilegedReads: 0, yearReads: 0, ownerArgs: null, reserveArgs: null };
  let handler;
  const scopedYearData = yearData === null ? null : {
    id: '70000000-0000-4000-8000-000000000001', is_immutable: true,
    source_registry_version: 'FINAL_2026_09_30', ...yearData,
  };
  const client = {
    auth: {
      async getUser(token) {
        seen.authCalls++;
        return token === 'valid.synthetic.token' &&
          !(revokeAfterFirstAuth && seen.authCalls > 1)
          ? { data: { user: { id: actorId } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid or revoked mock token' } };
      },
    },
    async rpc(name, args) {
      if (name === 'nbr_authorize_citizen_evaluation') {
        seen.ownerCalls++;
        seen.ownerArgs = args;
        return { data: typeof ownerData === 'function' ? ownerData() : ownerData, error: ownerError };
      }
      if (name === 'nbr_reserve_citizen_evaluation') {
        seen.reserveCalls++;
        seen.reserveArgs = args;
        return { data: reservationData, error: reservationError };
      }
      throw Error('Unexpected privileged RPC: ' + name);
    },
    from(name) {
      // A scoped, owner-authorized year metadata lookup is not a tax-rule read.
      // It must precede idempotency reservation to reject mismatched years.
      if (name === 'nbr_tax_years') {
        seen.yearReads++;
        return { select() {
          return { eq() {
            return { async maybeSingle() { return { data: scopedYearData, error: null }; } };
          } };
        } };
      }
      seen.privilegedReads++;
      throw Error('Privileged rule read reached before reservation gate: ' + name);
    },
  };
  const runtime = {
    __testDeps: { createClient: () => client },
    Deno: {
      serve(fn) { handler = fn; },
      env: { get(key) {
        if (key === 'NBR_TAX_EXECUTION_ENABLED') return 'true';
        if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'synthetic-service-role';
        if (key === 'NBR_TAX_ALLOWED_ORIGINS') return 'https://allowed.synthetic.invalid';
        return 'https://synthetic.invalid';
      } },
    },
    Request, Response, URL, crypto: webcrypto, TextEncoder, console,
  };
  runInNewContext(executable, runtime, {
    filename: 'isolated-ws04-ownership-gate.js', timeout: 5000,
  });
  assert.equal(typeof handler, 'function');
  return {
    seen,
    async request({ token = 'valid.synthetic.token', bodyOverrides = {} } = {}) {
      const body = {
        assessmentYear: '2026-27', incomeYear: '2025-26',
        contractVersion: 'NBR_ENGINE_CITIZEN_V2_REVIEW',
        legalEventDate: '2026-06-30',
        expectedSourceCutoff: '2026-09-30',
        expectedRuleSetHash: 'a'.repeat(64),
        expectedParameterRevision: 1,
        idempotencyKey: 'synthetic-owner-bound-00001',
        taxpayerRecordId: ownedRecord,
        taxpayer: {
          entityType: 'individual', residency: 'resident',
          industryCode: 'not_applicable', specialCategory: 'none',
        },
        returnData: { incomeHeads: { employment: '0' } },
        ...bodyOverrides,
      };
      const headers = token === null ? {} : { authorization: 'Bearer ' + token };
      const response = await handler(new Request(
        'https://synthetic.invalid/functions/v1/nbr-tax-engine',
        { method: 'POST', headers, body: JSON.stringify(body) },
      ));
      return { status: response.status, body: await response.json() };
    },
  };
}

test('anonymous request is denied before mock Auth and privileged reads', async () => {
  const h = harness();
  const r = await h.request({ token: null });
  assert.equal(r.status, 401);
  assert.equal(h.seen.authCalls, 0);
  assert.equal(h.seen.ownerCalls, 0);
  assert.equal(h.seen.reserveCalls, 0);
  assert.equal(h.seen.privilegedReads, 0);
});

test('mock invalid or revoked token cannot reach owner RPC', async () => {
  const h = harness();
  const r = await h.request({ token: 'revoked.synthetic.token' });
  assert.equal(r.status, 401);
  assert.equal(h.seen.authCalls, 1);
  assert.equal(h.seen.ownerCalls, 0);
  assert.equal(h.seen.reserveCalls, 0);
  assert.equal(h.seen.privilegedReads, 0);
});

test('mock token revoked between requests is rechecked before owner or reservation RPC', async () => {
  const h = harness({
    revokeAfterFirstAuth: true,
    reservationError: { message: 'synthetic stop after first authorization' },
  });
  const first = await h.request();
  assert.equal(first.status, 503);
  assert.equal(first.body.code, 'REPLAY_GATE_UNAVAILABLE');
  assert.equal(h.seen.authCalls, 1);
  assert.equal(h.seen.ownerCalls, 1);
  assert.equal(h.seen.reserveCalls, 1);
  assert.equal(h.seen.privilegedReads, 0);

  const revoked = await h.request();
  assert.equal(revoked.status, 401);
  assert.equal(h.seen.authCalls, 2, 'each request must revalidate its bearer');
  assert.equal(h.seen.ownerCalls, 1, 'revoked bearer must not reuse previous owner grant');
  assert.equal(h.seen.reserveCalls, 1, 'revoked bearer must not reserve again');
  assert.equal(h.seen.privilegedReads, 0);
});

test('ownership revoked between requests cannot reuse a previously authorized principal', async () => {
  let ownerActive = true;
  const h = harness({
    ownerData: () => ownerActive,
    reservationError: { message: 'synthetic stop before any privileged reads' },
  });
  const initial = await h.request();
  assert.equal(initial.status, 503);
  assert.equal(initial.body.code, 'REPLAY_GATE_UNAVAILABLE');
  assert.equal(h.seen.authCalls, 1);
  assert.equal(h.seen.ownerCalls, 1);
  assert.equal(h.seen.reserveCalls, 1);
  assert.equal(h.seen.privilegedReads, 0);

  ownerActive = false; // Simulates source-of-truth owner revocation, not JWT revocation.
  const denied = await h.request();
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'TAXPAYER_ACCESS_DENIED');
  assert.equal(h.seen.authCalls, 2, 'bearer must be rechecked on each request');
  assert.equal(h.seen.ownerCalls, 2, 'owner RPC must be consulted again');
  assert.equal(h.seen.reserveCalls, 1, 'revoked owner must not reserve a second time');
  assert.equal(h.seen.privilegedReads, 0);
});

test('malformed mock Auth principal never becomes an owner or reservation actor', async () => {
  // This verifies handler input integrity, NOT a real signed JWT.
  for (const actorId of ['not-a-uuid', 42, '00000000-0000-0000-0000-000000000000']) {
    const h = harness({ actorId });
    const result = await h.request();
    assert.equal(result.status, 401, String(actorId));
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 0);
    assert.equal(h.seen.reserveCalls, 0);
    assert.equal(h.seen.privilegedReads, 0);
  }
});

test('service-role credential is not accepted as a taxpayer bearer', async () => {
  const h = harness();
  const r = await h.request({ token: 'synthetic-service-role' });
  assert.equal(r.status, 401);
  assert.equal(h.seen.authCalls, 0);
  assert.equal(h.seen.ownerCalls, 0);
});

test('denied taxpayer ownership cannot reserve or read privileged rules', async () => {
  const h = harness({ ownerData: false });
  const r = await h.request({ bodyOverrides: { taxpayerRecordId: ownedRecord } });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'TAXPAYER_ACCESS_DENIED');
  assert.equal(h.seen.ownerCalls, 1);
  assert.equal(h.seen.reserveCalls, 0);
  assert.equal(h.seen.privilegedReads, 0);
});

test('missing, malformed and errored owner RPC all fail closed', async () => {
  for (const options of [
    { ownerData: null },
    { ownerData: 'true' },
    { ownerData: true, ownerError: { message: 'RPC unavailable' } },
  ]) {
    const h = harness(options);
    const r = await h.request();
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'OWNERSHIP_GATE_UNAVAILABLE');
    assert.equal(h.seen.reserveCalls, 0);
    assert.equal(h.seen.privilegedReads, 0);
  }
});

test('client-supplied principal cannot override mock authenticated actor', async () => {
  const h = harness({ reservationError: { message: 'intentional synthetic stop' } });
  const r = await h.request({ bodyOverrides: {
    actorUserId: '60000000-0000-4000-8000-000000000002',
    authUserId: '60000000-0000-4000-8000-000000000002',
    p_auth_user_id: '60000000-0000-4000-8000-000000000002',
  } });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'REPLAY_GATE_UNAVAILABLE');
  assert.equal(h.seen.ownerArgs.p_auth_user_id, signedActor);
  assert.equal(h.seen.reserveArgs.p_auth_user_id, signedActor);
  assert.equal(h.seen.ownerArgs.p_taxpayer_record_id, ownedRecord);
  assert.equal(h.seen.reserveArgs.p_taxpayer_record_id, ownedRecord);
  assert.equal(h.seen.reserveArgs.p_assessment_year, '2026-27');
  assert.equal(h.seen.privilegedReads, 0);
});

test('missing reservation RPC fails closed before privileged reads', async () => {
  const h = harness({ reservationError: { message: 'function not found' } });
  const r = await h.request();
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'REPLAY_GATE_UNAVAILABLE');
  assert.equal(h.seen.reserveCalls, 1);
  assert.equal(h.seen.privilegedReads, 0);
});

test('conflicting or replayed idempotency slot fails closed', async () => {
  for (const state of ['CONFLICT', 'REPLAY_NOT_ACCEPTED', 'OWNER_DENIED']) {
    const h = harness({ reservationData: { state } });
    const r = await h.request();
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'REPLAY_NOT_ACCEPTED');
    assert.equal(h.seen.reserveCalls, 1);
    assert.equal(h.seen.privilegedReads, 0);
  }
});

test('invalid income-year label is rejected before ownership or reservation RPC', async () => {
  for (const incomeYear of ['2025-99', '2025/26', null]) {
    const h = harness();
    const r = await h.request({ bodyOverrides: { incomeYear } });
    assert.equal(r.status, 422);
    assert.equal(r.body.code, 'INCOME_YEAR_REQUIRED');
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 0);
    assert.equal(h.seen.reserveCalls, 0);
    assert.equal(h.seen.privilegedReads, 0);
  }
});

test('cross-year request is denied against synthetic authoritative year before rule reads', async () => {
  const h = harness({ yearData: {
    assessment_year: '2026-27', income_year: '2025-26',
    state: 'active', is_executable: true,
  } });
  const r = await h.request({ bodyOverrides: { incomeYear: '2024-25' } });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'YEAR_MISMATCH');
  assert.equal(h.seen.ownerCalls, 1);
  assert.equal(h.seen.reserveCalls, 0,
    'a known SQL income-year mismatch must not consume an idempotency reservation');
  assert.equal(h.seen.yearReads, 1, 'authoritative year is checked once');
  assert.equal(h.seen.privilegedReads, 0, 'no privileged rule reads');
});

test('mismatched SQL assessment-year metadata cannot reserve or access privileged rules', async () => {
  // The query must not trust an inconsistent row merely because it arrived
  // through a year-filtered PostgREST response. Synthetic SQL data only.
  const h = harness({ yearData: {
    assessment_year: '2027-28', income_year: '2025-26',
    state: 'active', is_executable: true,
  } });
  const r = await h.request();
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'YEAR_MISMATCH');
  assert.equal(h.seen.ownerCalls, 1);
  assert.equal(h.seen.yearReads, 1);
  assert.equal(h.seen.reserveCalls, 0,
    'a mismatched authoritative assessment year must not consume a replay key');
  assert.equal(h.seen.privilegedReads, 0);
});

test('draft, disabled and absent owner-scoped SQL years cannot consume reservation slots', async () => {
  for (const yearData of [
    { assessment_year: '2026-27', income_year: '2025-26',
      state: 'draft', is_executable: false },
    { assessment_year: '2026-27', income_year: '2025-26',
      state: 'active', is_executable: false },
    null,
  ]) {
    const h = harness({ yearData });
    const r = await h.request();
    assert.equal(r.status, yearData === null ? 404 : 409);
    if (yearData !== null) assert.equal(r.body.code, 'UNAPPROVED_YEAR');
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.yearReads, 1);
    assert.equal(h.seen.reserveCalls, 0,
      'unapproved or missing authoritative year must not consume a replay key');
    assert.equal(h.seen.privilegedReads, 0);
  }
});

test('malformed reservation responses never authorize rule reads', async () => {
  for (const reservationData of [null, [], 'RESERVED', { state: true }]) {
    const h = harness({ reservationData });
    const r = await h.request();
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'REPLAY_GATE_UNAVAILABLE');
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.reserveCalls, 1);
    assert.equal(h.seen.privilegedReads, 0);
  }
});

test('actor-bound canonical request hash is stable only for the same signed principal and facts', async () => {
  const stop = { message: 'synthetic stop before privileged rule reads' };
  async function reservation(args = {}) {
    const h = harness({ reservationError: stop, ...args });
    const r = await h.request();
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'REPLAY_GATE_UNAVAILABLE');
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.reserveCalls, 1);
    assert.equal(h.seen.privilegedReads, 0);
    assert.match(h.seen.reserveArgs.p_request_hash, /^[a-f0-9]{64}$/);
    assert.equal(h.seen.reserveArgs.p_auth_user_id, h.seen.ownerArgs.p_auth_user_id);
    assert.equal(h.seen.reserveArgs.p_idempotency_key, 'synthetic-owner-bound-00001');
    return h.seen.reserveArgs;
  }
  const first = await reservation();
  const repeat = await reservation();
  assert.equal(repeat.p_request_hash, first.p_request_hash,
    'identical signed actor and request must produce deterministic hash');
  const otherActor = await reservation({ actorId: '60000000-0000-4000-8000-000000000002' });
  assert.notEqual(otherActor.p_request_hash, first.p_request_hash,
    'same idempotency key must not make a different signed actor the same request');
  assert.equal(otherActor.p_auth_user_id, '60000000-0000-4000-8000-000000000002');

  const h = harness({ reservationError: stop });
  const changed = await h.request({ bodyOverrides: {
    returnData: { incomeHeads: { employment: '1' } },
  } });
  assert.equal(changed.status, 503);
  assert.equal(changed.body.code, 'REPLAY_GATE_UNAVAILABLE');
  assert.notEqual(h.seen.reserveArgs.p_request_hash, first.p_request_hash,
    'changed taxpayer facts must not share an authorized request hash');
  assert.equal(h.seen.privilegedReads, 0);
});

test('authorization hash binds year, legal pins, record and replay key before rule access', async () => {
  const stop = { message: 'synthetic stop after reservation' };
  async function getHash(bodyOverrides = {}) {
    // Hash-binding test only: mirror mutated year pins in synthetic SQL metadata
    // so this test reaches reservation. This is NOT a statutory year approval.
    const yearData = {
      assessment_year: bodyOverrides.assessmentYear ?? '2026-27',
      income_year: bodyOverrides.incomeYear ?? '2025-26',
      state: 'active', is_executable: true,
      legal_cutoff: bodyOverrides.expectedSourceCutoff ?? '2026-09-30',
    };
    const h = harness({ reservationError: stop, yearData });
    const result = await h.request({ bodyOverrides });
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'REPLAY_GATE_UNAVAILABLE');
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.reserveCalls, 1);
    assert.equal(h.seen.privilegedReads, 0);
    assert.equal(h.seen.reserveArgs.p_auth_user_id, signedActor);
    assert.equal(h.seen.reserveArgs.p_taxpayer_record_id,
      bodyOverrides.taxpayerRecordId ?? ownedRecord);
    assert.match(h.seen.reserveArgs.p_request_hash, /^[a-f0-9]{64}$/);
    return h.seen.reserveArgs.p_request_hash;
  }

  const baseline = await getHash();
  assert.equal(await getHash(), baseline, 'identical authorized inputs are deterministic');
  const changes = [
    { assessmentYear: '2027-28' },
    { incomeYear: '2026-27' },
    { taxpayerRecordId: '50000000-0000-4000-8000-000000000002' },
    { legalEventDate: '2026-06-29' },
    { expectedSourceCutoff: '2026-09-29' },
    { expectedRuleSetHash: 'b'.repeat(64) },
    { expectedParameterRevision: 2 },
    { idempotencyKey: 'synthetic-owner-bound-00002' },
  ];
  for (const changed of changes) {
    assert.notEqual(await getHash(changed), baseline,
      'changed authorization pin must not reuse original request hash: ' +
      Object.keys(changed)[0]);
  }
});

test('invalid source-cutoff calendar dates are denied before ownership and reservation', async () => {
  // A YYYY-MM-DD shape alone is insufficient evidence of a real legal cutoff.
  for (const expectedSourceCutoff of [
    '2026-02-30', '2026-06-31', '2026-13-01', '2026-00-01',
  ]) {
    const h = harness({
      reservationError: { message: 'synthetic stop if cutoff bypasses validation' },
    });
    const result = await h.request({ bodyOverrides: { expectedSourceCutoff } });
    assert.equal(result.status, 422, expectedSourceCutoff);
    assert.equal(result.body.code, 'VERSIONED_CONTRACT_REQUIRED');
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 0, 'invalid legal cutoff must not reach owner RPC');
    assert.equal(h.seen.reserveCalls, 0, 'invalid legal cutoff must not reserve');
    assert.equal(h.seen.privilegedReads, 0);
  }
});

// A negative revision cannot identify an approved SQL parameter version.
// Reject it before creating an owner-bound reservation or reading tax rules.
test('zero or negative parameter revision is rejected before owner and reservation RPCs', async () => {
  for (const expectedParameterRevision of [0, -1, -2147483648]) {
    const h = harness({ reservationError: { message: 'unexpected reservation' } });
    const result = await h.request({ bodyOverrides: { expectedParameterRevision } });
    assert.equal(result.status, 422, String(expectedParameterRevision));
    assert.equal(result.body.code, 'VERSIONED_CONTRACT_REQUIRED');
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 0);
    assert.equal(h.seen.reserveCalls, 0);
    assert.equal(h.seen.privilegedReads, 0);
  }
});

test('transaction period and event-date denials do not consume owner-bound idempotency slots', async () => {
  // These are isolated synthetic facts; no statutory event approval is inferred.
  const rejected = [
    { legalEventDate: '2026-07-10', transactionRuleIds: ['WH-R4-04'],
      expectedCode: 'TRANSACTION_PERIOD_REVIEW_REQUIRED' },
    { legalEventDate: '2026-06-30',
      transactions: { 'WH-R4-04': { eventDate: '2026-07-10', grossBill: '1000' } },
      expectedCode: 'TRANSACTION_EVENT_DATE_CONFLICT' },
    { legalEventDate: '2026-06-30',
      ruleFacts: { 'WH-R4-04': { baseAmount: '1000', eventDate: '2026-07-10' } },
      expectedCode: 'RULE_EVENT_DATE_CONFLICT' },
  ];
  for (const { expectedCode, ...bodyOverrides } of rejected) {
    const h = harness({ reservationError: { message: 'reservation must not be reached' } });
    const r = await h.request({ bodyOverrides });
    assert.equal(r.status, 409, expectedCode);
    assert.equal(r.body.code, expectedCode);
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.yearReads, 1);
    assert.equal(h.seen.reserveCalls, 0,
      'known invalid event must not consume an idempotency slot: ' + expectedCode);
    assert.equal(h.seen.privilegedReads, 0);
  }
});

// A valid caller cutoff is not necessarily the owner-authorized SQL cutoff.
// Both mismatches must fail before consuming an idempotency reservation.
test('SQL legal cutoff mismatch and post-cutoff event cannot reserve or read rules', async () => {
  const cases = [
    {
      yearData: { assessment_year: '2026-27', income_year: '2025-26',
        state: 'active', is_executable: true, legal_cutoff: '2026-08-31' },
      bodyOverrides: {},
    },
    {
      yearData: { assessment_year: '2026-27', income_year: '2025-26',
        state: 'active', is_executable: true, legal_cutoff: '2026-05-31' },
      bodyOverrides: { expectedSourceCutoff: '2026-05-31', legalEventDate: '2026-06-15' },
    },
  ];
  for (const { yearData, bodyOverrides } of cases) {
    const h = harness({ yearData, reservationError: { message: 'reservation must not be reached' } });
    const r = await h.request({ bodyOverrides });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'LEGAL_EVENT_CUTOFF_UNVERIFIED');
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.yearReads, 1);
    assert.equal(h.seen.reserveCalls, 0, 'invalid legal cutoff cannot reserve');
    assert.equal(h.seen.privilegedReads, 0, 'invalid legal cutoff cannot read tax rules');
  }
});

test('unbacked event rule selectors are denied before idempotency reservation', async () => {
  // Selecting a time-sensitive rule ID is not evidence of a dated transaction.
  // These synthetic tests never authorize a real payment or withholding credit.
  const cases = [
    { transactionRuleIds: ['WH-R4-04'] },
    { paymentRuleIds: ['WH-R4-04'] },
    { transactionRuleIds: ['WH-R4-04'],
      transactions: { 'WH-R4-05': { eventDate: '2026-06-30' } } },
    { paymentRuleIds: ['WH-R4-04'],
      paymentEvents: { 'WH-R4-05': { eventDate: '2026-06-30' } } },
  ];
  for (const bodyOverrides of cases) {
    const h = harness({ reservationError: { message: 'unbacked selector must not reserve' } });
    const result = await h.request({ bodyOverrides });
    assert.equal(result.status, 422, JSON.stringify(bodyOverrides));
    assert.equal(result.body.code, 'EVENT_RULE_FACTS_UNVERIFIED');
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.yearReads, 1);
    assert.equal(h.seen.reserveCalls, 0, 'unbacked selector must not consume replay key');
    assert.equal(h.seen.privilegedReads, 0);
  }
});

// A selected rule must not be accompanied by unrelated dated event facts.
// Extra keys could otherwise influence downstream rule evaluation after a
// replay slot has been consumed. This is an isolated fail-closed shape check.
test('unselected transaction or payment event facts fail closed before reservation', async () => {
  for (const bodyOverrides of [
    { transactionRuleIds: ['WH-R4-04'],
      transactions: { 'WH-R4-04': { eventDate: '2026-06-30', grossBill: '1000' },
        'WH-R4-05': { eventDate: '2026-06-30', grossBill: '1000' } } },
    { paymentRuleIds: ['WH-R4-04'],
      paymentEvents: { 'WH-R4-04': { eventDate: '2026-06-30', amount: '100' },
        'WH-R4-05': { eventDate: '2026-06-30', amount: '100' } } },
  ]) {
    const h = harness({ reservationError: { message: 'unselected event must not reserve' } });
    const result = await h.request({ bodyOverrides });
    assert.equal(result.status, 422, JSON.stringify(bodyOverrides));
    assert.equal(result.body.code, 'EVENT_RULE_FACTS_UNVERIFIED');
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.yearReads, 1);
    assert.equal(h.seen.reserveCalls, 0);
    assert.equal(h.seen.privilegedReads, 0);
  }
});

test('payment-event period and date violations are denied before idempotency reservation', async () => {
  // Payment-event claims are also time-bound. They must not bypass the
  // transaction-only pre-reservation guard by using paymentRuleIds/paymentEvents.
  // Synthetic year and owner stubs only; no payment credit is authorized.
  const cases = [
    { bodyOverrides: { legalEventDate: '2026-07-10',
      paymentRuleIds: ['WH-R4-04'] }, status: 409,
      code: 'TRANSACTION_PERIOD_REVIEW_REQUIRED' },
    { bodyOverrides: { legalEventDate: '2026-07-10',
      paymentEvents: { 'WH-R4-04': { eventDate: '2026-07-10', amount: '100' } } },
      status: 409, code: 'TRANSACTION_PERIOD_REVIEW_REQUIRED' },
    { bodyOverrides: { paymentEvents: { 'WH-R4-04': { amount: '100' } } },
      status: 422, code: 'PAYMENT_EVENT_DATE_REQUIRED' },
    { bodyOverrides: { paymentEvents: { 'WH-R4-04': {
      eventDate: '2026-07-10', amount: '100' } } },
      status: 409, code: 'PAYMENT_EVENT_DATE_CONFLICT' },
  ];
  for (const { bodyOverrides, status, code } of cases) {
    const h = harness({ reservationError: { message: 'payment event must not reserve' } });
    const result = await h.request({ bodyOverrides });
    assert.equal(result.status, status, code);
    assert.equal(result.body.code, code);
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.yearReads, 1);
    assert.equal(h.seen.reserveCalls, 0, 'payment event must not consume a replay key');
    assert.equal(h.seen.privilegedReads, 0);
  }
});

test('dated transaction and payment event maps without explicit selectors cannot reserve', async () => {
  // A valid dated event is not authority to select its tax rule implicitly.
  // The source runtime currently treats a map entry as an applicability trigger.
  // Deny unselected map entries before any idempotency reservation.
  for (const bodyOverrides of [
    { transactions: { 'WH-R4-04': { eventDate: '2026-06-30', grossBill: '1000' } } },
    { transactionRuleIds: [], transactions: { 'WH-R4-04': { eventDate: '2026-06-30', grossBill: '1000' } } },
    { paymentEvents: { 'WH-R4-04': { eventDate: '2026-06-30', amount: '100' } } },
    { paymentRuleIds: [], paymentEvents: { 'WH-R4-04': { eventDate: '2026-06-30', amount: '100' } } },
  ]) {
    const h = harness({ reservationError: { message: 'unselected event must not reserve' } });
    const result = await h.request({ bodyOverrides });
    assert.equal(result.status, 422, JSON.stringify(bodyOverrides));
    assert.equal(result.body.code, 'EVENT_RULE_FACTS_UNVERIFIED');
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.yearReads, 1);
    assert.equal(h.seen.reserveCalls, 0);
    assert.equal(h.seen.privilegedReads, 0);
  }
});

test('duplicate event rule selectors are denied before consuming a reservation', async () => {
  // Duplicate IDs are not separate dated events; they could otherwise
  // influence downstream aggregation or create ambiguous rule binding.
  for (const bodyOverrides of [
    { transactionRuleIds: ['WH-R4-04', 'WH-R4-04'],
      transactions: { 'WH-R4-04': { eventDate: '2026-06-30', grossBill: '1000' } } },
    { paymentRuleIds: ['WH-R4-04', 'WH-R4-04'],
      paymentEvents: { 'WH-R4-04': { eventDate: '2026-06-30', amount: '100' } } },
  ]) {
    const h = harness({ reservationError: { message: 'duplicate selector must not reserve' } });
    const result = await h.request({ bodyOverrides });
    assert.equal(result.status, 422, JSON.stringify(bodyOverrides));
    assert.ok(result.body.invalidFacts?.includes(
      bodyOverrides.transactionRuleIds ? 'transactionRuleIds' : 'paymentRuleIds'));
    // Existing generic input validation already rejects duplicates before owner lookup.
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 0);
    assert.equal(h.seen.yearReads, 0);
    assert.equal(h.seen.reserveCalls, 0);
    assert.equal(h.seen.privilegedReads, 0);
  }
});


test('missing or malformed owner-authorized SQL year identity cannot reserve', async () => {
  // The year lookup must supply an actual row UUID, not only a matching label.
  // This is synthetic shape validation, not approval of a tax year.
  for (const id of [null, '', 'not-a-uuid', 42]) {
    const h = harness({
      yearData: { id, assessment_year: '2026-27', income_year: '2025-26',
        state: 'active', is_executable: true, legal_cutoff: '2026-09-30' },
      reservationError: { message: 'invalid SQL year must not reserve' },
    });
    const result = await h.request();
    assert.equal(result.status, 503, String(id));
    assert.equal(result.body.code, 'YEAR_METADATA_UNVERIFIED', String(id));
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.yearReads, 1);
    assert.equal(h.seen.reserveCalls, 0);
    assert.equal(h.seen.privilegedReads, 0);
  }
});

// A year marked executable is not enough if its source-backed rule snapshot
// can still change. This is an isolated metadata guard, not legal certification.
test('mutable or unverified SQL tax year cannot consume an owner-bound reservation', async () => {
  for (const immutability of [false, null, undefined, 'true']) {
    const h = harness({
      yearData: { assessment_year: '2026-27', income_year: '2025-26',
        state: 'active', is_executable: true, is_immutable: immutability,
        legal_cutoff: '2026-09-30' },
      reservationError: { message: 'mutable year must not reserve' },
    });
    const r = await h.request();
    assert.equal(r.status, 409, String(immutability));
    assert.equal(r.body.code, 'YEAR_NOT_IMMUTABLE', String(immutability));
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.yearReads, 1);
    assert.equal(h.seen.reserveCalls, 0);
    assert.equal(h.seen.privilegedReads, 0);
  }
});

// This is an isolated malformed-SQL-response guard, NOT a verified live schema.
test('SQL year executable flag must be boolean true before idempotency reservation', async () => {
  for (const isExecutable of ['true', 'false', 1, null, undefined]) {
    const h = harness({
      yearData: { assessment_year: '2026-27', income_year: '2025-26',
        state: 'active', is_executable: isExecutable, is_immutable: true,
        legal_cutoff: '2026-09-30' },
      reservationError: { message: 'malformed SQL execution flag must not reserve' },
    });
    const r = await h.request();
    assert.equal(r.status, 409, String(isExecutable));
    assert.equal(r.body.code, 'UNAPPROVED_YEAR', String(isExecutable));
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.yearReads, 1);
    assert.equal(h.seen.reserveCalls, 0);
    assert.equal(h.seen.privilegedReads, 0);
  }
});

// Isolated SQL metadata mock: version identity is a necessary but not
// sufficient legal-source gate; it cannot certify the underlying 366 bytes.
test('unverified SQL registry version cannot consume a replay reservation', async () => {
  for (const source_registry_version of [undefined, null, 1, 'FINAL_2026_09_29', '']) {
    const h = harness({
      yearData: { assessment_year: '2026-27', income_year: '2025-26',
        state: 'active', is_executable: true, is_immutable: true,
        legal_cutoff: '2026-09-30', source_registry_version },
      reservationError: { message: 'replay must not be reached' },
    });
    const r = await h.request();
    assert.equal(r.status, 409, String(source_registry_version));
    assert.equal(r.body.code, 'REGISTRY_VERSION_UNVERIFIED');
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.yearReads, 1);
    assert.equal(h.seen.reserveCalls, 0);
    assert.equal(h.seen.privilegedReads, 0);
  }
});

 
// Regression: dated ruleFacts can otherwise trigger a runtime rule without
// any explicit reviewed selector. Synthetic Edge/SQL stubs only; no legal PASS.
test('dated ruleFacts cannot implicitly select an unbound event rule before replay reservation', async () => {
  const datedRuleFacts = { 'WH-R4-04': { eventDate: '2026-06-30', baseAmount: '1000' } };
  for (const bodyOverrides of [
    { ruleFacts: datedRuleFacts },
    { ruleFacts: datedRuleFacts, transactionRuleIds: [], paymentRuleIds: [] },
    { ruleFacts: datedRuleFacts, claimRuleIds: ['OTHER-RULE'] },
  ]) {
    const h = harness({ reservationError: { message: 'unbound dated rule fact must not reserve' } });
    const r = await h.request({ bodyOverrides });
    assert.equal(r.status, 422, JSON.stringify(bodyOverrides));
    assert.equal(r.body.code, 'EVENT_RULE_FACTS_UNVERIFIED');
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.yearReads, 1);
    assert.equal(h.seen.reserveCalls, 0);
    assert.equal(h.seen.privilegedReads, 0);
  }
});

// Regression: undated financial ruleFacts must not silently select a runtime
// rule through its baseAmount/quantity alone. Synthetic only; no legal PASS.
test('undated unselected monetary rule facts are rejected before reservation', async () => {
  for (const bodyOverrides of [
    { ruleFacts: { 'WH-R4-04': { baseAmount: '1000' } } },
    { ruleFacts: { 'WH-R4-04': { quantity: '2' } }, claimRuleIds: [] },
    { ruleFacts: { 'WH-R4-04': { baseAmount: '1000' } }, claimRuleIds: ['OTHER-RULE'] },
  ]) {
    const h = harness({ reservationError: { message: 'unselected financial facts must not reserve' } });
    const r = await h.request({ bodyOverrides });
    assert.equal(r.status, 422, JSON.stringify(bodyOverrides));
    assert.equal(r.body.code, 'EVENT_RULE_FACTS_UNVERIFIED');
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.yearReads, 1);
    assert.equal(h.seen.reserveCalls, 0);
    assert.equal(h.seen.privilegedReads, 0);
  }
});


// SQL base-tax NEEDS_FACTS is a non-payable state, not an exception.
// Synthetic helper-only coverage: no real calculation, SQL, JWT or legal approval.
test('SQL NEEDS_FACTS propagates without leaking unverified monetary fields', () => {
  const start = source.indexOf('function computeIndividualFromSqlBase(');
  const end = source.indexOf('\nDeno.serve(', start);
  assert.ok(start >= 0 && end > start, 'isolated SQL base helper source present');
  const compute = runInNewContext(
    stripTypeScriptTypes(source.slice(start, end)) + '\ncomputeIndividualFromSqlBase;',
    { sumObjectValues: () => 0n },
  );
  for (const sqlBase of [
    { status: 'NEEDS_FACTS', missingFacts: ['UNVERIFIED_THRESHOLD'] },
    { status: 'NEEDS_FACTS', missingFacts: ['UNVERIFIED_THRESHOLD'],
      grossTax: '1234.56', taxFreeThreshold: '100.00' },
  ]) {
    const result = compute(sqlBase, null, { returnData: { incomeHeads: {} } });
    assert.equal(result.status, 'NEEDS_FACTS');
    assert.deepEqual(Array.from(result.missingFacts), ['UNVERIFIED_THRESHOLD']);
    assert.equal(result.values, undefined);
    assert.ok(!JSON.stringify(result.trace).includes('1234.56'),
      'unverified SQL amount must not appear in trace');
  }
});

// A malformed or FAIL_CLOSED SQL base-tax response is not verified monetary
// evidence. It must not be copied into an audit/receipt trace, even if an
// unavailable SQL RPC returned provisional numbers alongside its error.
test('SQL non-CALCULATED base responses redact unverified monetary trace', () => {
  const start = source.indexOf('function computeIndividualFromSqlBase(');
  const end = source.indexOf('\nDeno.serve(', start);
  assert.ok(start >= 0 && end > start);
  const compute = runInNewContext(
    stripTypeScriptTypes(source.slice(start, end)) + '\ncomputeIndividualFromSqlBase;',
    { sumObjectValues: () => 0n },
  );
  for (const sqlBase of [
    { status: 'FAIL_CLOSED', missingFacts: ['UNVERIFIED_RATE'],
      grossTax: '999999.99', taxFreeThreshold: '1234.56' },
    { status: 'UNKNOWN_SQL_STATE', grossTax: '999999.99',
      taxFreeThreshold: '1234.56' },
    { status: 'CALCULATED', grossTax: '999999.99',
      taxFreeThreshold: null },
  ]) {
    const result = compute(sqlBase, null, { returnData: { incomeHeads: {} } });
    assert.equal(result.status, 'FAIL_CLOSED');
    assert.equal(result.values, undefined);
    assert.ok(!JSON.stringify(result.trace).includes('999999.99'),
      'unverified SQL grossTax must never appear in a failed receipt trace');
    assert.ok(!JSON.stringify(result.trace).includes('1234.56'),
      'unverified SQL threshold must never appear in a failed receipt trace');
  }
});

// Regression: nonmonetary ruleFacts can also activate runtime applicability.
// A synthetic caller cannot implicitly choose a statutory rule by supplying
// a free-form fact field; the selector must be explicit and match the rule ID.
// This is isolated handler authorization only, not legal source certification.
test('unselected nonmonetary structured rule facts cannot reserve an evaluation', async () => {
  for (const bodyOverrides of [
    { ruleFacts: { 'WH-R4-04': { taxpayerClass: 'individual' } } },
    { ruleFacts: { 'WH-R4-04': { supportingDocument: 'synthetic-proof' } }, claimRuleIds: [] },
    { ruleFacts: { 'WH-R4-04': { statutoryPredicate: true } }, claimRuleIds: ['OTHER-RULE'] },
  ]) {
    const h = harness({ reservationError: { message: 'unselected structured fact must not reserve' } });
    const result = await h.request({ bodyOverrides });
    assert.equal(result.status, 422, JSON.stringify(bodyOverrides));
    assert.equal(result.body.code, 'EVENT_RULE_FACTS_UNVERIFIED');
    assert.equal(h.seen.authCalls, 1);
    assert.equal(h.seen.ownerCalls, 1);
    assert.equal(h.seen.yearReads, 1);
    assert.equal(h.seen.reserveCalls, 0);
    assert.equal(h.seen.privilegedReads, 0);
  }
});
