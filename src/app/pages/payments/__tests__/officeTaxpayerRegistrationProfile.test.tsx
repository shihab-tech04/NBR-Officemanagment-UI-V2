import {describe,it,expect,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import {OfficeTaxpayerRegistrationDetails} from '../OfficeTaxpayerRegistrationDetails';
import {REGISTRATION_FIELDS,type RegistrationField,type TaxpayerRegistrationProfile} from '../officeTaxpayerRegistrationProfiles';

vi.mock('../../audit/auditSharedSql',()=>({getAuditSqlClient:()=>null}));
const all=Object.fromEntries(REGISTRATION_FIELDS.map(key=>[key,'Value of '+key])) as Record<RegistrationField,string>;
const record:TaxpayerRegistrationProfile={
 accountId:'user1',tin:'577935451798',revision:1,updatedAt:'2026-06-04T17:06:20+06:00',
 profile:{...all,tin:'577935451798',taxpayerName:'Md. Arif Rahman',source:'REVIEWED_CERTIFICATE',sourceUpdatedAt:'2026-06-04T17:06:20+06:00'},
};
describe('Office registration view 1:1 field parity',()=>{
 it('renders every TaxPay registration field once without inventing other fields',()=>{
   expect(REGISTRATION_FIELDS).toHaveLength(24);
   render(<OfficeTaxpayerRegistrationDetails record={record} language="en"/>);
   expect(screen.getByTestId('office-taxpayer-registration-profile')).toBeTruthy();
   for(const key of REGISTRATION_FIELDS){
     const text=record.profile[key];
     expect(text).toBeTruthy();
     const rows=screen.getAllByText(text!);
     expect(rows.length).toBe(1);
   }
   expect(screen.queryByText(/Income sources|Assessment years|Representative mandate/)).toBeNull();
 });
 it('retains same data in Bangla without discarding fields',()=>{
   render(<OfficeTaxpayerRegistrationDetails record={record} language="bn"/>);
   expect(screen.getByText('সনদের তথ্য')).toBeTruthy();
   expect(screen.getByText('সর্বশেষ লগইন')).toBeTruthy();
   expect(screen.getByText('577935451798')).toBeTruthy();
 });
});
