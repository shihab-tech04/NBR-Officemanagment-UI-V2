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
} = {}) {
  const seen = { authCalls: 0, ownerCalls: 0, reserveCalls: 0,
    privilegedReads: 0, ownerArgs: null, reserveArgs: null };
  let handler;
  const client = {
    auth: {
      async getUser(token) {
        seen.authCalls++;
        return token === 'valid.synthetic.token'
          ? { data: { user: { id: signedActor } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid or revoked mock token' } };
      },
    },
    async rpc(name, args) {
      if (name === 'nbr_authorize_citizen_evaluation') {
        seen.ownerCalls++;
        seen.ownerArgs = args;
        return { data: ownerData, error: ownerError };
      }
      if (name === 'nbr_reserve_citizen_evaluation') {
        seen.reserveCalls++;
        seen.reserveArgs = args;
        return { data: reservationData, error: reservationError };
      }
      throw Error('Unexpected privileged RPC: ' + name);
    },
    from(name) {
      seen.privilegedReads++;
      throw Error('Privileged read reached before owner/reservation gate: ' + name);
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
