import {useState} from 'react';
import {Check,Copy,Eye,EyeOff} from 'lucide-react';
import type {TaxpayerRegistrationProfile,RegistrationField} from './officeTaxpayerRegistrationProfiles';

type Language='en'|'bn';
type Label=readonly [string,string];
type Field=readonly [RegistrationField,Label];

/** Approved Taxpayer 24-field grouping; no new certificate or registration fields. */
const identity:readonly Field[]=[
 ['taxpayerName',['Name','নাম']],['tin',['TIN','টিআইএন']],
];
const summary:readonly Field[]=[
 ['tinType',['TIN type','টিআইএন ধরন']],
 ['taxesCircle',['Taxes circle','কর সার্কেল']],
 ['registeredOn',['Registered since','নিবন্ধিত হওয়ার তারিখ']],
 ['lastLoginAt',['Last account login','সর্বশেষ লগইন']],
];
const personal:readonly Field[]=[
 ['taxpayerStatus',['Taxpayer status','করদাতার অবস্থা']],
 ['tinSubtype',['TIN classification','টিআইএন শ্রেণি']],
 ['userType',['User type','ব্যবহারকারীর ধরন']],
 ['localTaxpayer',['Local taxpayer','স্থানীয় করদাতা']],
];
const contact:readonly Field[]=[
 ['mobileNumber',['Mobile number','মোবাইল নম্বর']],
 ['emailAddress',['Email address','ইমেইল ঠিকানা']],
 ['registeredAddress',['Registered / permanent address','নিবন্ধিত / স্থায়ী ঠিকানা']],
 ['currentAddress',['Current address','বর্তমান ঠিকানা']],
];
const jurisdiction:readonly Field[]=[
 ['taxesZone',['Taxes zone','কর অঞ্চল']],
 ['taxesRange',['Taxes range','কর রেঞ্জ']],
 ['district',['District','জেলা']],
 ['country',['Country','দেশ']],
];
const certificate:readonly Field[]=[
 ['previousTin',['Previous TIN','পূর্ববর্তী টিআইএন']],
 ['certificateIssuedOn',['Certificate issue date','সনদ ইস্যুর তারিখ']],
 ['certificateLastUpdatedOn',['Certificate last updated','সনদ সর্বশেষ হালনাগাদ']],
 ['issuingOfficer',['Issuing tax officer','সনদ ইস্যুকারী কর কর্মকর্তা']],
 ['taxOfficeAddress',['Tax office address','কর অফিসের ঠিকানা']],
 ['taxOfficePhone',['Tax office phone','কর অফিসের ফোন']],
];
const sensitiveFields=new Set<RegistrationField>(['tin','previousTin','mobileNumber','emailAddress','taxOfficePhone']);

