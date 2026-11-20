import {getAuditSqlClient,isSharedAuditMode} from '../audit/auditSharedSql';
import {getOfficeCmsAuthClient} from '../../services/officeCmsBridge';

const PRIMARY_TAXPAYER_URL='https://gmuhitmaynfhipcvbvkh.supabase.co';
const ENDPOINT=PRIMARY_TAXPAYER_URL+'/functions/v1/taxpay-office-registration-profiles';
const PUBLISHABLE_KEY='sb_publishable_svqqJLfKtBQNuUqCqOZSqQ_r3TDoYCk';
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
 if(typeof row.accountId!=='string'||!row.accountId.trim()||row.accountId.length>100||
    typeof row.tin!=='string'||!/^\d{12}$/.test(row.tin)||
    !Number.isSafeInteger(row.revision)||Number(row.revision)<1||
    typeof row.updatedAt!=='string'||!Number.isFinite(Date.parse(row.updatedAt))||
    !row.profile||typeof row.profile!=='object'||Array.isArray(row.profile))
   throw Error('Invalid taxpayer registration identity');
 const profile=row.profile as Record<string,unknown>;
 if(profile.tin!==row.tin||
    !['NBR_TIN','REVIEWED_CERTIFICATE','SYNTHETIC'].includes(String(profile.source))||
    typeof profile.sourceUpdatedAt!=='string'||!Number.isFinite(Date.parse(profile.sourceUpdatedAt))||
    Object.keys(profile).length!==REGISTRATION_FIELDS.length+2||
    REGISTRATION_FIELDS.some(key=>!Object.prototype.hasOwnProperty.call(profile,key)||
      !(profile[key]===null||typeof profile[key]==='string')))
   throw Error('Incomplete taxpayer registration record');
 return row as unknown as TaxpayerRegistrationProfile;
}
async function token():Promise<string>{
 const client=isSharedAuditMode()?getAuditSqlClient():getOfficeCmsAuthClient();
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
   throw Error('Taxpayer V2 registration records are unavailable to this Office account.');
 const profiles=body.profiles.map(check);
 if(new Set(profiles.map(row=>row.accountId)).size!==profiles.length ||
    new Set(profiles.map(row=>row.tin)).size!==profiles.length)
   throw Error('Taxpayer registration identity conflict');
 return profiles;
}


/** Public fictional catalogue; Office never interprets preview data as a TIN/identity binding. */
export type OfficePreviewTaxpayer={
 accountId:string;nameEn:string;nameBn:string;sampleTin:string;
 roleCode:string;profileFocusEn:string|null;jurisdictionLabel:string|null;
};
const FIRST_TEN_NAMES_EN=[
 'Md. Arif Rahman','Meghna Trading Ltd.','Rupali Textiles Ltd.',
 'Nusrat Jahan','Mahmud Hasan','Farzana Akter','Sadia Islam',
 'Tanvir Ahmed','Imran Hossain','Shaila Parvin'
] as const;
const FIRST_TEN_NAMES_BN=[
 'মো. আরিফ রহমান','মেঘনা ট্রেডিং লিমিটেড','রূপালী টেক্সটাইলস লিমিটেড',
 'নুসরাত জাহান','মাহমুদ হাসান','ফারজানা আক্তার','সাদিয়া ইসলাম',
 'তানভীর আহমেদ','ইমরান হোসেন','শায়লা পারভীন'
] as const;
const FIRST_TEN_ROLES=[
 'TAXPAYER_INDIVIDUAL','TAXPAYER_CORPORATE','WITHHOLDING_AGENT',
 'TAXPAYER_INDIVIDUAL','TAXPAYER_INDIVIDUAL','TAXPAYER_INDIVIDUAL',
 'TAXPAYER_INDIVIDUAL','TAXPAYER_INDIVIDUAL','TAXPAYER_INDIVIDUAL',
 'TAXPAYER_INDIVIDUAL'
] as const;
const expectedRole=(i:number)=>i<=10?FIRST_TEN_ROLES[i-1]:
 i%7===0?'WITHHOLDING_AGENT':i%5===0?'TAXPAYER_CORPORATE':'TAXPAYER_INDIVIDUAL';
const sampleTin=(i:number)=>i===10?'1010101010101':
 i<=9?String(i).repeat(13):'90000000'+String(i).padStart(5,'0');
/** Strictly project first 30 *selectable* Taxpayer logged-in scenarios.
 * The source also contains 25 additional nonselectable test records. */
export function projectOfficePreviewTaxpayers(source:unknown):OfficePreviewTaxpayer[]{
 if(!Array.isArray(source)||source.length>100)throw Error('Invalid Taxpayer preview directory');
 const items=new Map<string,Record<string,unknown>>();
 for(const value of source){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid preview row');
  const row=value as Record<string,unknown>;
  if(typeof row.id!=='string'||!/^user([1-9]|[1-4][0-9]|5[0-5])$/.test(row.id)||
     items.has(row.id))throw Error('Duplicate or invalid preview identity');
  items.set(row.id,row);
 }
 return Array.from({length:30},(_,index)=>{
  const i=index+1,accountId='user'+i,row=items.get(accountId);
  if(!row||row.role_code!==expectedRole(i))throw Error('Taxpayer preview directory is incomplete');
  const canonicalName=i<=10?FIRST_TEN_NAMES_EN[i-1]:'Taxpayer Account '+i;
  const canonicalBn=i<=10?FIRST_TEN_NAMES_BN[i-1]:'করদাতা অ্যাকাউন্ট '+i;
  // Database names are allowed to be absent on early preview fixtures.
  // The signed-in Taxpayer catalogue is authoritative for these display labels.
  if(i>10 && typeof row.name_en==='string' && row.name_en!==canonicalName)
   throw Error('Taxpayer preview name changed; source parity review required');
  return {
   accountId,nameEn:canonicalName,nameBn:canonicalBn,
   sampleTin:sampleTin(i),roleCode:String(row.role_code),
   profileFocusEn:typeof row.focus_en==='string'?row.focus_en:null,
   jurisdictionLabel:typeof row.jurisdiction_label==='string'?row.jurisdiction_label:null
  };
 });
}
/** The 30 selectable preview scenarios are publicly readable in Taxpayer V2
 * by their existing SELECT-only RLS policy. Never use an Office service key. */
export async function getOfficePreviewTaxpayers():Promise<OfficePreviewTaxpayer[]>{
 const response=await fetch(PRIMARY_TAXPAYER_URL+
  '/rest/v1/sim_payment_users?select=id,role_code,name_en,focus_en,jurisdiction_label&order=id.asc&limit=100',
  {cache:'no-store',headers:{apikey:PUBLISHABLE_KEY,Accept:'application/json'}});
 if(!response.ok)throw Error('Taxpayer V2 preview directory is unavailable');
 return projectOfficePreviewTaxpayers(await response.json());
}
