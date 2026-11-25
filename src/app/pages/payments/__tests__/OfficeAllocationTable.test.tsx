import {describe,it,expect} from 'vitest';
import {render,within} from '@testing-library/react';
import {OfficeAllocationTable} from '../OfficeAllocationTable';
import {groupOfficePaymentAllocations,type OfficePaymentItem} from '../officeTransactionDetails';

const items:OfficePaymentItem[]=[
 {taxpayer:'First · 111111111111',taxpayerTin:'111111111111',service:'Advance Tax',assessmentYear:'2026-27',amountMinor:80000,economicCode:'64'},
 {taxpayer:'Second',taxpayerTin:'222222222222',service:'Penalty',assessmentYear:'2026-27',amountMinor:80000,authorization:'AUTH-1'},
 {taxpayer:'First · 111111111111',taxpayerTin:'111111111111',service:'Source Tax',assessmentYear:'2025-26',amountMinor:90000},
];
describe('unified Office allocation table',()=>{
 it('groups by exact TIN, keeps all source rows, subtotals and total',()=>{
  expect(groupOfficePaymentAllocations(items).map(g=>[g.taxpayerTin,g.items.length,g.totalMinor])).toEqual([
   ['111111111111',2,170000],['222222222222',1,80000]]);
  expect(items[2].amountMinor).toBe(90000);
  const {container}=render(<OfficeAllocationTable items={items} language="en" total="৳2,500.00" showAuthorization/>);
  const table=within(container).getByRole('table');
  const scope=within(table);
  expect(scope.getAllByRole('columnheader')).toHaveLength(4);
  expect(scope.getAllByTestId('office-taxpayer-head-row')).toHaveLength(3);
  expect(scope.getAllByTestId('office-taxpayer-cell')).toHaveLength(2);
  expect(scope.getAllByTestId('office-taxpayer-cell')[0]).toHaveAttribute('rowspan','2');
  expect(scope.getByText('Taxpayer subtotal: ৳1,700.00')).toBeTruthy();
  expect(scope.getByText('Authorization: AUTH-1')).toBeTruthy();
  expect(scope.getByText('Economic code: 64')).toBeTruthy();
  expect(scope.getByText('৳2,500.00')).toBeTruthy();
 });
 it('preserves Bengali headers and leaves unknown identities separate',()=>{
  const unknown=items.map(item=>({...item,taxpayer:'Unknown',taxpayerTin:undefined}));
  expect(groupOfficePaymentAllocations(unknown)).toHaveLength(3);
  const {container}=render(<OfficeAllocationTable items={items} language="bn" total="৳২,৫০০.০০"/>);
  expect(within(container).getByRole('columnheader',{name:'করদাতা / ই-টিআইএন'})).toBeTruthy();
  expect(within(container).getByText('করদাতার মোট: ৳১,৭০০.০০')).toBeTruthy();
 });
});
