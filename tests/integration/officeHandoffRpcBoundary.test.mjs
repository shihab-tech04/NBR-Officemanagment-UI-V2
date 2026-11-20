import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const src=readFileSync('supabase/functions/office-handoff-api/index.ts','utf8');
const sql=readFileSync('supabase/migrations/20261115183000_office_private_legacy_rpc.sql','utf8');

test('service-only database RPCs are never called with a browser or anon key',()=>{
  assert.ok(src.includes("function internalSyntheticKey(): string | null"));
  assert.ok(src.includes("Deno.env.get('SUPABASE_SECRET_KEYS')"));
  assert.ok(src.includes("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')"));
  assert.ok(!src.includes("Deno.env.get('SUPABASE_ANON_KEY')"));
  assert.ok(!src.includes("Deno.env.get('SUPABASE_PUBLISHABLE_KEY')"));
  assert.equal((src.match(/const key=internalSyntheticKey\(\);/g)||[]).length,2);
});
test('only named synthetic RPCs may be called from public handoff',()=>{
  for(const name of ['office_v1_handoff_query','office_v1_handoff_status_history','office_v1_handoff_set_status']) {
    assert.ok(src.includes("'" + name + "'"),name);
    assert.ok(sql.includes("REVOKE ALL ON FUNCTION public."+name),name);
  }
  assert.ok(src.includes("const source=matchRoute("));
  assert.ok(src.includes("const matched=matchRoute(url.pathname)"));
  assert.ok(src.includes("p_sample_id:actionPath.sampleId"));
});
test('Taxpayer host selection is allowlisted and original remains default',()=>{
  assert.ok(src.includes("Deno.env.get('TAXPAY_PRIMARY_URL') || 'https://eyqhoavnitkrajvyqvxn.supabase.co'"));
  assert.ok(src.includes("'https://gmuhitmaynfhipcvbvkh.supabase.co'"));
  assert.ok(src.includes("if (!TAXPAY_HANDOFF) return respond("));
});
test('Direct SQL grants are removed for anon and authenticated but retained for server integration',()=>{
  for(const sig of [
    'office_v1_handoff_query(text,integer,integer,jsonb)',
    'office_v1_handoff_status_history(text,text,integer)',
    'office_v1_handoff_set_status(text,text,text,text,text,uuid,integer)'
  ]) {
    assert.ok(sql.includes("public."+sig));
    assert.ok(sql.includes("REVOKE ALL ON FUNCTION public."+sig));
    assert.ok(sql.includes("GRANT EXECUTE ON FUNCTION public."+sig));
  }
});
