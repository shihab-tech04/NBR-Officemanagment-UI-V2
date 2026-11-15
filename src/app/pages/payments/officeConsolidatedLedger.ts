import {getOfficeCmsAuthClient} from '../../services/officeCmsBridge';

export const OFFICE_LEDGER_SOURCES = {
  SOHOJKOR:'Sohojkor',
  BRTA:'BRTA',
  E_TDS:'e-TDS',
  IBAS_PLUS_PLUS:'iBAS++',
  NSD:'NSD',
  SUB_REGISTRAR_OFFICE:'Sub-Registrar Office',
  BANK:'Bank',
  SA_CODER:'SA Coder',
} as const;
export type OfficeLedgerSource=keyof typeof OFFICE_LEDGER_SOURCES;
export type OfficeLedgerEntryKind='PAYMENT_RECORD'|'DEDUCTION'|'DEPOSIT'|'CREDIT'|'REVERSAL';
export type OfficeLedgerState='UNVERIFIED'|'PENDING'|'VERIFIED'|'REVERSED';

export type OfficeLedgerLine={
  id:string;taxpayerTin:string;sourceSystem:OfficeLedgerSource;
  sourceRecordId:string;sourceAllocationId:string|null;sourceRevision:number;
  dhara:string|null;paymentSource:string;amountMinor:number;assessmentYear:string|null;
  eventDate:string;originalReference:string|null;entryKind:OfficeLedgerEntryKind;
  financialStatus:OfficeLedgerState;
  sourcePaymentId:string|null;sourceStatus:string|null;
  evidenceSha256:string|null;canonicalCreditReference:string|null;canonicalCreditLineId:string|null;
  reconciliationProvenance:Record<string,unknown>;
};

export type OfficeLedgerReport={
  tin:string;lines:OfficeLedgerLine[];verifiedCreditMinor:number;
  recordedPaymentMinor:number;recordedDeductionMinor:number;allSourceCoverage:OfficeLedgerSource[];
};

const sourceKeys=new Set(Object.keys(OFFICE_LEDGER_SOURCES));
const entryKinds=new Set(['PAYMENT_RECORD','DEDUCTION','DEPOSIT','CREDIT','REVERSAL']);
const states=new Set(['UNVERIFIED','PENDING','VERIFIED','REVERSED']);
const owned=(row:Record<string,unknown>,name:string)=>Object.prototype.hasOwnProperty.call(row,name);
const asOptional=(value:unknown):string|null=>value===null||value===undefined?null:
  typeof value==='string'?value:(()=>{throw new Error('Invalid Office ledger optional source field')})();
function minor(value:unknown):number{
  if(typeof value!=='string'&&typeof value!=='number')throw new Error('Invalid Office ledger amount');
  const str=String(value);
  if(!/^(0|[1-9][0-9]*)$/.test(str))throw new Error('Invalid Office ledger amount');
  const n=Number(str);
  if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid Office ledger amount');
  return n;
}
function required(value:unknown):string{
  if(typeof value!=='string'||!value.trim())throw new Error('Missing Office ledger source identity');
  return value;
}
function validTin(tin:string):boolean{return /^\d{12}$/.test(tin);}
function sourceCode(value:unknown):OfficeLedgerSource{
  if(typeof value!=='string'||!sourceKeys.has(value))throw new Error('Unknown Office ledger payment source');
  return value as OfficeLedgerSource;
}

export function readOfficeLedgerLine(value:unknown,tin:string):OfficeLedgerLine{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid Office ledger line');
  const row=value as Record<string,unknown>;
  if(!validTin(tin)||row.taxpayerTin!==tin)throw new Error('Office ledger taxpayer does not match requested TIN');
  const sourceSystem=sourceCode(row.sourceSystem);
  const sourceRecordId=required(row.sourceRecordId);
  const sourceAllocationId=asOptional(row.sourceAllocationId);
  const sourceRevision=Number(row.sourceRevision);
  const entryKind=row.entryKind;
  const financialStatus=row.financialStatus;
  if(!Number.isSafeInteger(sourceRevision)||sourceRevision<=0||
    !entryKinds.has(String(entryKind))||!states.has(String(financialStatus))||
    !owned(row,'dhara')||!owned(row,'assessmentYear')||!owned(row,'reconciliationProvenance')||
    !Number.isFinite(Date.parse(String(row.eventDate))))throw new Error('Invalid Office ledger provenance');
  const dhara=asOptional(row.dhara);
  const amountMinor=minor(row.amountMinor);
  const sourcePaymentId=asOptional(row.sourcePaymentId);
  const sourceStatus=asOptional(row.sourceStatus);
  const evidenceSha256=asOptional(row.evidenceSha256);
  const canonicalCreditReference=asOptional(row.canonicalCreditReference);
  const canonicalCreditLineId=asOptional(row.canonicalCreditLineId);
  const evidence=row.reconciliationProvenance;
  if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))throw new Error('Invalid Office ledger reconciliation provenance');
  if(financialStatus==='VERIFIED'&&sourceSystem!=='SOHOJKOR'&&
    (!dhara||!evidenceSha256||! /^[0-9a-f]{64}$/.test(evidenceSha256)||
     !required(evidence.officialSourceRecordId)||!required(evidence.verifiedAt)))
    throw new Error('Verified Office ledger row has incomplete official evidence');
  if(entryKind==='CREDIT'&&financialStatus==='VERIFIED'&&
    (!canonicalCreditReference||!canonicalCreditLineId||sourceSystem==='SOHOJKOR'))
    throw new Error('Unverified Office ledger credit attribution');
  return {
    id:sourceSystem+':'+sourceRecordId+':'+(sourceAllocationId??'')+':'+sourceRevision,
    taxpayerTin:tin,sourceSystem,sourceRecordId,sourceAllocationId,sourceRevision,
    dhara,paymentSource:required(row.paymentSource),amountMinor,
    assessmentYear:asOptional(row.assessmentYear),eventDate:String(row.eventDate),
    originalReference:asOptional(row.originalReference),
    entryKind:entryKind as OfficeLedgerEntryKind,
    financialStatus:financialStatus as OfficeLedgerState,
    sourcePaymentId,sourceStatus,evidenceSha256,canonicalCreditReference,canonicalCreditLineId,
    reconciliationProvenance:evidence as Record<string,unknown>,
  };
}

