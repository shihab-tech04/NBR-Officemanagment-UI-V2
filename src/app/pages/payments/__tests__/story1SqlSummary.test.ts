import {describe,it,expect} from 'vitest';
import {summarizeMirroredDemoPayments} from '../story1SqlSummary';
import type {StoryPayment,StoryNotice} from '../story1OfficeApi';
const record=(id:string,amountMinor:number,ay:string,service='TAX_WITH_RETURN'):StoryPayment=>({
  id,service,amountMinor,status:'SIMULATED_SUCCESS',createdAt:'2026-10-24T13:00:00Z',
  details:{assessmentYear:ay}
});
const notifications:StoryNotice[]=[
  {id:1,paymentId:'one',type:'NEW_SIMULATED_PAYMENT',createdAt:'2026-10-24T13:00:00Z'},
  {id:2,paymentId:'two',type:'NEW_SIMULATED_PAYMENT',createdAt:'2026-10-24T13:00:00Z'}
];
describe('Office TaxPay SQL-only overview',()=>{
 it('shows actual integer-paisa totals, service count, and mirrored notice count',()=>{
   const v=summarizeMirroredDemoPayments([record('one',120050,'2026-27'),record('two',2535,'2025-26','ADVANCE_TAX')],notifications);
   expect(v).toMatchObject({count:2,amountMinor:122585,services:2,notificationCount:2});
 });
 it('filters SQL payments and notices by assessment year consistently',()=>{
   const v=summarizeMirroredDemoPayments([record('one',120050,'2026-27'),record('two',2535,'2025-26')],notifications,'2026-27');
   expect(v).toMatchObject({count:1,amountMinor:120050,notificationCount:1});
 });
 it('never reports a financial total if SQL amounts are invalid or status is not simulated',()=>{
   expect(summarizeMirroredDemoPayments([record('one',10.5,'2026-27')],notifications).amountMinor).toBeNull();
   expect(summarizeMirroredDemoPayments([{...record('one',1500,'2026-27'),status:'PENDING'}],notifications).amountMinor).toBeNull();
   expect(summarizeMirroredDemoPayments([record('one',Number.MAX_SAFE_INTEGER,'2026-27'),record('two',1,'2026-27')],notifications).amountMinor).toBeNull();
 });
});
