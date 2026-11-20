import {describe,it,expect,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {OfficeTaxpayerRegistrationDetails,maskOfficeProfileValue} from '../OfficeTaxpayerRegistrationDetails';
import {REGISTRATION_FIELDS,type RegistrationField,type TaxpayerRegistrationProfile} from '../officeTaxpayerRegistrationProfiles';

vi.mock('../../audit/auditSharedSql',()=>({getAuditSqlClient:()=>null}));
const all=Object.fromEntries(REGISTRATION_FIELDS.map(key=>[key,'Value of '+key])) as Record<RegistrationField,string>;
const record:TaxpayerRegistrationProfile={
 accountId:'user1',tin:'123456789012',revision:1,updatedAt:'2026-06-04T17:06:20+06:00',
 profile:{...all,tin:'123456789012',taxpayerName:'Example user',source:'REVIEWED_CERTIFICATE',sourceUpdatedAt:'2026-06-04T17:06:20+06:00'},
};
const sensitive=new Set<RegistrationField>(['tin','previousTin','mobileNumber','emailAddress','taxOfficePhone']);
const fieldOrder=[
 'taxpayerName','tin','tinType','taxesCircle','registeredOn','lastLoginAt',
 'taxpayerStatus','tinSubtype','userType','localTaxpayer',
 'taxesZone','taxesRange','district','country',
 'mobileNumber','emailAddress','registeredAddress','currentAddress',
 'previousTin','certificateIssuedOn','certificateLastUpdatedOn',
 'issuingOfficer','taxOfficeAddress','taxOfficePhone',
];
describe('Office registration view: canonical Taxpayer 24-field parity',()=>{
 it('retains each canonical source field once, preserves layout and hides sensitive details by default',()=>{
   expect(REGISTRATION_FIELDS).toHaveLength(24);
   render(<OfficeTaxpayerRegistrationDetails record={record} language="en"/>);
   const root=screen.getByTestId('office-taxpayer-registration-profile');
   expect(root).toBeTruthy();
   const fields=Array.from(root.querySelectorAll('[data-registration-field]'));
   expect(fields).toHaveLength(24);
   expect(fields.map(node=>node.getAttribute('data-registration-field'))).toEqual(fieldOrder);
   expect(new Set(fieldOrder).size).toBe(24);
   for(const key of REGISTRATION_FIELDS){
     const row=root.querySelector('[data-registration-field="'+key+'"]');
     expect(row).toBeTruthy();
     if(sensitive.has(key)){
       expect(row!.textContent).not.toContain(record.profile[key]!);
       expect(row!.textContent).toContain(maskOfficeProfileValue(record.profile[key]!));
     }else expect(row!.textContent).toContain(record.profile[key]!);
   }
   expect(screen.getByRole('button',{name:'Reveal TIN'})).toBeTruthy();
   expect(screen.getByRole('button',{name:'Copy TIN'})).toBeTruthy();
   expect(screen.queryByText(/Income sources|Assessment years|Representative mandate/)).toBeNull();
   expect(screen.getByText('Taxpayer status')).toBeTruthy();
   expect(screen.getByText('TIN registration and jurisdiction').closest('section')!.textContent).not.toContain('Previous TIN');
   expect(screen.getByText('Certificate details').closest('section')!.textContent).toContain('Previous TIN');
 });
 it('reveals only the chosen identifier, hides it again and preserves other masked fields',()=>{
   render(<OfficeTaxpayerRegistrationDetails record={record} language="en"/>);
   const tin=screen.getByTestId('office-taxpayer-registration-profile')
     .querySelector('[data-registration-field="tin"]')!;
   expect(tin.textContent).not.toContain(record.tin);
   fireEvent.click(screen.getByRole('button',{name:'Reveal TIN'}));
   expect(tin.textContent).toContain(record.tin);
   expect(screen.getByRole('button',{name:'Hide TIN'})).toHaveAttribute('aria-pressed','true');
   const phone=screen.getByTestId('office-taxpayer-registration-profile')
     .querySelector('[data-registration-field="mobileNumber"]')!;
   expect(phone.textContent).not.toContain(record.profile.mobileNumber!);
   fireEvent.click(screen.getByRole('button',{name:'Hide TIN'}));
   expect(tin.textContent).not.toContain(record.tin);
 });
 it('keeps complete bilingual fields, controls and unavailable states without leaking values',()=>{
   const unavailable:TaxpayerRegistrationProfile={...record,profile:{...record.profile,mobileNumber:null}};
   render(<OfficeTaxpayerRegistrationDetails record={unavailable} language="bn"/>);
   expect(screen.getByText('সনদের তথ্য')).toBeTruthy();
   expect(screen.getByText('সর্বশেষ লগইন')).toBeTruthy();
   expect(screen.getByRole('button',{name:'দেখুন টিআইএন'})).toBeTruthy();
   expect(screen.getByRole('button',{name:'কপি করুন টিআইএন'})).toBeTruthy();
   const phone=screen.getByTestId('office-taxpayer-registration-profile')
    .querySelector('[data-registration-field="mobileNumber"]')!;
   expect(phone.textContent).toContain('পাওয়া যায়নি');
   expect(screen.getByText('করদাতার অবস্থা')).toBeTruthy();
   expect(screen.getByText('পূর্ববর্তী টিআইএন')).toBeTruthy();
   expect(screen.getByText('কর সার্কেল')).toBeTruthy();
 });
 it('masks first three characters consistently without exposing remaining digits',()=>{
   expect(maskOfficeProfileValue('123456789012')).toBe('123****');
   expect(maskOfficeProfileValue('abcdef@example.test')).toBe('abc****');
   expect(maskOfficeProfileValue('')).toBe('—');
 });
});
