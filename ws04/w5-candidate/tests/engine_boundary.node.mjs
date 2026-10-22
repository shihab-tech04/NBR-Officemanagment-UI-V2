import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import { execFileSync } from 'node:child_process';

// Execute the recovered Edge Function's actual handler with an in-memory
// Supabase stub. No network, production database, or tax submission is used.
const enginePath = new URL('../supabase/functions/nbr-tax-engine/index.ts', import.meta.url);
const source = readFileSync(enginePath, 'utf8');
const js = stripTypeScriptTypes(source.replace(
  /^import \{ createClient \} from .*;$/m,
  'const { createClient } = __testDeps;',
));
const FROZEN = '34902bac07a459a4f0c051b90bfe3b4c492f2465d06c661bab18ab7f36252184';
const GATES = ['LEGAL_SOURCE_V2_1', 'ENGINE_SECURITY_V2_1', 'AGENT_137_V2_1', 'AGENT_32_V2_1', 'PERSISTED_E2E_6'];
// Keep the identity layer real and frozen while all row contents and results
// remain synthetic. This exercises the same release identity fingerprint.
const frozenRegistry = JSON.parse(readFileSync(new URL(
  '../v21-assurance/source_frozen/NBR_Agent_Canonical_Rule_Registry_FINAL_2026_09_30.json',
  import.meta.url,
), 'utf8'));
const CANONICAL_IDS = frozenRegistry.rules.map(rule => rule.rule_id).sort();
const SPECIAL_RULE_KEY = CANONICAL_IDS[0];
const STANDARD_ROWS = CANONICAL_IDS.map(rule_key => ({
  rule_key,
  revision_no: 1,
  execution_status: 'NOT_APPLICABLE',
  year_applicability_status: 'CURRENT',
  group_id: 'synthetic',
  rule_data: {},
}));
const STANDARD_BINDINGS = STANDARD_ROWS.map(r => ({
  rule_key: r.rule_key, runtime_mode: 'NOT_APPLICABLE',
  affects_calculation: false, affects_submission: false,
}));
function withSpecialRule(ruleData, bindingData = {}) {
  return {
    rows: STANDARD_ROWS.map(row => row.rule_key === SPECIAL_RULE_KEY ? {
      ...row, execution_status: 'FACT_GATED', rule_data: ruleData,
    } : row),
    bindings: STANDARD_BINDINGS.map(binding => binding.rule_key === SPECIAL_RULE_KEY ? {
      ...binding, runtime_mode: 'MANUAL_FACT_GATE', affects_calculation: true,
      affects_submission: true, ...bindingData,
    } : binding),
  };
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
}

function sha(value) { return createHash('sha256').update(value).digest('hex'); }

const pgBin = '/tmp/nbr-w5-postgres-bin/usr/lib/postgresql/16/bin/psql';
const pgArgs = () => [
  '-h', process.env.W5_PG_SOCKET, '-p', '55432', '-U', 'nobody', '-d', process.env.W5_PG_DB ?? 'postgres',
  '-X', '-At', '-v', 'ON_ERROR_STOP=1',
];
const pgEnv = () => ({ ...process.env, LD_LIBRARY_PATH: '/tmp/nbr-w5-postgres-bin/usr/lib/x86_64-linux-gnu' });
const pgQuote = value => value === null || value === undefined
  ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
function pgQuery(sql) {
  return execFileSync(pgBin, [...pgArgs(), '-c', sql], {
    encoding: 'utf8', env: pgEnv(),
  }).trim();
}

function actualSyntheticSql(args) {
  const bool = value => value === null || value === undefined ? 'NULL' : value ? 'true' : 'false';
  const count = args.p_disabled_child_count === null || args.p_disabled_child_count === undefined
    ? 'NULL'
    : String(args.p_disabled_child_count);
  const sql = `select public.nbr_engine_calculate_individual_base_tax(` +
    `${pgQuote(args.p_assessment_year)},${pgQuote(args.p_total_income)}::numeric,` +
    `${pgQuote(args.p_special_category)},${bool(args.p_is_new_taxpayer)},${count}::integer)::text`;
  return JSON.parse(pgQuery(sql));
}

function persistSyntheticLog(record) {
  const keys = [
    'assessment_year','engine_version','input_hash','rule_set_hash','result_status',
    'applied_rule_count','needs_fact_count','blocked_rule_count','calculation_trace',
  ];
  const values = keys.map(key => {
    if (key === 'calculation_trace') return `${pgQuote(JSON.stringify(record[key]))}::jsonb`;
    if (key.endsWith('_count')) return String(record[key]);
    return pgQuote(record[key]);
  });
  const sql = `INSERT INTO public.nbr_engine_evaluation_log (${keys.join(',')}) ` +
    `VALUES (${values.join(',')}) RETURNING id::text`;
  return pgQuery(sql).split('\n')[0];
}

function readSyntheticLog(inputHash) {
  const sql = `SELECT json_build_object('assessment_year',assessment_year,` +
    `'result_status',result_status,'rule_set_hash',rule_set_hash,` +
    `'calculation_trace',calculation_trace)::text FROM public.nbr_engine_evaluation_log ` +
    `WHERE input_hash=${pgQuote(inputHash)} ORDER BY created_at DESC LIMIT 1`;
  const raw = pgQuery(sql);
  return raw ? JSON.parse(raw) : null;
}

const SYNTHETIC_SCHEDULE = { revision_no: 1, parameter_data: { synthetic_only:true, rounding_policy:'FIXED_DECIMAL_10_TRUNCATE_TOWARD_ZERO' }, legal_source:'SYNTHETIC-NOT-LAW', status:'ACTIVE' };
function releaseEvidence(rows = STANDARD_ROWS, bindings = STANDARD_BINDINGS, schedule = SYNTHETIC_SCHEDULE) {
  const map = new Map(bindings.map(x => [x.rule_key, x]));
  const hash = sha(canonical({
    rules: rows.map(row => ({
      rule_key: row.rule_key,
      revision_no: row.revision_no,
      execution_status: row.execution_status,
      year_applicability_status: row.year_applicability_status,
      group_id: row.group_id,
      rule_data: row.rule_data,
      runtime_binding: map.get(row.rule_key) ?? null,
    })),
    individual_tax_schedule: schedule ? {
      revision_no: schedule.revision_no, parameter_data: schedule.parameter_data,
      legal_source: schedule.legal_source, status: schedule.status,
    } : null,
  }));
  return GATES.map(gate_code => ({
    gate_code, status: 'PASS', evidence_ref: `SYNTHETIC-ONLY-${gate_code}`,
    evaluated_by: 'synthetic-qa', evaluated_at: '2026-10-20T04:00:00Z',
    evidence_detail: { rule_set_hash: hash, registry_sha256: FROZEN, decision: 'APPROVED' },
  }));
}

