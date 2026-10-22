import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Data-shape/reproducibility only. Does NOT certify the law or authorize a rule.
const path = new URL('./ay2026_27_temporal_132_review_queue_20261022.json',import.meta.url);
const manifest = JSON.parse(readFileSync(path,'utf8'));
assert.equal(manifest.schema,'NBR_WS02_TEMPORAL_REVIEW_QUEUE_v0_1');
assert.equal(manifest.status,'REVIEW_ONLY_NOT_LEGAL_CERTIFICATION');
assert.equal(manifest.runtime_activation,false);
assert.equal(manifest.legal_status,'UNVERIFIED_APPLICABILITY');
assert.equal(manifest.baseline.rule_count,366);
assert.equal(manifest.baseline.registry_sha256,
  '34902bac07a459a4f0c051b90bfe3b4c492f2465d06c661bab18ab7f36252184');
assert.equal(manifest.baseline.originals_unchanged,true);
assert.equal(manifest.candidates.length,132);
assert.equal(manifest.counts.candidate_after_iy_end,132);
assert.deepEqual(manifest.counts.by_recorded_execution_status,{
  FACT_GATED:130,CURRENT_EXECUTABLE:1,FAIL_CLOSED:1
});
assert.equal(manifest.counts.affects_calculation,132);
assert.equal(manifest.counts.affects_submission,0);
assert.equal(new Set(manifest.candidates.map(x=>x.rule_key)).size,132);
assert.equal(new Set(manifest.candidates.map(x=>x.version_id)).size,132);
const start='2026-06-30';
for(const row of manifest.candidates){
 assert.equal(row.review_status,'OPEN_WS01_SOURCE_AND_SCOPE');
 assert.match(row.rule_key,/^[A-Za-z0-9_.-]+$/);
 assert.match(row.version_id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
 assert.ok(row.effective_from_text.slice(0,10)>start);
 assert.equal(row.canonical_source_ref,'NBR_Task07_Withholding_Atomic_Rules_CLOSED.json#rules');
 assert.equal(row.affects_calculation,true);
 assert.equal(row.affects_submission,false);
 assert.ok(['FACT_GATED','CURRENT_EXECUTABLE','FAIL_CLOSED'].includes(row.execution_status));
}
const receipt=createHash('sha256').update(JSON.stringify(manifest.candidates)).digest('hex');
console.log('PASS: 132 unique current SQL version candidates, all pending review; digest '+receipt);
console.log('NOT CERTIFIED: actual controlling law, periods, statutory source chain, Auth, Agent tests, original SQL migration.');