/** Match Taxpayer's reviewed-source mask contract: no suffix digits or private email domain. */
export function maskOfficeProfileValue(input:string,kind:'tin'|'phone'|'email'='tin'):string{
 const value=input.trim();
 if(!value)return '—';
 if(kind==='email'){
  const at=value.indexOf('@');
  if(at<1)return '****';
  const local=value.slice(0,at);
  return local.slice(0,2)+'*'.repeat(Math.max(3,local.length-2))+'@****.***';
 }
 const digitCount=value.match(/[0-9]/g)?.length??0;
 const visibleDigits=digitCount>3?3:0;
 let seen=0;
 return [...value].map(char=>{
  if(!/[0-9]/.test(char))return char;
  seen++;
  return seen<=visibleDigits?char:'*';
 }).join('');
}
function sensitiveKind(field:RegistrationField,value:string):'tin'|'phone'|'email'|null{
 if((field==='tin'||field==='previousTin')&&(value.match(/[0-9]/g)?.length??0)>=8)return 'tin';
 if((field==='mobileNumber'||field==='taxOfficePhone')&&(value.match(/[0-9]/g)?.length??0)>=6)return 'phone';
 if(field==='emailAddress'&&/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(value))return 'email';
 return null;
}
function ProtectedOfficeValue({raw,label,language,kind}:{raw:string;label:string;language:Language;kind:'tin'|'phone'|'email'}){
 const [revealed,setRevealed]=useState(false);
 const [copied,setCopied]=useState(false);
 const bn=language==='bn';
 return <span style={{display:'inline-flex',alignItems:'center',flexWrap:'wrap',gap:4,minWidth:0}}>
   <span style={{overflowWrap:'anywhere'}}>{revealed?raw:maskOfficeProfileValue(raw,kind)}</span>
   <button type="button" aria-label={(revealed?(bn?'লুকান ':'Hide '):(bn?'দেখুন ':'Reveal '))+label}
     aria-pressed={revealed} title={revealed?(bn?'লুকান':'Hide'):(bn?'দেখুন':'Reveal')}
     className="table-card__toolbar-btn" style={{minHeight:36,minWidth:36,padding:6,display:'inline-flex',justifyContent:'center'}}
     onClick={()=>{setRevealed(value=>!value);setCopied(false);}}>
     {revealed?<EyeOff size={16} aria-hidden="true"/>:<Eye size={16} aria-hidden="true"/>}
   </button>
   <button type="button" aria-label={(bn?'কপি করুন ':'Copy ')+label} title={bn?'কপি করুন':'Copy'}
     className="table-card__toolbar-btn" style={{minHeight:36,minWidth:36,padding:6,display:'inline-flex',justifyContent:'center'}}
     onClick={async()=>{try{await navigator.clipboard.writeText(raw);setCopied(true);}catch{setCopied(false);}}}>
     {copied?<Check size={16} aria-hidden="true"/>:<Copy size={16} aria-hidden="true"/>}
   </button>
   {copied&&<span role="status" style={{fontSize:12}}>{bn?'কপি হয়েছে':'Copied'}</span>}
 </span>;
}

export function OfficeTaxpayerRegistrationDetails({record,language}:{
 record:TaxpayerRegistrationProfile;language:Language
}){
 const bn=language==='bn';
 const tr=(value:Label)=>value[bn?1:0];
 const fieldValue=(field:RegistrationField)=>record.profile[field]?.trim()||null;
 const renderFields=(fields:readonly Field[])=>(
  <dl className="payment-module__identity-grid" style={{padding:0}}>
   {fields.map(([field,label])=>{
    const raw=fieldValue(field);
    return <div key={field} data-registration-field={field}>
      <dt className="payment-module__field-label">{tr(label)}</dt>
      <dd style={{overflowWrap:'anywhere'}}>
       {raw===null?(bn?'পাওয়া যায়নি':'Not available'):
        sensitiveFields.has(field)&&sensitiveKind(field,raw)?
         <ProtectedOfficeValue key={field+':'+raw} raw={raw} label={tr(label)} language={language} kind={sensitiveKind(field,raw)!}/>:
         raw}
      </dd>
    </div>;
   })}
  </dl>
 );
 const panel=(title:Label,fields:readonly Field[])=>
  <section className="card payment-module__card">
   <h3>{tr(title)}</h3>
   {renderFields(fields)}
  </section>;
 return <div data-testid="office-taxpayer-registration-profile"
    aria-label={tr(['Taxpayer information','করদাতার তথ্য'])}>
    {panel(['Taxpayer profile','করদাতার প্রোফাইল'],identity)}
    {panel(['Profile summary','প্রোফাইলের সারসংক্ষেপ'],summary)}
    <div className="payment-dashboard__grid">
     {panel(['Personal information','ব্যক্তিগত তথ্য'],personal)}
     {panel(['TIN registration and jurisdiction','টিআইএন নিবন্ধন ও কর অধিক্ষেত্র'],jurisdiction)}
     {panel(['Contact and addresses','যোগাযোগ ও ঠিকানা'],contact)}
     {panel(['Certificate details','সনদের তথ্য'],certificate)}
    </div>
 </div>;
}
