import {getAuditSqlClient} from '../audit/auditSharedSql';

const ENDPOINT='https://eyqhoavnitkrajvyqvxn.supabase.co/functions/v1/taxpay-office-registration-profiles';
const PUBLISHABLE_KEY='sb_publishable_ZRyWCWCOWBmsg7b9qTseUg_CFlhl3Id';
export const REGISTRATION_FIELDS=[
  'tin','taxpayerName','taxpayerStatus','tinType','tinSubtype','registeredOn',
  'userType','localTaxpayer','previousTin','taxesCircle','taxesZone','taxesRange',
  'district','country','registeredAddress','currentAddress','mobileNumber','emailAddress',
  'certificateIssuedOn','certificateLastUpdatedOn','issuingOfficer','taxOfficeAddress',
  'taxOfficePhone','lastLoginAt'
] as const;
export type RegistrationField=typeof REGISTRATION_FIELDS[number];
export type TaxpayerRegistrationProfile={
  accountId:string;tin:string;revision:number;updatedAt:string;
  profile:Record<RegistrationField,string|null> & {source:string;sourceUpdatedAt:string};
};
function check(value:unknown):TaxpayerRegistrationProfile{
 if(!value||typeof value!=='object')throw Error('Invalid taxpayer profile record');
 const row=value as Record<string,unknown>;
 if(typeof row.accountId!=='string'||typeof row.tin!=='string'||!/^\d{12}$/.test(row.tin)||
    !Number.isSafeInteger(row.revision)||!row.profile||typeof row.profile!=='object')
   throw Error('Invalid taxpayer registration identity');
 const profile=row.profile as Record<string,unknown>;
 if(profile.tin!==row.tin||REGISTRATION_FIELDS.some(key=>!(key in profile)||
     !(profile[key]===null||typeof profile[key]==='string')))
   throw Error('Incomplete taxpayer registration record');
 return row as unknown as TaxpayerRegistrationProfile;
}
async function token():Promise<string>{
 const client=getAuditSqlClient();
 const {data,error}=await client.auth.getUser();
 if(error||!data.user||data.user.is_anonymous)throw Error('Sign in to Office to view taxpayer profiles.');
 const {data:session,error:sessionError}=await client.auth.getSession();
 if(sessionError||session.session?.user.id!==data.user.id||!session.session.access_token)
   throw Error('Office session changed. Sign in again.');
 return session.session.access_token;
}
/** The Office UI never copies taxpayer profile data to its own database. */
export async function getOfficeTaxpayerRegistrations():Promise<TaxpayerRegistrationProfile[]>{
 const access=await token();
 const response=await fetch(ENDPOINT,{cache:'no-store',headers:{
   Authorization:'Bearer '+access,apikey:PUBLISHABLE_KEY,Accept:'application/json'
 }});
 const body=await response.json().catch(()=>null) as {success?:boolean;profiles?:unknown[]}|null;
 if(!response.ok||body?.success!==true||!Array.isArray(body.profiles))
   throw Error('TaxPay taxpayer records are unavailable to this Office account.');
 const profiles=body.profiles.map(check);
 if(new Set(profiles.map(row=>row.accountId)).size!==profiles.length ||
    new Set(profiles.map(row=>row.tin)).size!==profiles.length)
   throw Error('Taxpayer registration identity conflict');
 return profiles;
}
