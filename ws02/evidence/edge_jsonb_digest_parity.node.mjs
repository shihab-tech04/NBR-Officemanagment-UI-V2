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


// Versioned, review-only alternative: transfer the EXACT Edge canonical UTF-8
// text alongside its SHA-256 and the JSONB value. PostgreSQL independently
// verifies byte digest AND decoded JSONB semantic equality, without pretending
// that jsonb::text reproduces JS number formatting or UTF-16 key ordering.
// This is NOT a production authorization boundary: arbitrary callers can
// recompute hashes; only a separately verified signed-owner gate could permit
// use. The existing private atomic RPC is deliberately unchanged.
const ENVELOPE_VERSION = "NBR_EDGE_CANONICAL_JSON_UTF8_SHA256_V1_REVIEW";
const envelopeSql = [
  "BEGIN;",
  "CREATE FUNCTION pg_temp.ws02_verify_edge_envelope(",
  "  p_trace jsonb, p_bytes text, p_sha text, p_version text)",
  "RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER",
  "SET search_path=pg_catalog AS $envelope$",
  "DECLARE parsed jsonb;",
  "BEGIN",
  " IF p_trace IS NULL OR pg_catalog.jsonb_typeof(p_trace) IS DISTINCT FROM 'object'",
  "    OR p_bytes IS NULL OR p_sha IS NULL",
  "    OR p_version IS DISTINCT FROM 'NBR_EDGE_CANONICAL_JSON_UTF8_SHA256_V1_REVIEW'",
  "    OR p_sha !~ '^[0-9a-f]{64}$'",
  "    OR pg_catalog.octet_length(p_bytes) > 262144 THEN RETURN false; END IF;",
  " IF p_sha IS DISTINCT FROM pg_catalog.encode(",
  "   pg_catalog.sha256(pg_catalog.convert_to(p_bytes,'UTF8')),'hex')",
  " THEN RETURN false; END IF;",
  " parsed := p_bytes::jsonb;",
  " RETURN parsed = p_trace;",
  "EXCEPTION WHEN OTHERS THEN RETURN false;",
  "END $envelope$;",
].join("\n");
const sqlLiteral = (s) => "'" + s.replaceAll("'", "''") + "'";
function verifyEnvelope(raw, bytes, claimedSha, version) {
  // Only synthetic, local fixtures are interpolated; no untrusted input.
  const sql = envelopeSql + "\nSELECT CASE WHEN pg_temp.ws02_verify_edge_envelope(" +
    sqlLiteral(raw) + "::jsonb," + sqlLiteral(bytes) + "," +
    sqlLiteral(claimedSha) + "," + sqlLiteral(version) +
    ") THEN 'WS02_ENVELOPE_ACCEPT' ELSE 'WS02_ENVELOPE_DENY' END;\nROLLBACK;\n";
  const r = spawnSync("psql", ["-X", "-Atq", "-v", "ON_ERROR_STOP=1"], {
    input: sql, encoding: "utf8", timeout: 20000,
  });
  assert.equal(r.status, 0, "PG17 envelope query failed: " + r.stderr);
  const result = r.stdout.trim().split("\n").find((line) =>
    line === "WS02_ENVELOPE_ACCEPT" || line === "WS02_ENVELOPE_DENY");
  assert.ok(result, "PG17 envelope result missing: " + r.stdout);
  return result === "WS02_ENVELOPE_ACCEPT";
}
const versionedFixtures = [
  {
    name: "full_json_types_numeric_exponents_unicode_keys",
    trace: {
      "বাংলা": { "😀": "astral", "é": "accent", zero: -0, fraction: 0.0000001,
        big: 1e21, small: 0.1, safe_integer: 9007199254740991 },
      arrays: [null, true, false, [], {}, ["বাংলা", "emoji 😀", 1.5]],
      nested: { evidence: { sources: [{ year: 2026, rate: 2.75 }] } },
    },
  },
  {
    name: "edge_audit_shape_nested_numeric_amounts",
    trace: {
      actor_user_id: "synthetic-only", assessment_year: "2026-27",
      income_year: "2025-26", result_status: "NEEDS_FACTS",
      amounts: { gross: 100000.5, deduction: 1e-7, negative: -0 },
      rules: [{ id: "R1", inputs: [0, 1, 1e21], status: "NEEDS_FACTS" }],
      individual: { flags: [], "প্রমাণ": { "🔑": "value" } },
    },
  },
];
for (const { name, trace } of versionedFixtures) {
  const raw = JSON.stringify(trace);
  const bytes = canonical(trace); // Actual pinned WS04 canonical implementation.
  const digest = hash(bytes);
  assert.equal(verifyEnvelope(raw, bytes, digest, ENVELOPE_VERSION), true,
    name + " valid versioned semantic/digest envelope rejected");
  assert.equal(verifyEnvelope(raw, bytes, "0".repeat(64), ENVELOPE_VERSION), false,
    name + " forged digest accepted");
  assert.equal(verifyEnvelope(raw, bytes + " ", digest, ENVELOPE_VERSION), false,
    name + " mutated canonical bytes accepted");
  assert.equal(verifyEnvelope(raw, bytes, digest, "V2_UNAPPROVED"), false,
    name + " unapproved encoding version accepted");
  assert.equal(verifyEnvelope(JSON.stringify({ ...trace, injected: true }),
    bytes, digest, ENVELOPE_VERSION), false,
    name + " JSONB semantic mismatch accepted");
}
const malformedBytes = '{"nested":{"missing":undefined}}';
assert.equal(verifyEnvelope("{}", malformedBytes, hash(malformedBytes),
  ENVELOPE_VERSION), false, "invalid canonical JSON accepted");
