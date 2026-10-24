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
    state: 'active', is_executable: true },
  actorId = signedActor, revokeAfterFirstAuth = false,
} = {}) {
  const seen = { authCalls: 0, ownerCalls: 0, reserveCalls: 0,
    privilegedReads: 0, yearReads: 0, ownerArgs: null, reserveArgs: null };
  let handler;
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
            return { async maybeSingle() { return { data: yearData, error: null }; } };
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
    const h = harness({ reservationError: stop });
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
