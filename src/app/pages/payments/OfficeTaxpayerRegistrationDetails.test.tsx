import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {maskOfficeProfileValue,OfficeTaxpayerRegistrationDetails} from './OfficeTaxpayerRegistrationDetails';
import {REGISTRATION_FIELDS,type TaxpayerRegistrationProfile} from './officeTaxpayerRegistrationProfiles';

describe('Office taxpayer registration parity with the approved Taxpayer profile',()=>{
 it('masks TIN and phone digits using the exact Taxpayer profile contract',()=>{
  expect(maskOfficeProfileValue('577935451798','tin')).toBe('577*********');
  expect(maskOfficeProfileValue('+8801857648765','phone')).toBe('+880**********');
  expect(maskOfficeProfileValue('02-9588253','phone')).toBe('02-9******');
  expect(maskOfficeProfileValue('123','tin')).toBe('***');
 });
 it('never reveals the private email domain before an explicit reveal',()=>{
  expect(maskOfficeProfileValue('email@test.com','email')).toBe('em***@****.***');
  expect(maskOfficeProfileValue('a@x.io','email')).toBe('a***@****.***');
 });
 it('preserves all 24 fields and ordinary certificate placeholder text in both languages',()=>{
  const profile=Object.fromEntries(REGISTRATION_FIELDS.map(key=>[key,null])) as Record<(typeof REGISTRATION_FIELDS)[number],string|null>;
  profile.tin='577935451798';
  profile.mobileNumber='01712345678';
  profile.emailAddress='email@test.com';
  profile.previousTin='Not Applicable';
  const record:TaxpayerRegistrationProfile={
   accountId:'user1',tin:'577935451798',revision:1,
   updatedAt:'2026-11-24T00:00:00Z',
   profile:{...profile,source:'REVIEWED_CERTIFICATE',sourceUpdatedAt:'2026-11-24T00:00:00Z'}
  };
  for(const language of ['en','bn'] as const){
   const html=renderToStaticMarkup(createElement(OfficeTaxpayerRegistrationDetails,{record,language}));
   expect((html.match(/<dt\b/g)||[]).length).toBe(24);
   expect(html).toContain('577*********');
   expect(html).toContain('017********');
   expect(html).toContain('em***@****.***');
   expect(html).toContain('Not Applicable');
   expect(html).not.toContain('577935451798');
   expect(html).not.toContain('01712345678');
   expect(html).not.toContain('email@test.com');
  }
 });
});
