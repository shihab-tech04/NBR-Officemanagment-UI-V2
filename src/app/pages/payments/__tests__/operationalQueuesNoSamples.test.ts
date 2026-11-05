import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const office=readFileSync(resolve(process.cwd(),'src/app/pages/payments/PaymentModulePage.tsx'),'utf8');
const paymentReference=readFileSync(resolve(process.cwd(),'src/app/pages/payments/paymentReference.ts'),'utf8');

describe('Office operational queues never present illustrative fixtures as financial cases',()=>{
  it('excludes reference correction cases from the active officer queue',()=>{
    expect(office).toContain('const corrRows=[...localRecords.corrections,...officeCorrectionRows];');
    expect(office).not.toContain('referenceCorrections.map(');
    expect(office).not.toContain('Decided (illustrative)');
  });
  it('excludes example offline liability changes from the current financial event register',()=>{
    expect(office).toContain("const offlineRows=[...localRecords['offline-events']];");
    expect(office).not.toContain('referenceOffline.map(');
  });
  it('preserves connected correction review actions and the local draft flow',()=>{
    expect(office).toContain('officeCorrectionRows');
    expect(office).toContain('submitOfficeCorrectionDecision(');
    expect(office).toContain('moduleDrafts[draftKind]');
    expect(office).toContain('setLocalRecords({...moduleDrafts})');
  });
  it('makes explicit that local drafts are not submitted to SQL or the taxpayer portal',()=>{
    expect(office).toContain('Drafts are not submitted to SQL or the taxpayer portal.');
    expect(office).toContain('Only unsubmitted drafts from this session are listed.');
    expect(office).toContain('No connected incident register is available');
  });
  it('keeps original fixtures available for isolated tests without rendering them as live operational rows',()=>{
    expect(paymentReference).toContain('referenceCorrections');
    expect(paymentReference).toContain('referenceOffline');
  });
  it('populates assessment-year choices from the connected payment records, not reference-case years',()=>{
    expect(office).toContain("storyRows.flatMap(row=>String(row.assessment_year??'').split(',')");
    expect(office).not.toContain('referenceOffline.map(e=>e.ay)');
  });
});
