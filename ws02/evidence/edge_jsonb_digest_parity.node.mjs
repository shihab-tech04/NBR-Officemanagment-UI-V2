// Review-only WS02 <-> pinned WS04 cross-runtime digest experiment.
// Never deploy: deliberately rejects JSONB numbers and non-ASCII object keys.
// No taxpayer data, hosted SQL, Supabase Auth, or certified canonical format.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

const source = readFileSync(
  "ws04-reviewed-source/ws04/w5-candidate/supabase/functions/nbr-tax-engine/index.ts", "utf8"
);
const marker = "function canonical(value: unknown): string {";
const begin = source.indexOf(marker);
assert.ok(begin >= 0, "PINNED_WS04_CANONICAL_NOT_FOUND");
const end = source.indexOf("\n}\n", begin);
assert.ok(end > begin, "PINNED_WS04_CANONICAL_END_NOT_FOUND");
const typescript = source.slice(begin, end + 2);
const javascript = typescript
  .replace("value: unknown): string", "value)")
  .replace(" as Record<string, unknown>", "");
assert.ok(!javascript.includes("unknown") && !javascript.includes("Record<"),
  "PINNED_WS04_CANONICAL_TRANSFORM_CHANGED");
const canonical = vm.runInNewContext("(" + javascript + ")");
const hash = (s) => createHash("sha256").update(s, "utf8").digest("hex");

// Candidate is a deliberately restricted subset, NOT a drop-in W5 trace hash.
// ASCII keys make PostgreSQL C-order and JS UTF-16 key order agree. JSONB
// numbers are forbidden because JSONB preserves 1.0 where JS parses it as 1.
// All SQL runs in a single disposable PG17 transaction and rolls back.
const candidateFunction = String.raw`
BEGIN;
CREATE FUNCTION pg_temp.ws02_canonical_subset(v jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path=pg_catalog AS $canonical$
DECLARE kind text; out_text text;
BEGIN
  kind := pg_catalog.jsonb_typeof(v);
  IF kind='number' THEN
    RAISE EXCEPTION 'WS02_UNSUPPORTED_JSONB_NUMBER';
  ELSIF kind='object' THEN
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(v) AS k(key)
      WHERE k.key !~ '^[A-Za-z0-9_]+$'
    ) THEN
      RAISE EXCEPTION 'WS02_UNSUPPORTED_NONASCII_OBJECT_KEY';
    END IF;
    SELECT '{' || coalesce(
      pg_catalog.string_agg(pg_catalog.to_jsonb(k.key)::text || ':' ||
        pg_temp.ws02_canonical_subset(k.value), ',' ORDER BY k.key COLLATE "C"),
      '') || '}' INTO out_text
    FROM pg_catalog.jsonb_each(v) AS k(key,value);
    RETURN out_text;
  ELSIF kind='array' THEN
    SELECT '[' || coalesce(
      pg_catalog.string_agg(pg_temp.ws02_canonical_subset(a.value),
        ',' ORDER BY a.ord), '') || ']' INTO out_text
    FROM pg_catalog.jsonb_array_elements(v) WITH ORDINALITY AS a(value,ord);
    RETURN out_text;
  END IF;
  RETURN v::text;
END $canonical$;
`;

function postgres(raw) {
  // Fixture-only SQL literal; never interpolate external or taxpayer input.
  const quoted = "'" + raw.replaceAll("'", "''") + "'";
  const sql = candidateFunction + String.raw`
SELECT
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_temp.ws02_canonical_subset(${quoted}::jsonb), 'UTF8')), 'hex')
  || '|' ||
  pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    (${quoted}::jsonb)::text, 'UTF8')), 'hex');
ROLLBACK;
`;
  return spawnSync("psql", ["-X", "-Atq", "-v", "ON_ERROR_STOP=1"], {
    input: sql, encoding: "utf8", timeout: 20000,
  });
}

const positive = [
  { name: "nested_unicode_value", raw: JSON.stringify({
    actor_user_id: "synthetic", evidence: {
      refs: ["SRO", "বাংলা"], metadata: { flags: [], locale: "বাংলা" },
    }, review: { status: "NEEDS_FACTS" }, empty: {}, nullable: null, valid: true,
  }) },
  { name: "escaped_values_and_arrays", raw: JSON.stringify({
    nested: [{ text: 'line\n"quoted"\t😀' }, { ok: false }],
    arrays: [[], ["a", "b"]], description: "বাংলা",
  }) },
];
for (const { name, raw } of positive) {
  const r = postgres(raw);
  assert.equal(r.status, 0, name + " PG17 failed: " + r.stderr);
  const line = r.stdout.trim().split("\n").find((s) => /^[a-f0-9]{64}\|[a-f0-9]{64}$/.test(s));
  assert.ok(line, name + " missing digest pair: " + r.stdout);
  const [subsetDigest, rawJsonbDigest] = line.split("|");
  const edgeDigest = hash(canonical(JSON.parse(raw)));
  assert.equal(subsetDigest, edgeDigest, name + " candidate mismatch");
  assert.notEqual(rawJsonbDigest, edgeDigest,
    name + " expected existing JSONB::text / W5 canonical divergence");
}

const rejected = [
  { name: "number", raw: '{"numeric":1.0}', code: "WS02_UNSUPPORTED_JSONB_NUMBER" },
  { name: "nested_number", raw: '{"nested":[{"value":42}]}', code: "WS02_UNSUPPORTED_JSONB_NUMBER" },
  { name: "astral_key", raw: '{"😀":"emoji"}', code: "WS02_UNSUPPORTED_NONASCII_OBJECT_KEY" },
  { name: "bangla_key", raw: '{"nested":{"বাংলা":"text"}}',
    code: "WS02_UNSUPPORTED_NONASCII_OBJECT_KEY" },
];
for (const { name, raw, code } of rejected) {
  const r = postgres(raw);
  assert.notEqual(r.status, 0, name + " unexpectedly accepted");
  assert.ok(r.stderr.includes(code), name + " unexpected PG17 error: " + r.stderr);
}

console.log("PASS_SCOPED_WS04_EDGE_PG17_CANONICAL_SAFE_SUBSET_AND_UNSAFE_DENIAL_ONLY");
console.log("HOLD: W5 auditTrace numeric shapes, arbitrary keys, signed Auth, ownership and full JSONB parity unapproved.");
