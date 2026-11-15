import {getOfficeCmsAuthClient} from '../../services/officeCmsBridge';
import {getAuditSqlClient,isSharedAuditMode} from '../audit/auditSharedSql';

/** WS3 F-177 contract; a saved Sohojkor payment is never official tax credit. */
export type GuardedOfficeLedgerEntry={
  sourceSystem:string;sourceRecordId:string;sourceAllocationId:string|null;
  sourceRevision:number;taxpayerTin:string;dhara:string|null;
  paymentSource:string;amountMinor:string;assessmentYear:string|null;
  eventDate:string;originalReference:string|null;
  entryKind:'DEDUCTION'|'DEPOSIT'|'CREDIT'|'REVERSAL'|'PAYMENT_RECORD';
  financialStatus:'UNVERIFIED'|'PENDING'|'VERIFIED'|'REVERSED';
  evidenceSha256?:string|null;
  reconciliationProvenance?:Record<string,unknown>;
  canonicalCreditReference?:string|null;canonicalCreditLineId?:string|null;
};
export type GuardedOfficeLedgerPage={
  items:GuardedOfficeLedgerEntry[];limit:number;offset:number;
  verifiedExternalCreditMinor:string;mirroredSohojkorCreditVerified:false;
};
const sources=new Set(['BRTA','E_TDS','IBAS_PLUS_PLUS','NSD','SUB_REGISTRAR_OFFICE','BANK','SA_CODER','SOHOJKOR']);
const kinds=new Set(['DEDUCTION','DEPOSIT','CREDIT','REVERSAL','PAYMENT_RECORD']);
const states=new Set(['UNVERIFIED','PENDING','VERIFIED','REVERSED']);
const digits=/^(0|[1-9][0-9]*)$/;
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const maybeString=(v:unknown)=>v===undefined||v===null||typeof v==='string';
const timestamp=(v:unknown):v is string=>{
  if(typeof v!=='string')return false;
  const match=/^(\d{4})-(\d{2})-(\d{2})T/.exec(v);
  if(!match||!Number.isFinite(Date.parse(v)))return false;
  const [y,m,d]=match.slice(1).map(Number);
  const calendar=new Date(Date.UTC(y,m-1,d));
  return y>=100&&calendar.getUTCFullYear()===y&&calendar.getUTCMonth()===m-1&&
    calendar.getUTCDate()===d;
};

/** Fail closed on invalid source evidence, wrong taxpayer, duplicate identity or
 * unapproved simulated-credit states. Never translate bad source data to zero. */
export function parseGuardedOfficeLedger(
  data:unknown,tin:string,offset:number,limit=200,
):GuardedOfficeLedgerPage {
  if(!/^\d{12}$/.test(tin)||!obj(data)||!Array.isArray(data.items)||
     data.limit!==limit||data.offset!==offset||data.items.length>limit||
     data.mirroredSohojkorCreditVerified!==false||
     typeof data.verifiedExternalCreditMinor!=='string'||!digits.test(data.verifiedExternalCreditMinor))
    throw Error('Invalid officer ledger response');
  const seen=new Set<string>();
  const items=data.items.map((raw:unknown)=>{
    if(!obj(raw)||!sources.has(String(raw.sourceSystem))||
       typeof raw.sourceRecordId!=='string'||!raw.sourceRecordId.trim()||
       raw.taxpayerTin!==tin||!Number.isSafeInteger(raw.sourceRevision)||Number(raw.sourceRevision)<1||
       !maybeString(raw.sourceAllocationId)||!maybeString(raw.dhara)||
       !maybeString(raw.assessmentYear)||!maybeString(raw.originalReference)||
       typeof raw.paymentSource!=='string'||!raw.paymentSource.trim()||
       typeof raw.amountMinor!=='string'||!digits.test(raw.amountMinor)||
       !timestamp(raw.eventDate)||!kinds.has(String(raw.entryKind))||
       !states.has(String(raw.financialStatus)))
      throw Error('Invalid officer ledger entry');
    const identity=[raw.sourceSystem,raw.sourceRecordId,raw.sourceAllocationId??'',raw.sourceRevision].join('|');
    if(seen.has(identity))throw Error('Duplicate officer ledger entry');
    seen.add(identity);
    if(raw.sourceSystem==='SOHOJKOR'){
      if(raw.entryKind!=='PAYMENT_RECORD'||raw.financialStatus!=='UNVERIFIED')
        throw Error('Mirrored payment cannot claim a verified credit');
    }else{
      if(raw.entryKind==='PAYMENT_RECORD')throw Error('Invalid external payment record');
      if(raw.financialStatus==='VERIFIED'){
        if(typeof raw.evidenceSha256!=='string'||!/^[a-f0-9]{64}$/.test(raw.evidenceSha256)||
           !obj(raw.reconciliationProvenance)||
           typeof raw.reconciliationProvenance.officialSourceRecordId!=='string'||
           !raw.reconciliationProvenance.officialSourceRecordId.trim()||
           !timestamp(raw.reconciliationProvenance.verifiedAt))
          throw Error('Verified source evidence is unavailable');
        if(raw.entryKind==='CREDIT'&&
          (typeof raw.canonicalCreditReference!=='string'||!raw.canonicalCreditReference.trim()||
           typeof raw.canonicalCreditLineId!=='string'||!raw.canonicalCreditLineId.trim()))
          throw Error('Canonical credit evidence is unavailable');
      }
    }
    return raw as GuardedOfficeLedgerEntry;
  });
  return {items,limit,offset,verifiedExternalCreditMinor:data.verifiedExternalCreditMinor,
    mirroredSohojkorCreditVerified:false};
}

