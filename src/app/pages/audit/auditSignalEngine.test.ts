import { describe, it, expect } from 'vitest';
import { ALL_TAXPAYER_ROWS } from './auditData';
import { AUDIT_SIGNAL_IDS, evaluateAuditSignals, makeAuditProfile } from './auditSignalEngine';
const codes = (value: unknown) => String(value ?? '').match(/R-[A-E]\d/g) ?? [];
describe('Financial Audit screening', () => {
 it('keeps 70 unique taxpayer returns, including original 36', () => {
   expect(ALL_TAXPAYER_ROWS).toHaveLength(70);
   expect(new Set(ALL_TAXPAYER_ROWS.map(r => r.return_id)).size).toBe(70);
   expect(ALL_TAXPAYER_ROWS.slice(0,36).map(r => r.id)).toEqual(Array.from({length:36},(_,i)=>'P'+(i+1)));
 });
 it('evaluates all fifteen substantive signal codes from financial fields', () => {
   const covered = new Set(ALL_TAXPAYER_ROWS.flatMap(r => codes(r.signals)));
   expect([...covered].sort()).toEqual([...AUDIT_SIGNAL_IDS].sort());
   for(const r of ALL_TAXPAYER_ROWS) {
     if(r.data_quality !== 'Complete') continue;
     expect(evaluateAuditSignals(JSON.parse(String(r.financial_inputs)))).toEqual(codes(r.signals));
   }
 });
 it('contains ten complete returns with no calculated signal', () => {
   const clear = ALL_TAXPAYER_ROWS.filter(r => r.data_quality==='Complete' && codes(r.signals).length===0);
   expect(clear.length).toBeGreaterThanOrEqual(10);
   for(const r of clear) expect(evaluateAuditSignals(JSON.parse(String(r.financial_inputs)))).toEqual([]);
 });
 it('reconciles changed assets against closing wealth inputs', () => {
   const f = makeAuditProfile([],8);
   expect(evaluateAuditSignals(f)).toEqual([]);
   expect(evaluateAuditSignals({...f,assets:f.assets+800000})).toContain('R-C1');
   expect(evaluateAuditSignals({...f,payableTax:0})).toContain('R-A2');
 });
});