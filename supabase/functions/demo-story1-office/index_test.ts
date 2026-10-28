/** In-memory Edge handler tests. Every outbound request is intercepted. */
let handler: ((request: Request) => Response | Promise<Response>) | undefined;
const denoApi = Deno as unknown as { serve: unknown };
const originalServe = denoApi.serve;
denoApi.serve = (fn: (request: Request) => Response | Promise<Response>) => { handler = fn; return {}; };
await import('./index.ts');
denoApi.serve = originalServe;

const id = 'a0000000-0000-4000-8000-000000000001';
const session = 'a0000000-0000-4000-8000-000000000002';
const source = { success: true, simulationOnly: true, data: {
  id, status: 'SIMULATED_SUCCESS', createdAt: '2026-10-28T00:00:00Z',
  data: { sessionId: session, service: 'TAX_WITH_RETURN', amountMinor: 12345,
    origin: 'QA_BROWSER', details: { payerName: 'Synthetic payer' } },
} };
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function equal(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);
}
async function exercise(options: { source?: unknown; serviceKey?: boolean; authorization?: boolean; invalidId?: boolean }) {
  const oldFetch = globalThis.fetch;
  const envNames = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_PUBLISHABLE_KEY'];
  const previous = new Map(envNames.map(name => [name, Deno.env.get(name)]));
  const calls: Array<{url: string; key: string | null; body: Record<string, unknown>}> = [];
  try {
    Deno.env.set('SUPABASE_URL', 'https://office.invalid');
    Deno.env.set('SUPABASE_ANON_KEY', 'test-anon-key');
    if (options.serviceKey === false) Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
    else Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith('https://eyqhoavnitkrajvyqvxn.supabase.co/functions/v1/demo-story1-taxpay/')) {
        return new Response(JSON.stringify(options.source ?? source), {status: 200, headers: {'content-type':'application/json'}});
      }
      if (url.startsWith('https://office.invalid/rest/v1/rpc/')) {
        calls.push({url, key: new Headers(init?.headers).get('apikey'), body: JSON.parse(String(init?.body))});
        return new Response(JSON.stringify({id, mirrored:true}), {status: 200, headers: {'content-type':'application/json'}});
      }
      throw new Error('Unexpected outbound request');
    }) as typeof fetch;
    const path = options.authorization ? '/authorization/mirror' : '/mirror';
    const incoming = options.authorization ? {id:options.invalidId ? 'invalid' : id} :
      {id:options.invalidId ? 'invalid' : id, sessionId:session, amountMinor:999999, service:'FORGED'};
    assert(handler, 'Edge handler was not registered');
    const response = await handler(new Request('https://office.invalid/demo-story1-office'+path, {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(incoming),
    }));
    return { status:response.status, body:await response.json(), calls };
  } finally {
    globalThis.fetch = oldFetch;
    for (const [name, value] of previous) value === undefined ? Deno.env.delete(name) : Deno.env.set(name, value);
  }
}

Deno.test('verified payment mirror uses only source data and the server key', async () => {
  const result = await exercise({});
  equal(result.status, 200, 'Expected a successful mirror');
  equal(result.calls.length, 1, 'Expected one database write');
  equal(result.calls[0].key, 'test-service-key', 'The writer must use the server key');
  equal(result.calls[0].body.p_input, {id, sessionId:session, service:'TAX_WITH_RETURN',
    amountMinor:12345, data:source.data.data, status:'SIMULATED_SUCCESS', createdAt:source.data.createdAt},
    'Caller-supplied payment fields must not replace source data');
});

Deno.test('mismatched source identity and missing writer credential fail closed', async () => {
  const forged = await exercise({source:{...source, data:{...source.data, id:session}}});
  equal(forged.status, 424, 'Mismatched source identity must fail');
  equal(forged.calls.length, 0, 'Mismatched source must not reach the database');
  const missing = await exercise({serviceKey:false});
  equal(missing.status, 503, 'Missing writer credential must fail');
  equal(missing.calls.length, 0, 'Missing credential must not reach the database');
  const malformed = await exercise({invalidId:true});
  equal(malformed.status, 400, 'Malformed UUID must fail');
  equal(malformed.calls.length, 0, 'Malformed UUID must not reach the database');
});

Deno.test('authorization mirror accepts only the matching source snapshot', async () => {
  const snapshot = {success:true, simulationOnly:true, data:{id,payerId:'user1',taxpayerId:'user2',status:'ACTIVE'}};
  const valid = await exercise({authorization:true,source:snapshot});
  equal(valid.status, 200, 'Expected an authorization mirror');
  equal(valid.calls.length, 1, 'Expected one authorization write');
  equal(valid.calls[0].key, 'test-service-key', 'Authorization writer must use the server key');
  equal(valid.calls[0].body.p_input, snapshot.data, 'Authorization must come from source');
  const invalid = await exercise({authorization:true,source:{...snapshot,data:{...snapshot.data,id:session}}});
  equal(invalid.status, 424, 'Mismatched authorization must fail');
  equal(invalid.calls.length, 0, 'Mismatched authorization must not reach the database');
});