export function reconcileOfficeLedger(tin:string,rawItems:readonly unknown[],creditMinor:unknown):OfficeLedgerReport{
  if(!validTin(tin))throw new Error('A valid 12-digit taxpayer TIN is required');
  const lines=rawItems.map(item=>readOfficeLedgerLine(item,tin));
  const seen=new Set<string>();
  const verifiedCreditIds=new Set<string>();
  let recordedPaymentMinor=0,recordedDeductionMinor=0,localVerifiedCredit=0;
  for(const line of lines){
    const identity=line.sourceSystem+':'+line.sourceRecordId+':'+(line.sourceAllocationId??'');
    if(seen.has(identity))throw new Error('Duplicate Office ledger source allocation; reload');
    seen.add(identity);
    if(line.entryKind==='PAYMENT_RECORD'||line.entryKind==='DEPOSIT'){
      recordedPaymentMinor+=line.amountMinor;
    }else if(line.entryKind==='DEDUCTION'){
      recordedDeductionMinor+=line.amountMinor;
    }else if(line.entryKind==='CREDIT'&&line.financialStatus==='VERIFIED'){
      const creditId=line.canonicalCreditReference+':'+line.canonicalCreditLineId;
      if(verifiedCreditIds.has(creditId))throw new Error('Duplicate official credit reference');
      verifiedCreditIds.add(creditId);
      localVerifiedCredit+=line.amountMinor;
    }
    if(!Number.isSafeInteger(recordedPaymentMinor)||!Number.isSafeInteger(recordedDeductionMinor)||
       !Number.isSafeInteger(localVerifiedCredit))throw new Error('Office ledger total exceeds safe precision');
  }
  const verifiedCreditMinor=minor(creditMinor);
  if(localVerifiedCredit!==verifiedCreditMinor)throw new Error('Official credit total does not reconcile');
  return {
    tin,lines,verifiedCreditMinor,recordedPaymentMinor,recordedDeductionMinor,
    allSourceCoverage:[...new Set(lines.map(line=>line.sourceSystem))],
  };
}

/** Uses Office Auth ONLY. The server RPC also enforces active officer roles.
 * Never use Taxpayer Auth, public Story1 history or sample TINs to authorize.
 */
export async function loadOfficeConsolidatedLedger(tin:string):Promise<OfficeLedgerReport>{
  if(!validTin(tin))throw new Error('A valid 12-digit taxpayer TIN is required');
  const db=getOfficeCmsAuthClient();
  const {data:identity,error:authError}=await db.auth.getUser();
  if(authError||!identity.user||identity.user.is_anonymous)throw new Error('Verified Office officer sign-in is required');
  const officerUid=identity.user.id;
  const all:unknown[]=[];
  const pageSize=200;
  let reportedCredit:string|number|null=null;
  let finished=false;
  for(let offset=0;offset<100000;offset+=pageSize){
    const {data,error}=await db.rpc('payment_v1_office_guarded_taxpayer_ledger',{
      p_taxpayer_tin:tin,p_limit:pageSize,p_offset:offset,
    });
    if(error)throw new Error(error.code==='42501'
      ?'Active authorized Office payment officer required'
      :'Office ledger unavailable: '+error.message);
    if(!data||typeof data!=='object'||!Array.isArray(data.items)||
       data.limit!==pageSize||data.offset!==offset||data.items.length>pageSize||
       data.mirroredSohojkorCreditVerified!==false)
      throw new Error('Invalid authorized Office ledger response');
    const credit=data.verifiedExternalCreditMinor;
    if(reportedCredit!==null&&String(reportedCredit)!==String(credit))
      throw new Error('Office credit source changed during read; retry');
    reportedCredit=credit;
    all.push(...data.items);
    if(data.items.length<pageSize){finished=true;break;}
  }
  if(!finished)throw new Error('Office ledger exceeds supported retrieval limit');
  const {data:rechecked,error:recheckError}=await db.auth.getUser();
  if(recheckError||rechecked.user?.id!==officerUid)throw new Error('Office officer session changed during ledger read');
  return reconcileOfficeLedger(tin,all,reportedCredit??'0');
}
