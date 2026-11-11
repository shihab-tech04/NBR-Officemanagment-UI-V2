import type {TaxpayerRegistrationProfile,RegistrationField} from './officeTaxpayerRegistrationProfiles';
type Language='en'|'bn';
const groups:ReadonlyArray<{title:readonly [string,string],fields:readonly [RegistrationField,readonly [string,string]][]}>= [
 {title:['Personal information','ব্যক্তিগত তথ্য'],fields:[
   ['taxpayerStatus',['Taxpayer class','করদাতার শ্রেণি']],
   ['tinSubtype',['TIN classification','টিআইএন শ্রেণি']],
   ['userType',['User type','ব্যবহারকারীর ধরন']],
   ['localTaxpayer',['Local taxpayer','স্থানীয় করদাতা']],
 ]},
 {title:['TIN registration and jurisdiction','টিআইএন নিবন্ধন ও কর অধিক্ষেত্র'],fields:[
   ['taxesZone',['Taxes zone','কর অঞ্চল']],
   ['taxesRange',['Taxes range','কর রেঞ্জ']],
   ['district',['District','জেলা']],
   ['country',['Country','দেশ']],
   ['previousTin',['Previous TIN','পূর্ববর্তী টিআইএন']],
 ]},
 {title:['Contact and addresses','যোগাযোগ ও ঠিকানা'],fields:[
   ['mobileNumber',['Mobile number','মোবাইল নম্বর']],
   ['emailAddress',['Email address','ইমেইল ঠিকানা']],
   ['registeredAddress',['Registered / permanent address','নিবন্ধিত / স্থায়ী ঠিকানা']],
   ['currentAddress',['Current address','বর্তমান ঠিকানা']],
 ]},
 {title:['Certificate details','সনদের তথ্য'],fields:[
   ['certificateIssuedOn',['Certificate issue date','সনদ ইস্যুর তারিখ']],
   ['certificateLastUpdatedOn',['Certificate last updated','সনদ সর্বশেষ হালনাগাদ']],
   ['issuingOfficer',['Issuing tax officer','সনদ ইস্যুকারী কর কর্মকর্তা']],
   ['taxOfficeAddress',['Tax office address','কর অফিসের ঠিকানা']],
   ['taxOfficePhone',['Tax office phone','কর অফিসের ফোন']],
 ]},
];
export function OfficeTaxpayerRegistrationDetails({record,language}:{
 record:TaxpayerRegistrationProfile;language:Language
}){
 const bn=language==='bn',tr=(t:readonly [string,string])=>t[bn?1:0];
 const field=(key:RegistrationField)=>record.profile[key]||'—';
 const section=(entry:typeof groups[number])=><section key={entry.title[0]} className="card payment-module__card">
   <h3>{tr(entry.title)}</h3>
   <dl className="payment-module__identity-grid" style={{padding:0}}>
    {entry.fields.map(([key,label])=><div key={key}><dt className="payment-module__field-label">{tr(label)}</dt>
      <dd style={{overflowWrap:'anywhere'}}>{field(key)}</dd></div>)}
   </dl>
  </section>;
 return <div data-testid="office-taxpayer-registration-profile" aria-label={tr(['Taxpayer information','করদাতার তথ্য'])}>
    <section className="card payment-module__card">
      <h3>{tr(['Taxpayer profile','করদাতার প্রোফাইল'])}</h3>
      <dl className="payment-module__identity-grid" style={{padding:0}}>
        {([
          ['taxpayerName',['Registered name','নিবন্ধিত নাম']],
          ['tin',['TIN','টিআইএন']],
          ['tinType',['TIN type','টিআইএন ধরন']],
          ['taxesCircle',['Taxes circle','কর সার্কেল']],
          ['registeredOn',['Registered since','নিবন্ধিত হওয়ার তারিখ']],
        ] as const).map(([key,label])=><div key={key}><dt className="payment-module__field-label">{tr(label)}</dt>
          <dd style={{overflowWrap:'anywhere'}}>{field(key)}</dd></div>)}
      </dl>
    </section>
    <div className="payment-dashboard__grid">{groups.map(section)}</div>
    <section className="card payment-module__card">
     <h3>{tr(['Account information','অ্যাকাউন্টের তথ্য'])}</h3>
     <dl className="payment-module__identity-grid" style={{padding:0}}>
       <div><dt className="payment-module__field-label">{tr(['Last account login','সর্বশেষ লগইন'])}</dt>
         <dd>{field('lastLoginAt')}</dd></div>
     </dl>
    </section>
  </div>;
}
