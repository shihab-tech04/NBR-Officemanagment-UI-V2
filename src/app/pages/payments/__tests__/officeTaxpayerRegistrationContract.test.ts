import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {getOfficeTaxpayerRegistrations,REGISTRATION_FIELDS} from '../officeTaxpayerRegistrationProfiles';

vi.mock('../../audit/auditSharedSql',()=>({getAuditSqlClient:()=>({
  auth:{
    getUser:async()=>({data:{user:{id:'office-admin'}} ,error:null}),
    getSession:async()=>({data:{session:{user:{id:'office-admin'},access_token:'office-token'}} ,error:null})
  }
})}));
const sourceProfile=Object.fromEntries(REGISTRATION_FIELDS.map(k=>[k,'Value of '+k]));
const valid=()=>({accountId:'user1',tin:'577935451798',revision:1,updatedAt:'2026-11-11T10:59:20Z',
  profile:{...sourceProfile,tin:'577935451798',source:'REVIEWED_CERTIFICATE',sourceUpdatedAt:'2026-06-04T11:06:20Z'}});
const realFetch=globalThis.fetch;
beforeEach(()=>{globalThis.fetch=vi.fn();});
afterEach(()=>{globalThis.fetch=realFetch;vi.restoreAllMocks();});
const respond=(profiles:unknown[])=>{vi.mocked(globalThis.fetch).mockResolvedValue({
  ok:true,json:async()=>({success:true,profiles})
} as Response);};
describe('Office canonical TaxPay SQL record validation',()=>{
 it('keeps 24 fields and source metadata without remapping values',async()=>{
   const row=valid();respond([row]);
   const result=await getOfficeTaxpayerRegistrations();
   expect(result).toEqual([row]);
   expect(Object.keys(result[0].profile).length).toBe(26);
   expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledOnce();
   const [url,options]=vi.mocked(globalThis.fetch).mock.calls[0];
   expect(String(url)).toContain('taxpay-office-registration-profiles');
   expect(options?.cache).toBe('no-store');
   expect((options?.headers as Record<string,string>).Authorization).toBe('Bearer office-token');
 });
 it.each([
  ['missing source field',(r:ReturnType<typeof valid>)=>{delete (r.profile as Record<string,unknown>).taxesRange;}],
  ['extra mismatched field',(r:ReturnType<typeof valid>)=>{(r.profile as Record<string,unknown>).unexpected='x';}],
  ['TIN identity mismatch',(r:ReturnType<typeof valid>)=>{r.profile.tin='999999999999';}],
  ['invalid revision',(r:ReturnType<typeof valid>)=>{r.revision=0;}],
  ['invalid SQL updatedAt',(r:ReturnType<typeof valid>)=>{r.updatedAt='not-a-date';}],
  ['invalid provenance',(r:ReturnType<typeof valid>)=>{r.profile.source='UNKNOWN';}],
 ] as const)('rejects %s rather than display stale or unverified identity',async(_,mutate)=>{
   const r=valid();mutate(r);respond([r]);
   await expect(getOfficeTaxpayerRegistrations()).rejects.toThrow();
 });
 it('rejects two rows bound to one TIN or account',async()=>{
   const a=valid();const b=valid();b.accountId='user2';respond([a,b]);
   await expect(getOfficeTaxpayerRegistrations()).rejects.toThrow('identity conflict');
 });
});