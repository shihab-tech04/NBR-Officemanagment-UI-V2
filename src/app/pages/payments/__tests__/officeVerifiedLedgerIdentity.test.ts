import {describe,expect,it} from 'vitest';
import type {TaxpayerRegistrationProfile} from '../officeTaxpayerRegistrationProfiles';
import {resolveVerifiedOfficeLedgerTin} from '../officeVerifiedLedgerIdentity';

const canonicalTin='123456789012';
const previewTin='1010101010101';
const profile=(source='NBR_TIN',overrides:Record<string,unknown>={})=>({
 accountId:'user10',tin:canonicalTin,revision:1,updatedAt:'2026-11-21T00:00:00Z',
 profile:{tin:canonicalTin,source,sourceUpdatedAt:'2026-11-20T00:00:00Z'},
 ...overrides,
}) as unknown as TaxpayerRegistrationProfile;

describe('F-177 verified ledger identity binding',()=>{
 it('uses the canonical profile TIN for the exact selected preview account',()=>{
  expect(resolveVerifiedOfficeLedgerTin(previewTin,'user10',profile())).toBe(canonicalTin);
 });
 it('accepts a reviewed certificate identity as authoritative',()=>{
  expect(resolveVerifiedOfficeLedgerTin(previewTin,'user10',profile('REVIEWED_CERTIFICATE'))).toBe(canonicalTin);
 });
 it('fails closed for synthetic profiles and a different preview account',()=>{
  expect(resolveVerifiedOfficeLedgerTin(previewTin,'user10',profile('SYNTHETIC'))).toBe('');
  expect(resolveVerifiedOfficeLedgerTin(previewTin,'user11',profile())).toBe('');
 });
 it('fails closed for missing, malformed, stale-shape or mismatched identity',()=>{
  expect(resolveVerifiedOfficeLedgerTin(previewTin,'user10',null)).toBe('');
  expect(resolveVerifiedOfficeLedgerTin(previewTin,'user10',profile('NBR_TIN',{tin:previewTin}))).toBe('');
  expect(resolveVerifiedOfficeLedgerTin(previewTin,'user10',profile('NBR_TIN',{
   profile:{tin:canonicalTin,source:'NBR_TIN',sourceUpdatedAt:'not-a-date'}
  }))).toBe('');
  expect(resolveVerifiedOfficeLedgerTin(previewTin,'user10',profile('NBR_TIN',{
   profile:{tin:'999999999999',source:'NBR_TIN',sourceUpdatedAt:'2026-11-20T00:00:00Z'}
  }))).toBe('');
 });
 it('requires exact selected TIN and profile identity outside the preview route',()=>{
  expect(resolveVerifiedOfficeLedgerTin(canonicalTin,null,profile())).toBe(canonicalTin);
  expect(resolveVerifiedOfficeLedgerTin(previewTin,null,profile())).toBe('');
 });
});