function fixture(overrides = {}) {
  const state = {
    authenticated: true,
    authorizedTaxpayer: true,
    ownershipError: null,
    reservationState:'RESERVED',
    reservationError:null,
    finalizeReceipt:true,
    finalizeError:null,
    replayCalls:0,
    finalizeCalls:0,
    year: { id: 'synthetic-year', assessment_year: '2026-27', state: 'active', is_executable: true, legal_cutoff: '2026-09-30' },
    rows: STANDARD_ROWS,
    bindings: STANDARD_BINDINGS,
    schedule: SYNTHETIC_SCHEDULE,
    gates: [],
    logError: null,
    rpcResponse: { status: 'FAIL_CLOSED' },
    realSql: false,
    calls: { auth: 0, rpc: 0, log: 0 },
    ownershipCalls: 0,
    ...overrides,
  };
  state.year = { income_year:'2025-26', legal_cutoff:'2026-09-30', ...state.year };
  const tableRows = table => {
    if (table === 'nbr_tax_years') return state.year;
    if (table === 'nbr_rule_versions') return state.rows;
    if (table === 'nbr_engine_parameter_sets') return state.schedule;
    if (table === 'nbr_rule_runtime_bindings') return state.bindings;
    if (table === 'nbr_tax_year_gate_results') return state.gates;
    throw new Error('Unexpected database table in isolated test: ' + table);
  };
  const createClient = () => ({
    auth: { async getUser(token) {
      state.calls.auth++;
      return state.authenticated && token === 'valid.test.token'
        ? { data: { user: { id: 'synthetic-user' } }, error: null }
        : { data: { user: null }, error: { message: 'invalid' } };
    } },
    from(table) {
      const query = {
        select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
        async maybeSingle() { return { data: tableRows(table), error: null }; },
        async insert(record) {
          assert.equal(table, 'nbr_engine_evaluation_log');
          state.calls.log++;
          state.lastLog = record;
          if (state.realSql) {
            try {
              state.persistedLogId = persistSyntheticLog(record);
              state.persistedLog = readSyntheticLog(record.input_hash);
              return { data: null, error: null };
            } catch (error) {
              return { data: null, error: { message: String(error) } };
            }
          }
          return { data: null, error: state.logError };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: tableRows(table), error: null }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(_name, args) {
      if (_name === 'nbr_authorize_citizen_evaluation') {
        state.ownershipCalls++;
        state.lastOwnershipArgs = args;
        return { data: state.authorizedTaxpayer, error: state.ownershipError };
      }
      if (_name === 'nbr_reserve_citizen_evaluation') {
        state.replayCalls++;
        state.lastReservationArgs=args;
        return { data:state.reservationState === null ? null : {state:state.reservationState}, error:state.reservationError };
      }
      if (_name === 'nbr_finalize_citizen_evaluation') {
        state.finalizeCalls++;
        state.lastFinalizeArgs=args;
        return { data:state.finalizeReceipt,error:state.finalizeError };
      }
      state.calls.rpc++;
      state.lastRpcArgs = args;
      try {
        const raw=state.realSql ? actualSyntheticSql(args) : state.rpcResponse;
        return { data:raw?.status==='CALCULATED' ? {
          ...raw,
          parameter_revision:args.p_parameter_revision,
          rule_set_hash:args.p_expected_rule_set_hash,
          rounding_policy:'FIXED_DECIMAL_10_TRUNCATE_TOWARD_ZERO',
          ...(state.rpcIntegrityOverride ?? {}),
        } : raw, error: null };
      } catch (error) {
        return { data: null, error: { message: String(error) } };
      }
    },
  });
  let handler;
  const sandbox = {
    __testDeps: { createClient },
    Deno: { serve(fn) { handler = fn; }, env: { get(k) { return k === 'SUPABASE_SERVICE_ROLE_KEY' ? 'synthetic-secret' : k === 'NBR_TAX_ALLOWED_ORIGINS' ? 'https://client.synthetic.invalid' : k === 'NBR_TAX_EXECUTION_ENABLED' ? 'true' : 'https://synthetic.invalid'; } } },
    Response, Request, URL, crypto: webcrypto, TextEncoder, console,
  };
  runInNewContext(js, sandbox, { filename: 'isolated-nbr-tax-engine.js', timeout: 5000 });
  if (typeof handler !== 'function') throw new Error('Deployed engine handler not registered');
  state.request = async (body, authorization = 'Bearer valid.test.token', method = 'POST', origin = null) => {
    const headers = authorization === null ? {} : { authorization };
    if (origin !== null) headers.origin = origin;
    const completedBody = {
      taxpayer: { entityType:'individual', residency:'resident', industryCode:'not_applicable', specialCategory:'none' },
      contractVersion:'NBR_ENGINE_CITIZEN_V2_REVIEW',
      legalEventDate:'2026-07-01',
      idempotencyKey:'synthetic-run-replay-00000001',
      expectedRuleSetHash:releaseEvidence(state.rows,state.bindings,state.schedule)[0].evidence_detail.rule_set_hash,
      expectedParameterRevision:state.schedule?.revision_no ?? 1,
      expectedSourceCutoff:state.year.legal_cutoff,
      taxpayerRecordId:'50000000-0000-4000-8000-000000000001',
      incomeYear:'2025-26',
      returnData:{incomeHeads:{employment:0}},
      ...body,
      taxpayer: Object.hasOwn(body ?? {}, 'taxpayer') && body.taxpayer === null ? null : { entityType:'individual',residency:'resident',industryCode:'not_applicable',specialCategory:'none',...(body?.taxpayer ?? {}) },
    };
    const req = new Request('https://synthetic.invalid/functions/v1/nbr-tax-engine', {
      method, headers, ...(method === 'POST' ? { body: JSON.stringify(completedBody) } : {}),
    });
    const response = await handler(req);
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  return state;
}

test('unauthenticated POST is denied before SQL or logging', async () => {
  const s = fixture();
  const r = await s.request({ assessmentYear: '2026-27' }, null);
  assert.equal(r.status, 401);
  assert.deepEqual(s.calls, { auth: 0, rpc: 0, log: 0 });
});

test('service-role token cannot act as taxpayer credential', async () => {
  const s = fixture();
  const r = await s.request({ assessmentYear: '2026-27' }, 'Bearer synthetic-secret');
  assert.equal(r.status, 401);
  assert.deepEqual(s.calls, { auth: 0, rpc: 0, log: 0 });
});

test('invalid and expired-equivalent tokens fail closed', async () => {
  const s = fixture({ authenticated: false });
  const r = await s.request({ assessmentYear: '2026-27' });
  assert.equal(r.status, 401);
  assert.equal(s.calls.rpc, 0);
});

for (const value of [undefined, null, 202627, '', '2026-26', '2026-27 extra', '2027-26']) {
  test('missing or malformed explicit assessment year is rejected: ' + String(value), async () => {
    const s = fixture();
    const r = await s.request({ assessmentYear: value });
    assert.equal(r.status, 400);
    assert.equal(s.calls.rpc, 0);
    assert.equal(s.calls.log, 0);
  });
}

test('draft tax year is not executable', async () => {
  const s = fixture({ year: { id: 'synthetic-year', state: 'draft', is_executable: false } });
  const r = await s.request({ assessmentYear: '2027-28' });
  assert.equal(r.status, 409);
  assert.equal(s.calls.rpc, 0);
});

test('old seed PASS gates do not authorize calculation', async () => {
  const s = fixture({ gates: [{ gate_code: 'approval', status: 'PASS' }, { gate_code: 'regression', status: 'PASS' }] });
  const r = await s.request({ assessmentYear: '2026-27' });
  assert.equal(r.status, 409);
  assert.equal(r.body.pendingGates.length, GATES.length);
  assert.equal(s.calls.rpc, 0);
});

test('a tax year with fewer than the frozen 366 rules cannot be submission-ready', async () => {
  const rows = STANDARD_ROWS.slice(0, 365);
  const bindings = STANDARD_BINDINGS.slice(0, 365);
  const s = fixture({ rows, bindings, gates: releaseEvidence(rows, bindings) });
  const r = await s.request({ assessmentYear: '2026-27' });
  assert.equal(r.status, 503);
  assert.equal(r.body.status, 'FAIL_CLOSED');
  assert.equal(s.calls.rpc, 0);
});

test('duplicate rule identities fail closed before calculation', async () => {
  const rows = [...STANDARD_ROWS, STANDARD_ROWS[0]];
  const s = fixture({ rows, gates: releaseEvidence(rows, STANDARD_BINDINGS) });
  const r = await s.request({ assessmentYear: '2026-27' });
  assert.equal(r.status, 503);
  assert.equal(s.calls.rpc, 0);
});

test('366 distinct substitute identities cannot impersonate the frozen registry', async () => {
  const rows = STANDARD_ROWS.map((row, i) => i === 0 ? { ...row, rule_key: 'FABRICATED-RULE-001' } : row);
  const bindings = STANDARD_BINDINGS.map((binding, i) =>
    i === 0 ? { ...binding, rule_key: 'FABRICATED-RULE-001' } : binding);
  const s = fixture({ rows, bindings, gates: releaseEvidence(rows, bindings) });
  const r = await s.request({ assessmentYear: '2026-27' });
  assert.equal(r.status, 503);
  assert.match(r.body.error, /frozen certified registry/);
  assert.equal(s.calls.rpc, 0);
  assert.equal(s.calls.log, 0);
});

test('a 367th unreviewed rule cannot bypass a frozen 366 identity manifest', async () => {
  const rows = [...STANDARD_ROWS, { ...STANDARD_ROWS[0], rule_key: 'FABRICATED-EXTRA-001' }];
  const s = fixture({ rows, gates: releaseEvidence(rows) });
  const r = await s.request({ assessmentYear: '2026-27' });
  assert.equal(r.status, 503);
  assert.equal(s.calls.rpc, 0);
});

test('duplicate runtime bindings are rejected despite complete rule key coverage', async () => {
  const bindings = [...STANDARD_BINDINGS, STANDARD_BINDINGS[0]];
  const s = fixture({ bindings, gates: releaseEvidence(STANDARD_ROWS, bindings) });
  const r = await s.request({ assessmentYear: '2026-27' });
  assert.equal(r.status, 503);
  assert.equal(s.calls.rpc, 0);
});

test('a changed tax schedule revokes a prior rule-set approval', async () => {
  const approvedSchedule = { revision_no: 1, parameter_data: { synthetic_threshold: 100 },
    legal_source: 'SYNTHETIC-ONLY', status: 'ACTIVE' };
  const changedSchedule = { ...approvedSchedule, parameter_data: { synthetic_threshold: 200 } };
  const s = fixture({ schedule: changedSchedule,
    gates: releaseEvidence(STANDARD_ROWS, STANDARD_BINDINGS, approvedSchedule) });
  const r = await s.request({ assessmentYear: '2026-27' });
  assert.equal(r.status, 409);
  assert.equal(r.body.pendingGates.length, GATES.length);
  assert.equal(s.calls.rpc, 0);
});

test('new release gates must match current rule and frozen registry hashes', async () => {
  const gates = releaseEvidence().map(g => ({ ...g, evidence_detail: { ...g.evidence_detail, rule_set_hash: 'incorrect' } }));
  const s = fixture({ gates });
  const r = await s.request({ assessmentYear: '2026-27' });
  assert.equal(r.status, 409);
  assert.equal(r.body.pendingGates.length, GATES.length);
  assert.equal(s.calls.rpc, 0);
});

test('verified release gates still reject missing rule-level legal provenance', async () => {
  const { rows, bindings } = withSpecialRule({});
  const s = fixture({ rows, bindings, gates: releaseEvidence(rows, bindings) });
  const r = await s.request({ assessmentYear: '2026-27' });
  assert.equal(r.status, 409);
  assert.equal(r.body.unverifiedCount, 1);
  assert.equal(s.calls.rpc, 0);
});

test('synthetic legal attestations are independent of immutable rule_data', async () => {
  const { rows, bindings } = withSpecialRule({ rule_id: SPECIAL_RULE_KEY });
  const gates = releaseEvidence(rows, bindings);
  gates[0].evidence_detail.rule_verifications = {
    [SPECIAL_RULE_KEY]: {
      status: 'VERIFIED', revision_no: 1, source_sha256: 'a'.repeat(64),
      provision_locator: 'SYNTHETIC-ONLY', effective_from: '2026-07-01', reviewed_by: 'synthetic-legal-reviewer',
    },
  };
  const s = fixture({ rows, bindings, gates });
  const r = await s.request({ assessmentYear: '2026-27', returnData: { incomeHeads: { employment: 0 } } });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'FAIL_CLOSED');
  assert.deepEqual(s.calls, { auth: 1, rpc: 1, log: 1 });
  assert.equal(rows.find(row => row.rule_key === SPECIAL_RULE_KEY).rule_data.legal_verification, undefined);
});

for (const [name, rateText, facts, expectedState, expectedAmount, alternateRate] of [
  ['conditional single percentage', '10% if exemption eligibility documented', { baseAmount: 100 }, 'FAIL_CLOSED', undefined],
  ['conditional percentage with caller-selected option', '10% if exemption eligibility documented', { baseAmount: 100, rateOptionIndex: 0 }, 'FAIL_CLOSED', undefined],
  ['multiple unstructured percentage branches', '10% or 15% depending on district', { baseAmount: 100, rateOptionKey: 'option_1' }, 'FAIL_CLOSED', undefined],
  ['missing alternate rate cannot fall back to primary', '10%', { baseAmount: 100, branch: 'alternate' }, 'FAIL_CLOSED', undefined],
  ['unknown branch cannot silently become primary', '10%', { baseAmount: 100, branch: 'nonresident' }, 'FAIL_CLOSED', undefined],
  ['verified alternate rate control', '10%', { baseAmount: 100, branch: 'alternate' }, 'CALCULATED', '15', '15%'],
  ['exact percentage control', '10%', { baseAmount: 100 }, 'CALCULATED', '10'],
]) {
  test('legally reviewed synthetic rate parsing: ' + name, async () => {
    const id = SPECIAL_RULE_KEY;
    const { rows, bindings } = withSpecialRule({
      rate_primary: rateText, ...(alternateRate ? { rate_alternate: alternateRate } : {}),
    });
    const gates = releaseEvidence(rows, bindings);
    gates[0].evidence_detail.rule_verifications = {
      [id]: {
        status: 'VERIFIED', revision_no: 1, source_sha256: 'a'.repeat(64),
        provision_locator: 'SYNTHETIC-ONLY', effective_from: '2026-07-01',
        reviewed_by: 'synthetic-legal-reviewer',
      },
    };
    const s = fixture({ rows, bindings, gates });
    const r = await s.request({ assessmentYear: '2026-27', ruleFacts: { [id]: facts } });
    assert.equal(r.status, 200);
    const result = r.body.rules.find(rule => rule.ruleId === id);
    assert.equal(result.state, expectedState);
    assert.equal(result.amount, expectedAmount);
    if (rateText.includes('if ') || rateText.includes('depending')) {
      assert.equal(result.rateOptions.length, 0);
    }
    if (expectedState === 'FAIL_CLOSED') assert.equal(r.body.ruleSummary.relevantBlocked, 1);
  });
}

test('evaluation log persistence failure prevents a success response', async () => {
  const s = fixture({ gates: releaseEvidence(), logError: { message: 'synthetic database write failure' } });
  const r = await s.request({ assessmentYear: '2026-27', returnData: { incomeHeads: { employment: 0 } } });
  assert.equal(r.status, 503);
  assert.deepEqual(s.calls, { auth: 1, rpc: 1, log: 1 });
});

test('fully gated synthetic request retains an explicit fail-closed tax result', async () => {
  const s = fixture({ gates: releaseEvidence() });
  const r = await s.request({ assessmentYear: '2026-27', returnData: { incomeHeads: { employment: 0 } } });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'FAIL_CLOSED');
  assert.equal(r.body.submissionReady, false);
  assert.equal(s.lastLog.result_status, 'FAIL_CLOSED');
  assert.equal(s.lastLog.calculation_trace.actor_user_id, 'synthetic-user');
});

for (const [name, taxpayer, returnData] of [
  ['string false must never become true', { entityType: 'individual', isNewTaxpayer: 'false' }, undefined],
  ['fractional disabled-child count', { entityType: 'individual', disabledChildCount: 1.5 }, undefined],
  ['negative disabled-child count', { entityType: 'individual', disabledChildCount: -1 }, undefined],
  ['unsupported corporate-calculator entity', { entityType: 'company' }, undefined],
  ['missing taxpayer', null, undefined],
  ['negative income amount', undefined, { incomeHeads: { employment: -1 } }],
  ['excess monetary fractional precision', undefined, { incomeHeads: { employment: '1.12345678901' } }],
  ['missing income-head facts', undefined, { incomeHeads: {} }],
]) {
  test('invalid taxpayer facts fail before SQL: ' + name, async () => {
    const s = fixture({ gates: releaseEvidence() });
    const r = await s.request({
      assessmentYear: '2026-27',
      ...(taxpayer !== undefined ? { taxpayer } : {}),
      ...(returnData !== undefined ? { returnData } : {}),
    });
    assert.equal(r.status, 422);
    assert.equal(r.body.status, 'FAIL_CLOSED');
    assert.equal(s.calls.rpc, 0);
    assert.equal(s.calls.log, 0);
  });
}

test('boolean false is transmitted unchanged to SQL, with no truthy coercion', async () => {
  const s = fixture({ gates: releaseEvidence() });
  const r = await s.request({
    assessmentYear: '2026-27',
    taxpayer: { entityType: 'individual', isNewTaxpayer: false },
  });
  assert.equal(r.status, 200);
  assert.equal(s.lastRpcArgs.p_is_new_taxpayer, false);
});

test('missing rebate rule fails closed instead of labeling a rebate request as only needing facts', async () => {
  const s = fixture({
    gates: releaseEvidence(),
    rpcResponse: { status: 'CALCULATED', grossTax: '20', taxFreeThreshold: '100', missingFacts: [] },
  });
  const r = await s.request({
    assessmentYear: '2026-27',
    returnData: { incomeHeads: { employment: 250 }, taxRebates: { investment: 50 } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'FAIL_CLOSED');
  assert.equal(r.body.submissionReady, false);
  assert.equal(s.lastLog.result_status, 'FAIL_CLOSED');
});

for (const [name, patch] of [
  ['negative withholding credit', { taxDeductedAtSource: '-1' }],
  ['negative advance payment', { advanceTaxPaid: -2 }],
  ['negative self-assessment payment', { selfAssessmentTaxPaid: -3 }],
  ['malformed rebate object', { taxRebates: '15' }],
  ['negative rebate claim', { taxRebates: { investment: -50 } }],
  ['over-precise rebate claim', { taxRebates: { investment: '1.12345678901' } }],
  ['negative eligible investment', { eligibleInvestmentAmount: '-100' }],
  ['over-precise adjusted income', { adjustedTotalIncomeForRebate: '100.12345678901' }],
]) {
  test('untrusted monetary inputs are rejected before SQL: ' + name, async () => {
    const s = fixture({ gates: releaseEvidence() });
    const r = await s.request({ assessmentYear: '2026-27',
      returnData: { incomeHeads: { employment: 100 }, ...patch },
    });
    assert.equal(r.status, 422);
    assert.equal(r.body.status, 'FAIL_CLOSED');
    assert.equal(s.calls.rpc, 0);
    assert.equal(s.calls.log, 0);
  });
}

for (const [name, ruleFacts] of [
  ['null fact entry', { [SPECIAL_RULE_KEY]: null }],
  ['array fact entry', { [SPECIAL_RULE_KEY]: [] }],
  ['negative base amount', { [SPECIAL_RULE_KEY]: { baseAmount: -2 } }],
  ['fractional overflow', { [SPECIAL_RULE_KEY]: { quantity: '1.12345678901' } }],
]) {
  test('invalid rule facts fail closed without a server exception: ' + name, async () => {
    const s = fixture({ gates: releaseEvidence() });
    const r = await s.request({ assessmentYear: '2026-27', ruleFacts });
    assert.equal(r.status, 422);
    assert.equal(s.calls.rpc, 0);
  });
}

function rebateFixture(rebateCalculation, originalLegalProse) {
  const rebateKey = 'S78-GENERAL-REBATE-FA2026';
  assert.ok(CANONICAL_IDS.includes(rebateKey), 'canonical 366-rule baseline must retain the section 78 identity');
  const rows = STANDARD_ROWS.map(row => row.rule_key === rebateKey
    ? { ...row, execution_status: 'FACT_GATED',
        rule_data: { cap_formula: originalLegalProse } }
    : row);
  const bindings = STANDARD_BINDINGS.map(binding => binding.rule_key === rebateKey
    ? { ...binding, runtime_mode: 'BENEFIT_CLAIM', affects_calculation: true, affects_submission: true }
    : binding);
  const schedule = { revision_no: 1, parameter_data: {rounding_policy:'FIXED_DECIMAL_10_TRUNCATE_TOWARD_ZERO'}, legal_source: 'SYNTHETIC-ONLY', status: 'ACTIVE' };
  const gates = releaseEvidence(rows, bindings, schedule);
  gates[0].evidence_detail.rule_verifications = {
    [rebateKey]: {
      status: 'VERIFIED', revision_no: 1, source_sha256: 'b'.repeat(64),
      provision_locator: 'SYNTHETIC-SECTION-78', effective_from: '2026-07-01',
      reviewed_by: 'synthetic-legal-reviewer',
      ...(rebateCalculation === undefined ? {} : { rebate_calculation: rebateCalculation }),
    },
  };
  return fixture({ rows, bindings, gates,
    schedule,
    rpcResponse: { status: 'CALCULATED', grossTax: '500', taxFreeThreshold: '100', missingFacts: [] },
  });
}

test('arbitrary legal prose containing three percentages is never a rebate formula', async () => {
  const s = rebateFixture(undefined, 'Eligibility varies: 3%, 15%, then 40%; cap BDT 1000 only in selected cases');
  const r = await s.request({ assessmentYear: '2026-27',
    returnData: { incomeHeads: { employment: 10000 }, taxRebates: { investment: 1000 },
      adjustedTotalIncomeForRebate: 10000, eligibleInvestmentAmount: 1000 },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'FAIL_CLOSED');
  assert.equal(r.body.individual.trace.rebateStatus, 'FAIL_CLOSED');
  assert.equal(r.body.individual.missingFacts.includes('section78StructuredFormula'), true);
});

test('legal reviewer-linked structured rebate rates compute an exact synthetic minimum', async () => {
  const s = rebateFixture({ income_rate: '0.03', investment_rate: '0.15', cap_bdt: '1000' },
    'unstructured legal context does not enter the arithmetic parser');
  const r = await s.request({ assessmentYear: '2026-27',
    returnData: { incomeHeads: { employment: 10000 }, taxRebates: { investment: 1000 },
      adjustedTotalIncomeForRebate: 10000, eligibleInvestmentAmount: 1000 },
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'CALCULATED');
  assert.equal(r.body.individual.values.rebate, '150');
  assert.equal(r.body.individual.values.netTax, '350');
  assert.equal(r.body.individual.trace.rebate.formula, 'VERSION_LINKED_LEGAL_REVIEW');
});

for (const invalid of [
  { income_rate: '1.5', investment_rate: '0.15', cap_bdt: '1000' },
  { income_rate: '0.03', investment_rate: '-0.15', cap_bdt: '1000' },
  { income_rate: '3%', investment_rate: '0.15', cap_bdt: '1000' },
]) {
  test('malformed/unbounded reviewer rebate parameters fail closed: ' + JSON.stringify(invalid), async () => {
    const s = rebateFixture(invalid, 'contains 3% and BDT 1000 but not machine-executable');
    const r = await s.request({ assessmentYear: '2026-27',
      returnData: { incomeHeads: { employment: 10000 }, taxRebates: { investment: 1000 },
        adjustedTotalIncomeForRebate: 10000, eligibleInvestmentAmount: 1000 },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'FAIL_CLOSED');
  });
}

if (process.env.W5_PG_SOCKET) {
  const schedule = { revision_no: 1, parameter_data: {rounding_policy:'FIXED_DECIMAL_10_TRUNCATE_TOWARD_ZERO'}, legal_source: 'SYNTHETIC-ONLY', status: 'ACTIVE' };
  const realDbFixture = year => fixture({
    realSql: true,
    gates: releaseEvidence(STANDARD_ROWS, STANDARD_BINDINGS, schedule),
    schedule,
    year: { id: 'synthetic-year', assessment_year: year, income_year: 'synthetic', state: 'active', is_executable: true },
  });
  test('real local SQL + actual Edge handler: synthetic slab result is read through RPC', async () => {
    const s = realDbFixture('2099-00');
    const r = await s.request({
      assessmentYear: '2099-00',
      taxpayer: { entityType: 'individual', isNewTaxpayer: false },
      returnData: { incomeHeads: { employment: 250 } },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'CALCULATED');
    assert.equal(r.body.individual.values.grossTax, '20');
    assert.equal(s.lastLog.result_status, 'CALCULATED');
    assert.equal(s.persistedLog.result_status, 'CALCULATED');
    assert.equal(s.persistedLog.rule_set_hash, r.body.ruleSetHash);
    assert.equal(s.persistedLog.assessment_year, '2099-00');
  });
  test('real local SQL + Edge: incomplete slab schedule fails closed', async () => {
    const s = realDbFixture('2098-99');
    const r = await s.request({
      assessmentYear: '2098-99',
      taxpayer: { entityType: 'individual', isNewTaxpayer: false },
      returnData: { incomeHeads: { employment: 350 } },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'FAIL_CLOSED');
    assert.equal(r.body.submissionReady, false);
  });
  test('real local SQL + Edge: missing minimum tax fails closed', async () => {
    const s = realDbFixture('2097-98');
    const r = await s.request({
      assessmentYear: '2097-98',
      taxpayer: { entityType: 'individual', isNewTaxpayer: false },
      returnData: { incomeHeads: { employment: 150 } },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'FAIL_CLOSED');
  });
  test('real local SQL + Edge: missing taxpayer status remains NEEDS_FACTS', async () => {
    const s = realDbFixture('2099-00');
    const r = await s.request({
      assessmentYear: '2099-00',
      taxpayer: Object.hasOwn(body ?? {}, 'taxpayer') && body.taxpayer === null ? null : { entityType: 'individual', residency:'resident', industryCode:'not_applicable', specialCategory:'none', ...(body?.taxpayer ?? {}) },
      contractVersion: 'NBR_ENGINE_CITIZEN_V2_REVIEW',
      legalEventDate:'2026-07-01',
      idempotencyKey:'synthetic-run-replay-00000001',
      expectedRuleSetHash: releaseEvidence(state.rows, state.bindings, state.schedule)[0].evidence_detail.rule_set_hash,
      expectedParameterRevision: state.schedule?.revision_no ?? 1,
      expectedSourceCutoff: state.year.legal_cutoff,
      taxpayerRecordId: '50000000-0000-4000-8000-000000000001',
      incomeYear: '2025-26',
      returnData: { incomeHeads: { employment: 250 } },
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.status, 'NEEDS_FACTS');
    assert.equal(r.body.submissionReady, false);
  });
}

// WS04 secure-ownership extension: test only an isolated simulated SQL contract.
test('missing taxpayer record identity fails closed before privileged tax RPC', async () => {
  const s = fixture({ gates: releaseEvidence() });
  const r = await s.request({ assessmentYear: '2026-27', taxpayerRecordId: undefined });
  assert.equal(r.status, 422); assert.equal(r.body.code, 'TAXPAYER_RECORD_REQUIRED');
  assert.equal(s.ownershipCalls, 0); assert.equal(s.calls.rpc, 0);
});
test('wrong taxpayer or tenant ownership is forbidden, even with valid JWT and synthetic PASS gates', async () => {
  const s = fixture({ authorizedTaxpayer: false, gates: releaseEvidence(), year: {id:'synthetic-year', assessment_year:'2026-27', income_year:'2025-26',state:'active',is_executable:true} });
  const r = await s.request({ assessmentYear:'2026-27' });
  assert.equal(r.status,403); assert.equal(r.body.code,'TAXPAYER_ACCESS_DENIED');
  assert.equal(s.ownershipCalls,1); assert.equal(s.calls.rpc,0); assert.equal(s.calls.log,0);
});
test('missing WS02 owner RPC fails closed rather than accepting bearer identity as ownership', async () => {
  const s = fixture({ ownershipError: { message:'function absent' }, gates: releaseEvidence(), year: {id:'synthetic-year', assessment_year:'2026-27', income_year:'2025-26',state:'active',is_executable:true} });
  const r = await s.request({ assessmentYear:'2026-27' });
  assert.equal(r.status,503); assert.equal(r.body.code,'OWNERSHIP_GATE_UNAVAILABLE');
  assert.equal(s.calls.rpc,0); assert.equal(s.calls.log,0);
});
test('forged owner identity in body cannot override verified Auth principal sent to RPC', async () => {
  const s = fixture({ gates: [], year: {id:'synthetic-year', assessment_year:'2026-27', income_year:'2025-26',state:'active',is_executable:true} });
  const r = await s.request({ assessmentYear:'2026-27', userId:'attacker', taxpayer:{entityType:'individual',userId:'attacker'} });
  assert.equal(r.status,409); assert.equal(s.lastOwnershipArgs.p_auth_user_id,'synthetic-user');
  assert.equal(s.lastOwnershipArgs.p_taxpayer_record_id,'50000000-0000-4000-8000-000000000001');
});
test('mismatched income year rejects evaluation before owner SQL access', async () => {
  const s = fixture({ year: {id:'synthetic-year', assessment_year:'2026-27', income_year:'2024-25',state:'active',is_executable:true} });
  const r = await s.request({ assessmentYear:'2026-27' });
  assert.equal(r.status,409); assert.equal(r.body.code,'YEAR_MISMATCH');
  assert.equal(s.ownershipCalls,1); assert.equal(s.calls.rpc,0);
});
test('unapproved request origin is blocked before service-role initialization', async () => {
  const s = fixture();
  const response = await s.request({ assessmentYear:'2026-27' }, 'Bearer valid.test.token', 'POST', 'https://evil.synthetic.invalid');
  assert.equal(response.status,403);
  assert.equal(s.calls.auth,0); assert.equal(s.calls.rpc,0); assert.equal(s.calls.log,0);
});

test('approved exact CORS origin can reach the normal fail-closed release gate', async () => {
  const s = fixture();
  const r = await s.request({assessmentYear:'2026-27'}, 'Bearer valid.test.token','POST','https://client.synthetic.invalid');
  assert.equal(r.status,409);
});

// WS04 22 October: additive candidate tests, all synthetic and NOT Bangladesh law.
function syntheticRateCase(rateText) {
  const {rows,bindings}=withSpecialRule({rate_primary:rateText});
  const gates=releaseEvidence(rows,bindings);
  gates[0].evidence_detail.rule_verifications={
    [SPECIAL_RULE_KEY]: {status:'VERIFIED',revision_no:1,source_sha256:'a'.repeat(64),
      provision_locator:'SYNTHETIC-TEST-ONLY',effective_from:'2026-07-01',reviewed_by:'isolated-mock'}
  };
  return fixture({rows,bindings,gates,rpcResponse:{status:'CALCULATED',grossTax:'0',taxFreeThreshold:'0',missingFacts:[]}});
}

test('exact rate 0.0000001% converts to 0.000000001 without a floating point operation',async()=>{
  const s=syntheticRateCase('0.0000001%');
  const r=await s.request({assessmentYear:'2026-27',ruleFacts:{[SPECIAL_RULE_KEY]:{baseAmount:'1000000000'}}});
  assert.equal(r.status,200);
  const calculated=r.body.rules.find(x=>x.ruleId===SPECIAL_RULE_KEY);
  assert.equal(calculated.state,'CALCULATED');
  assert.equal(calculated.rate,'0.000000001');
  assert.equal(calculated.amount,'1');
  assert.match(r.body.receiptHash,/^[a-f0-9]{64}$/);
});

test('unsupported percentage precision is not rounded or converted to zero',async()=>{
  const s=syntheticRateCase('0.000000001%');
  const r=await s.request({assessmentYear:'2026-27',ruleFacts:{[SPECIAL_RULE_KEY]:{baseAmount:'1000000000'}}});
  assert.equal(r.body.status,'FAIL_CLOSED');
  const result=r.body.rules.find(x=>x.ruleId===SPECIAL_RULE_KEY);
  assert.equal(result.state,'FAIL_CLOSED');
  assert.equal(result.amount,undefined);
  assert.equal(r.body.individual.values,undefined);
});

test('missing SQL gross-tax amount cannot become the valid zero',async()=>{
  const s=fixture({gates:releaseEvidence(),rpcResponse:{status:'CALCULATED',taxFreeThreshold:'100'}});
  const r=await s.request({assessmentYear:'2026-27'});
  assert.equal(r.body.status,'FAIL_CLOSED');
  assert.equal(r.body.ok,false);
  assert.equal(r.body.individual.values,undefined);
});

test('nonzero withholding declaration cannot become a payable credit without verified ledger ownership',async()=>{
  const s=fixture({gates:releaseEvidence(),rpcResponse:{status:'CALCULATED',grossTax:'50',taxFreeThreshold:'100',missingFacts:[]}});
  const r=await s.request({assessmentYear:'2026-27',returnData:{incomeHeads:{employment:'1000'},taxDeductedAtSource:'20'}});
  assert.equal(r.body.status,'FAIL_CLOSED');
  assert.equal(r.body.code,'CREDIT_EVIDENCE_NOT_VERIFIED');
  assert.equal(r.body.individual.values,undefined);
  assert.equal(r.body.submissionReady,false);
});

test('approved-looking stale client ruleset SHA fails before statutory calculation',async()=>{
  const s=fixture({gates:releaseEvidence()});
  const r=await s.request({assessmentYear:'2026-27',expectedRuleSetHash:'b'.repeat(64)});
  assert.equal(r.status,409);
  assert.equal(r.body.code,'STALE_RULESET_REVISION');
  assert.equal(s.calls.rpc,0);
});

test('unapproved parameter revision fails closed without invoking tax SQL',async()=>{
  const s=fixture({gates:releaseEvidence()});
  const r=await s.request({assessmentYear:'2026-27',expectedParameterRevision:999});
  assert.equal(r.status,409);
  assert.equal(r.body.code,'UNAPPROVED_PARAMETER_REVISION');
  assert.equal(s.calls.rpc,0);
});

test('legal source cutoff mismatch rejects verified-year flag',async()=>{
  const s=fixture({gates:releaseEvidence()});
  const r=await s.request({assessmentYear:'2026-27',expectedSourceCutoff:'2026-01-01'});
  assert.equal(r.status,409);
  assert.equal(r.body.code,'LEGAL_EVENT_CUTOFF_UNVERIFIED');
  assert.equal(s.calls.rpc,0);
});

test('effective event date after legal source cutoff rejects all amounts',async()=>{
  const s=fixture({gates:releaseEvidence()});
  const r=await s.request({assessmentYear:'2026-27',legalEventDate:'2026-10-01'});
  assert.equal(r.status,409);
  assert.equal(r.body.code,'LEGAL_EVENT_CUTOFF_UNVERIFIED');
  assert.equal(s.calls.rpc,0);
});

test('missing atomic replay reservation SQL blocks before any tax rule read',async()=>{
  const s=fixture({reservationError:{message:'RPC missing'},gates:releaseEvidence()});
  const r=await s.request({assessmentYear:'2026-27'});
  assert.equal(r.status,503);
  assert.equal(r.body.code,'REPLAY_GATE_UNAVAILABLE');
  assert.equal(s.calls.rpc,0);
  assert.equal(s.calls.log,0);
});

test('used idempotency key never runs another calculation',async()=>{
  const s=fixture({gates:releaseEvidence()});
  const first=await s.request({assessmentYear:'2026-27'});
  assert.equal(first.status,200);
  const sqlCalls=s.calls.rpc;
  s.reservationState='ALREADY_RESERVED';
  const second=await s.request({assessmentYear:'2026-27'});
  assert.equal(second.status,409);
  assert.equal(second.body.code,'REPLAY_NOT_ACCEPTED');
  assert.equal(s.calls.rpc,sqlCalls);
});

test('missing finalization SQL rejects result even after audit insert',async()=>{
  const s=fixture({gates:releaseEvidence(),finalizeError:{message:'RPC missing'},
    rpcResponse:{status:'CALCULATED',grossTax:'0',taxFreeThreshold:'0',missingFacts:[]}});
  const r=await s.request({assessmentYear:'2026-27'});
  assert.equal(r.status,503);
  assert.equal(r.body.code,'RECEIPT_FINALIZATION_UNAVAILABLE');
  assert.equal(s.calls.log,1);
});

test('same pinned synthetic request yields identical receipt, decimals and trace hash',async()=>{
  const s=fixture({gates:releaseEvidence(),
    rpcResponse:{status:'CALCULATED',grossTax:'0',taxFreeThreshold:'0',missingFacts:[]}});
  const a=await s.request({assessmentYear:'2026-27'});
  const b=await s.request({assessmentYear:'2026-27'});
  assert.equal(a.status,200);assert.equal(b.status,200);
  assert.equal(a.body.ok,true); assert.equal(a.body.individual.values.netTax,'0');
  assert.equal(a.body.receiptHash,b.body.receiptHash);
  assert.equal(a.body.inputHash,b.body.inputHash);
  assert.equal(a.body.ruleSetHash,b.body.ruleSetHash);
  assert.equal(a.body.submissionReady,false);
  assert.equal(s.finalizeCalls,2); // synthetic replay gate permits both; real WS02 must reject duplicate
});

test('missing versioned request is a typed error not a tax result',async()=>{
  const s=fixture();
  const r=await s.request({assessmentYear:'2026-27',contractVersion:'DEPRECATED'});
  assert.equal(r.status,422);assert.equal(r.body.code,'VERSIONED_CONTRACT_REQUIRED');
  assert.equal(s.ownershipCalls,0);assert.equal(s.calls.rpc,0);
});

test('over-precise monetary input cannot be silently truncated',async()=>{
  const s=fixture();
  const r=await s.request({assessmentYear:'2026-27',returnData:{incomeHeads:{employment:'1.00000000001'}}});
  assert.equal(r.status,422);
  assert.equal(s.ownershipCalls,0);assert.equal(s.calls.rpc,0);
});

test('nonresident scope is denied until verified law and treaty resolver exists',async()=>{
  const s=fixture({gates:releaseEvidence()});
  const r=await s.request({assessmentYear:'2026-27',taxpayer:{entityType:'individual',residency:'nonresident'}});
  assert.equal(r.status,409);assert.equal(r.body.code,'UNSUPPORTED_RESIDENCY_SCOPE');
  assert.equal(s.calls.rpc,0);assert.equal(s.ownershipCalls,0);
});

test('unclassified business income cannot inherit individual employment schedule',async()=>{
  const s=fixture({gates:releaseEvidence()});
  const r=await s.request({assessmentYear:'2026-27',returnData:{incomeHeads:{businessProfession:'100000'}}});
  assert.equal(r.status,409);assert.equal(r.body.code,'INDUSTRY_CLASSIFICATION_REQUIRED');
  assert.equal(s.calls.rpc,0);assert.equal(s.ownershipCalls,0);
});

test('binary float money is rejected before privileged SQL',async()=>{
  const s=fixture();
  const r=await s.request({assessmentYear:'2026-27',returnData:{incomeHeads:{employment:0.1}}});
  assert.equal(r.status,422);assert.equal(s.calls.rpc,0);
});

test('missing approved legal effective period prevents executable rule even with synthetic PASS gate',async()=>{
  const s=syntheticRateCase('10%');
  s.gates[0].evidence_detail.rule_verifications[SPECIAL_RULE_KEY].effective_from='2026-08-01';
  const r=await s.request({assessmentYear:'2026-27',legalEventDate:'2026-07-01',ruleFacts:{[SPECIAL_RULE_KEY]:{baseAmount:'100'}}});
  assert.equal(r.status,409);assert.equal(r.body.unverifiedCount,1);assert.equal(s.calls.rpc,0);
});

test('source-listed savings conflict fails closed without guessing amendment',async()=>{
  const s=syntheticRateCase('10%');
  s.gates[0].evidence_detail.rule_verifications[SPECIAL_RULE_KEY].savings_unresolved=true;
  const r=await s.request({assessmentYear:'2026-27',ruleFacts:{[SPECIAL_RULE_KEY]:{baseAmount:'100'}}});
  assert.equal(r.status,409);assert.equal(r.body.unverifiedCount,1);assert.equal(s.calls.rpc,0);
});

test('SQL reply identifies selected revision, parameter hash and explicit truncation policy',async()=>{
  const s=fixture({gates:releaseEvidence(),rpcResponse:{status:'CALCULATED',grossTax:'0',taxFreeThreshold:'0',missingFacts:[]}});
  // Override internal returned parameter metadata to simulate an unapproved SQL version.
  s.rpcResponse={status:'CALCULATED',grossTax:'0',taxFreeThreshold:'0',missingFacts:[]};
  const good=await s.request({assessmentYear:'2026-27'});
  assert.equal(good.body.status,'CALCULATED');
  assert.equal(good.body.parameterSetHash.length,64);
  assert.equal(good.body.roundingPolicy,'FIXED_DECIMAL_10_TRUNCATE_TOWARD_ZERO');
});

test('SQL-reported wrong revision cannot impersonate an approved calculation',async()=>{
  const s=fixture({gates:releaseEvidence(),rpcResponse:{status:'CALCULATED',grossTax:'100',taxFreeThreshold:'0',missingFacts:[]},
    rpcIntegrityOverride:{parameter_revision:999}});
  const r=await s.request({assessmentYear:'2026-27'});
  assert.equal(r.status,409);assert.equal(r.body.code,'UNPINNED_SQL_CALCULATION');
  assert.equal(s.calls.log,0);
});

test('SQL-reported wrong ruleset hash cannot impersonate matching fiscal-year schedule',async()=>{
  const s=fixture({gates:releaseEvidence(),rpcResponse:{status:'CALCULATED',grossTax:'100',taxFreeThreshold:'0',missingFacts:[]},
    rpcIntegrityOverride:{rule_set_hash:'wrong'}});
  const r=await s.request({assessmentYear:'2026-27'});
  assert.equal(r.status,409);assert.equal(r.body.code,'UNPINNED_SQL_CALCULATION');
  assert.equal(s.calls.log,0);
});

test('SQL rounding-policy mismatch blocks without accepting plausible tax amount',async()=>{
  const s=fixture({gates:releaseEvidence(),rpcResponse:{status:'CALCULATED',grossTax:'100',taxFreeThreshold:'0',missingFacts:[]},
    rpcIntegrityOverride:{rounding_policy:'UNVERIFIED'}});
  const r=await s.request({assessmentYear:'2026-27'});
  assert.equal(r.status,409);assert.equal(r.body.code,'UNPINNED_SQL_CALCULATION');
  assert.equal(s.calls.log,0);
});

test('caller-selected branch from multi-option legal rates is never sufficient',async()=>{
  const s=syntheticRateCase({standard:'0.1',special:'0.15'});
  const r=await s.request({assessmentYear:'2026-27',ruleFacts:{[SPECIAL_RULE_KEY]:{baseAmount:'100',rateOptionKey:'special'}}});
  const rule=r.body.rules.find(x=>x.ruleId===SPECIAL_RULE_KEY);
  assert.equal(rule.state,'FAIL_CLOSED');assert.equal(rule.amount,undefined);
  assert.equal(r.body.ok,false);
});

test('numeric JSON base tax is not a valid versioned SQL decimal-string response',async()=>{
  const s=fixture({gates:releaseEvidence(),rpcResponse:{status:'CALCULATED',grossTax:20,taxFreeThreshold:'0',missingFacts:[]}});
  const r=await s.request({assessmentYear:'2026-27'});
  assert.equal(r.body.status,'FAIL_CLOSED');assert.equal(r.body.individual.values,undefined);
});
