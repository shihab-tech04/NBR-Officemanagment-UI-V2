import {describe,expect,it} from 'vitest';
import {demoTransactions,demoUserIds,validateDemoTransaction,transactionTotalMinor,
  getDemoUserTransactions,getDemoUserAllocations,appendValidatedDemoTransaction,demoCoverage} from '../paymentScenarioModel';
describe('synthetic multi-beneficiary transaction contract',()=>{
 it('covers all eight structural self/other and mix classes',()=>{
   expect(Object.values(demoCoverage()).every(Boolean)).toBe(true);
 });
 it('has seeded beneficiary activity for users 1-5 and none for users 6-10',()=>{
   for(const id of demoUserIds.slice(0,5)) expect(getDemoUserAllocations(id).length).toBeGreaterThan(0);
   for(const id of demoUserIds.slice(5)) {
     expect(getDemoUserAllocations(id)).toHaveLength(0);
     expect(getDemoUserTransactions(id,demoTransactions,'payer')).toHaveLength(0);
   }
 });
 it('preserves header totals and has unique item/event identifiers',()=>{
   const txIds=new Set<string>(),lineIds=new Set<string>(),eventIds=new Set<string>();
   for(const tx of demoTransactions){
     expect(validateDemoTransaction(tx)).toEqual([]);
     expect(txIds.has(tx.id)).toBe(false);txIds.add(tx.id);
     expect(transactionTotalMinor(tx)).toBe(tx.allocations.reduce((n,a)=>n+a.amountMinor,0));
     for(const a of tx.allocations){expect(lineIds.has(a.id)).toBe(false);lineIds.add(a.id);}
     for(const e of tx.events){expect(eventIds.has(e.id)).toBe(false);eventIds.add(e.id);}
     expect(tx.simulationOnly).toBe(true);
   }
 });
 it('records payer and beneficiary separately (not an automatic credit)',()=>{
   const tx=demoTransactions.find(t=>t.id==='DEMO-TX-005')!;
   expect(tx.payer).toBe('user4');
   expect(new Set(tx.allocations.map(a=>a.beneficiary))).toEqual(new Set(['user4','user1','user5']));
   expect(tx.allocations.reduce((n,a)=>n+a.amountMinor,0)).toBe(1140000);
   expect(getDemoUserTransactions('user1',demoTransactions,'payer').some(t=>t.id===tx.id)).toBe(false);
   expect(getDemoUserAllocations('user1').some(row=>row.transaction.id===tx.id)).toBe(true);
 });
 it('adds activity to an initially empty beneficiary without mutation of original history',()=>{
   const extra={...demoTransactions[0],id:'DEMO-TX-010',allocations:[{...demoTransactions[0].allocations[0],id:'DEMO-L-017',beneficiary:'user6' as const}],events:demoTransactions[0].events.map((e,i)=>({...e,id:'DEMO-TX-010-'+i}))};
   const added=appendValidatedDemoTransaction(demoTransactions,extra);
   expect(getDemoUserAllocations('user6')).toHaveLength(0);
   expect(getDemoUserAllocations('user6',added)).toHaveLength(1);
   expect(()=>appendValidatedDemoTransaction(added,extra)).toThrow();
 });
 it('rejects financial-looking or corrupt events',()=>{
   expect(validateDemoTransaction({...demoTransactions[0],simulationOnly:false as true})).toContain('Non-demo transactions are forbidden');
   expect(validateDemoTransaction({...demoTransactions[0],allocations:[]})).toContain('No allocations');
 });
});