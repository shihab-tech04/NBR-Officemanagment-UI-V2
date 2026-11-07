#!/usr/bin/env node
/** UX/UI v8.2 screenshot ledger integrity gate.
 * This script DOES NOT interpret images or certify perceptual completeness.
 * Review the full images and actual rendered UI independently.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const imageRoles = new Set(['APPROVED_TARGET','CURRENT_DEFECT','CONTENT_REQUIREMENT','STYLE_REFERENCE','STATE_VARIANT','UNKNOWN']);
const statuses = new Set(['PASS','FAIL','PARTIAL','CONFLICT','BLOCKED','NOT_VERIFIED','OUT_OF_SCOPE']);
const intents = new Set(['PRESERVE_INFORMATION','CORRECT_DEFECT','CHANGE_APPROVED','REMOVE_APPROVED','RECONCILE','OUT_OF_SCOPE']);
const isText = value => typeof value === 'string' && value.trim().length > 0;
const approvedReview = review => review?.status === 'PASS' && isText(review.reviewer) && isText(review.evidence);

export function checkScreenshotLedger(doc) {
  const problems=[];
  const fail=(code,message)=>problems.push({code,message});
  if (!doc || doc.schema !== 'screenshot-fidelity/1') {
    fail('SCHEMA','Expected screenshot-fidelity/1');
    return {status:'NOT_ACCEPTED',problems,observations:0,verified:0};
  }
  if (!isText(doc.project)) fail('PROJECT','Project must be identified');
  if (!Array.isArray(doc.images) || !doc.images.length) fail('IMAGES','No source screenshots indexed');
  if (!Array.isArray(doc.observations) || !doc.observations.length) fail('OBS','No observed screenshot information has been inventoried');

  const imageIds = new Set();
  for (const im of doc.images??[]) {
    if (!isText(im.id) || imageIds.has(im.id)) fail('IMAGE_ID',`Duplicate/empty screenshot ID ${im.id}`);
    imageIds.add(im.id);
    if (!isText(im.ref)) fail('IMAGE_REF',`Missing source reference for ${im.id}`);
    if (!imageRoles.has(im.role) || im.role === 'UNKNOWN') fail('IMAGE_ROLE',`Unresolved screenshot role ${im.id}`);
    if (!isText(im.state)) fail('IMAGE_STATE',`Missing screenshot scroll/open-state for ${im.id}`);
    if (!approvedReview(im.full_image_second_pass)) fail('SF02',`No independently evidenced full-image second pass for ${im.id}`);
    if (!Array.isArray(im.unreadable_regions)) fail('UNREADABLE',`Unreadable areas must be inventoried for ${im.id}`);
    else if (im.unreadable_regions.length) fail('UNREADABLE',`Unresolved/unreadable regions in ${im.id}`);
  }

  let verified=0;
  const ids=new Set(), coveredImages = new Set();
  for(const obs of doc.observations??[]) {
    if(!isText(obs.id)||ids.has(obs.id)) fail('OBS_ID',`Duplicate/empty observation ID ${obs.id}`);
    ids.add(obs.id);
    if (!isText(obs.observed) || !isText(obs.kind)) fail('OBS_CONTENT',`Incomplete semantic extraction ${obs.id}`);
    if (!intents.has(obs.intent) || obs.intent === 'RECONCILE') fail('OBS_INTENT',`Unresolved intent for ${obs.id}`);
    if(!Array.isArray(obs.image_ids)||obs.image_ids.length===0) fail('OBS_SOURCE',`Observation ${obs.id} has no screenshot source`);
    for(const image of obs.image_ids??[]) {
      if(!imageIds.has(image)) fail('OBS_REF',`Unknown image ${image} in ${obs.id}`);
      else coveredImages.add(image);
    }
    if(obs.intent==='OUT_OF_SCOPE') {
      if(!isText(obs.approved_exclusion)) fail('OUT_OF_SCOPE',`Observation ${obs.id} excluded without approval`);
      continue;
    }
    if (!isText(obs.target?.route) || !isText(obs.target?.component_or_source)) fail('SF03',`No target field/component mapping for ${obs.id}`);
    if(!statuses.has(obs.verification?.status)||obs.verification.status!=='PASS') fail('SF04',`Observation ${obs.id} not verified`);
    else if (!isText(obs.verification.dom_or_function_evidence) || !isText(obs.verification.visual_evidence)) fail('EVIDENCE',`Insufficient implementation/visual evidence for ${obs.id}`);
    else verified++;
  }
  for(const image of imageIds) if(!coveredImages.has(image)) fail('IMAGE_UNMAPPED',`No observation from screenshot ${image}`);
  if(!Array.isArray(doc.unrequested_ui_changes)) fail('SCOPE','Missing unrequested UI change inventory');
  else for(const entry of doc.unrequested_ui_changes) if(entry.present!=='NO') fail('SF05',`Unresolved/forbidden UI change ${entry.id||entry.forbidden||'?'}: ${entry.present||'not checked'}`);
  if (!approvedReview(doc.approved_visual_comparison)||!isText(doc.approved_visual_comparison.baseline_ref)||!isText(doc.approved_visual_comparison.actual_ref))
    fail('SF06','Approved, matched-state baseline versus rendered UI was not independently reviewed');
  if (!approvedReview(doc.acceptance)) fail('SF08','Missing independently evidenced final screenshot information acceptance');
  return {status:problems.length?'NOT_ACCEPTED':'LEDGER_EVIDENCE_COMPLETE_NOT_AUTOMATIC_IMAGE_PROOF',problems,observations:doc.observations?.length||0,verified};
}

export function sampleEvidenceComplete() {
  return {
    schema:'screenshot-fidelity/1',project:'Synthetic QA fixture — NOT a real production approval',
    images:[{id:'screen-a',ref:'approved-screenshot-fixture.png',role:'APPROVED_TARGET',state:'desktop default',unreadable_regions:[],full_image_second_pass:{status:'PASS',reviewer:'independent-qa-fixture',evidence:'review-fixture'}}],
    observations:[{id:'FIELD-1',image_ids:['screen-a'],kind:'field',observed:'Tax year',intent:'PRESERVE_INFORMATION',target:{route:'/sample',component_or_source:'Sample.tsx'},verification:{status:'PASS',dom_or_function_evidence:'dom-fixture',visual_evidence:'image-diff-fixture'}}],
    unrequested_ui_changes:[],approved_visual_comparison:{status:'PASS',reviewer:'independent-qa-fixture',evidence:'visual-review-fixture',baseline_ref:'approved-screenshot-fixture.png',actual_ref:'actual-fixture.png'},
    acceptance:{status:'PASS',reviewer:'independent-qa-fixture',evidence:'signoff-fixture'}
  };
}

function selfTest() {
  let d=sampleEvidenceComplete();
  assert.equal(checkScreenshotLedger(d).problems.length,0);
  d=structuredClone(d); d.observations=[];
  assert.ok(checkScreenshotLedger(d).problems.some(x=>x.code==='OBS'));
  d=sampleEvidenceComplete();d.images[0].role='UNKNOWN';
  assert.ok(checkScreenshotLedger(d).problems.some(x=>x.code==='IMAGE_ROLE'));
  d=sampleEvidenceComplete();d.observations[0].verification.status='NOT_VERIFIED';
  assert.ok(checkScreenshotLedger(d).problems.some(x=>x.code==='SF04'));
  d=sampleEvidenceComplete();d.unrequested_ui_changes=[{id:'REMOVE-LAST',present:'YES'}];
  assert.ok(checkScreenshotLedger(d).problems.some(x=>x.code==='SF05'));
  d=sampleEvidenceComplete();d.images[0].full_image_second_pass.status='NOT_VERIFIED';
  assert.ok(checkScreenshotLedger(d).problems.some(x=>x.code==='SF02'));
  d=sampleEvidenceComplete();d.approved_visual_comparison.baseline_ref='';
  assert.ok(checkScreenshotLedger(d).problems.some(x=>x.code==='SF06'));
  console.log('PASS: 7 synthetic ledger checks; missing observations, role, evidence, unrequested UI and baselines correctly rejected.');
  console.log('LIMIT: This does not read/compare images, authenticate reviewers or prove human approval.');
}

if(process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href){
  const mode=process.argv[2]??'--help';
  if(mode==='--self-test'){selfTest();}
  else if (['--audit','--release'].includes(mode)){
    const f=process.argv[3]; if(!f){console.error('Usage: node screenshot-fidelity-gate.mjs --audit|--release path/to/manifest.json');process.exit(2);}
    const d=JSON.parse(fs.readFileSync(f,'utf8'));const result=checkScreenshotLedger(d);
    console.log(JSON.stringify(result,null,2));
    console.log('LIMIT: This only checks declared observations/evidence, not whether the image was completely understood.');
    if(mode==='--release' && result.problems.length)process.exitCode=2;
  } else {console.log('Usage: --self-test | --audit manifest.json | --release manifest.json');}
}