/** Existing Office Supabase session only. SQL additionally checks officer_roles,
 * denies anonymous access and scopes source rows by the requested taxpayer. */
export async function getGuardedOfficeLedger(tin:string,offset=0):Promise<GuardedOfficeLedgerPage>{
  if(!/^\d{12}$/.test(tin)||!Number.isSafeInteger(offset)||offset<0||offset>100000)
    throw Error('Authorized ledger scope is unavailable');
  const db=isSharedAuditMode()?getAuditSqlClient():getOfficeCmsAuthClient();
  const {data:identity,error:identityError}=await db.auth.getUser();
  if(identityError||!identity.user||identity.user.is_anonymous)
    throw Error('Verified Office officer sign-in is required');
  const {data:session,error:sessionError}=await db.auth.getSession();
  if(sessionError||!session.session||session.session.user.id!==identity.user.id||
     !session.session.access_token)throw Error('Office officer session changed');
  const {data,error}=await db.rpc('payment_v1_office_guarded_taxpayer_ledger',{
    p_taxpayer_tin:tin,p_limit:200,p_offset:offset,
  });
  if(error)throw Error('Authorized external ledger source is unavailable');
  return parseGuardedOfficeLedger(data,tin,offset);
}

export function formatLedgerMinor(value:string,language:'en'|'bn'):string{
  if(!digits.test(value))return '—';
  const amount=BigInt(value);
  const remainder=amount%100n;
  return '৳'+new Intl.NumberFormat(language==='bn'?'bn-BD':'en-BD').format(amount/100n)+
    (remainder===0n?'':'.'+String(remainder).padStart(2,'0'));
}

export function projectGuardedLedgerRows(
  entries:readonly GuardedOfficeLedgerEntry[],year:string,language:'en'|'bn',
  from='',to=''
){
  return entries.filter(e=>(year==='all'||e.assessmentYear?.replace('–','-')===year)&&
    (!from||e.eventDate.slice(0,10)>=from)&&(!to||e.eventDate.slice(0,10)<=to))
  .map(e=>{
    const verifiedCredit=e.sourceSystem!=='SOHOJKOR'&&e.entryKind==='CREDIT'&&e.financialStatus==='VERIFIED';
    return {
      key:[e.sourceSystem,e.sourceRecordId,e.sourceAllocationId??'',e.sourceRevision].join(':'),
      date:new Date(e.eventDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}),
      source_system:e.sourceSystem==='SOHOJKOR'?'Sohojkor payment mirror':e.sourceSystem,
      payment_type:e.entryKind.replace(/_/g,' '),dhara:e.dhara?.trim()||'—',
      amount:formatLedgerMinor(e.amountMinor,language),assessment_year:e.assessmentYear||'—',
      ledger_stage:e.financialStatus==='VERIFIED'?'Source verified':
        e.financialStatus.charAt(0)+e.financialStatus.slice(1).toLowerCase(),
      credit_status:verifiedCredit?'Source-verified external credit':'Not verified as credit',
      payment_ref:e.sourceRecordId,source_revision:String(e.sourceRevision),
      source_allocation:e.sourceAllocationId||'—',
      original_reference:e.originalReference||'—',
      evidence_sha256:e.evidenceSha256||'—',event_timestamp:e.eventDate
    };
  });
}