const invalidSurrogate = '{"key":"\\ud800"}';
assert.equal(verifyEnvelope("{}", invalidSurrogate, hash(invalidSurrogate),
  ENVELOPE_VERSION), false, "PostgreSQL-unrepresentable surrogate accepted");
assert.equal(verifyEnvelope("[]", "[]", hash("[]"), ENVELOPE_VERSION),
  false, "non-object auditTrace accepted");

// This candidate intentionally does NOT prove a canonical-string uniqueness
// check inside PostgreSQL: alternate JSON encodings can hash and decode to the
// same JSONB. A trusted Edge producer, authenticated ownership, strict RPC
// privileges and review of numeric/surrogate semantics remain required.
console.log("PASS_SCOPED_VERSIONED_EDGE_BYTES_PG17_SEMANTIC_BINDING_ONLY");
console.log("HOLD: No PostgreSQL canonical uniqueness proof, no private RPC enforcement, no hosted Auth/ownership, no tax certification.");


// WS00-ACC-162 candidate: independently demonstrate the security distinction
// between PostgreSQL semantic JSONB equality and an EXACT pinned Edge encoding.
// A digest over caller-controlled bytes is NOT a canonicality proof or Auth.
// This producer-side preflight is isolated test code, not a deployed guard.
function pinnedEdgeEncodingPreflight(bytes, digest, version) {
  if (typeof bytes !== "string" || typeof digest !== "string" ||
      version !== ENVELOPE_VERSION ||
      Buffer.byteLength(bytes, "utf8") > 262144 ||
      !/^[0-9a-f]{64}$/.test(digest)) return false;
  try {
    const parsed = JSON.parse(bytes);
    return parsed !== null && typeof parsed === "object" &&
      !Array.isArray(parsed) && canonical(parsed) === bytes &&
      hash(bytes) === digest;
  } catch {
    return false;
  }
}
for (const { name, trace } of versionedFixtures) {
  const bytes = canonical(trace);
  assert.equal(pinnedEdgeEncodingPreflight(bytes, hash(bytes), ENVELOPE_VERSION),
    true, name + " pinned Edge encoding preflight rejected valid fixture");
  assert.equal(pinnedEdgeEncodingPreflight(bytes, "f".repeat(64), ENVELOPE_VERSION),
    false, name + " preflight accepted forged digest");
  assert.equal(pinnedEdgeEncodingPreflight(bytes, hash(bytes), "V2_UNAPPROVED"),
    false, name + " preflight accepted wrong version");
}

// Each noncanonical byte string parses into the same JSONB as the canonical
// counterpart, so the current PG envelope ACCEPTS it when the caller
// recomputes the digest. The pinned Edge preflight MUST reject it. This
// deliberately records a known candidate limitation rather than claiming a
// PostgreSQL-only canonicality fix.
const encodingDrifts = [
  { name: "reordered_keys", bytes: '{"z":1,"a":2}' },
  { name: "insignificant_whitespace", bytes: '{"a": 2,"z":1}' },
  { name: "unicode_escape", bytes: '{"a":"\\u09ac"}' },
  { name: "numeric_lexeme_1_point_0", bytes: '{"a":1.0}' },
  { name: "negative_zero", bytes: '{"a":-0}' },
  { name: "duplicate_json_key", bytes: '{"a":1,"a":2}' },
  { name: "trailing_whitespace", bytes: '{"a":1}\\n' },
];
for (const { name, bytes } of encodingDrifts) {
  const parsed = JSON.parse(bytes);
  const canonicalBytes = canonical(parsed);
  assert.notEqual(bytes, canonicalBytes, name + " fixture is already canonical");
  const digest = hash(bytes);
  assert.equal(verifyEnvelope(canonicalBytes, bytes, digest, ENVELOPE_VERSION),
    true, name + " expected PG semantic-only envelope acceptance not observed");
  assert.equal(pinnedEdgeEncodingPreflight(bytes, digest, ENVELOPE_VERSION),
    false, name + " noncanonical caller bytes passed pinned Edge preflight");
  assert.equal(pinnedEdgeEncodingPreflight(canonicalBytes, hash(canonicalBytes),
    ENVELOPE_VERSION), true, name + " canonical counterpart was rejected");
}
assert.equal(pinnedEdgeEncodingPreflight("[]", hash("[]"), ENVELOPE_VERSION),
  false, "array accepted as auditTrace");
assert.equal(pinnedEdgeEncodingPreflight("{bad}", hash("{bad}"), ENVELOPE_VERSION),
  false, "invalid JSON accepted by Edge preflight");
console.log("PASS_SCOPED_PINNED_EDGE_EXACT_ENCODING_PREFLIGHT_DRIFT_NEGATIVES_ONLY");
console.log("HOLD: PG semantic-only envelope still accepts recomputed noncanonical bytes; preflight is not a trusted-identity or SQL enforcement boundary.");
