import type { StoryPayment } from './story1OfficeApi';

/** Exactly the TaxPay service codes; labels are presentation only, never legal findings. */
export const paymentServiceName:Record<string,string>={
  TAX_WITH_RETURN:'Tax with Return',
  ADVANCE_TAX:'Advance Tax',
  ASSESSED_DEMAND:'Assessed/Demand Tax',
  PENALTY:'Penalty Payment',
  SOURCE_TAX_DEPOSIT:'Source Tax Deposit',
  APPELLATE_TRIBUNAL:'Appellate Tribunal Payment',
  OTHER_TAX_PAYMENT:'Other Tax Payment',
  TRAVEL_TAX:'Travel Tax',
};
const methodLabels:Record<string,string>={
  BKASH:'bKash',NAGAD:'Nagad',ROCKET:'Rocket',
  SONALI_E_SHEBA:'Sonali e-Sheba',INTERNET_BANKING:'Internet Banking',
  BEFTN_RTGS:'BEFTN / RTGS',VISA:'Visa',MASTERCARD:'Mastercard',
  BANK_BRANCH:'Bank branch',NOW:'Pay online',OTC:'Bank branch',
  SIMULATED:'Simulated payment',A_CHALLAN_CARD:'Card',
};
const money=(amount:number)=>'৳'+new Intl.NumberFormat('en-BD',{maximumFractionDigits:2}).format(amount);
type PaymentHead={
  headId?:number;headNameEn?:string;economicCode?:string;
  taxAmount?:number;penaltyAmount?:number;surchargeAmount?:number;
  interestAmount?:number;totalAmount?:number;note?:string;
};
function isHead(value:unknown):value is PaymentHead{
  return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
}
const nonempty=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():undefined;
const known=(value:unknown)=>nonempty(value)&&!['Taxpayer / withholding agent','GUEST','—'].includes(String(value))?String(value).trim():undefined;
export const storyFieldLabels:Record<string,string>={
  taxpayer_name:'Taxpayer',tin:'TIN',payer_name:'Payer',
  payment_type:'Service',date:'Date',assessment_year:'Assessment year',
  amount:'Amount',financial_receipt_status:'Payment status',
  ledger_status:'Tax credit status',payment_channel:'Payment method',
  payment_ref:'Transaction ID',acs_reference:'Receipt reference',
  zone:'Tax zone',circle:'Tax circle',receipt_mobile:'Receipt mobile',
  notice_reference:'Notice reference',payer_mode:'Payment for',
  income_tax_type:'Income tax type',travel_route:'Travel route',
  travel_date:'Travel date',passenger_name:'Passenger',
  passport_number:'Passport number (masked)',
  beneficiary_count:'Beneficiaries',authorization_references:'Authorization IDs',
  payer_beneficiary_audit:'Payer to beneficiary allocations',payment_lines:'Allocation details',
};
export function storyDetailLabel(key:string):string{
  const match=/^head_(\d+)_(name|code|tax|penalty|surcharge|interest|total|note)$/.exec(key);
  if(match){
    const labels:Record<string,string>={name:'Payment head',code:'Economic code',tax:'Tax',penalty:'Penalty',surcharge:'Surcharge',interest:'Interest',total:'Head total',note:'Description'};
    return labels[match[2]]+' '+match[1];
  }
  return storyFieldLabels[key]??key.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase());
}
export function storyGroup(key:string):string {
  if(key.startsWith('head_'))return 'Payment heads & amount breakdown';
  if(['taxpayer_name','tin','payer_name','payer_mode','receipt_mobile','passenger_name','passport_number','beneficiary_count'].includes(key))return 'Taxpayer & payer';
  if(['payment_type','date','assessment_year','amount','payment_channel','income_tax_type','travel_route','travel_date','zone','circle'].includes(key))return 'Payment information';
  if(['financial_receipt_status','ledger_status'].includes(key))return 'Payment status';
  return 'References';
}
export function toStoryPaymentRow(tx:StoryPayment){
  const d=tx.details??{};
  const allocations=Array.isArray(d.lines)?d.lines.filter(
    line=>typeof line.beneficiary==='string'&&/^user([1-9]|10)$/.test(line.beneficiary)
  ):[];
  const recipients=Array.from(new Set(allocations.map(line=>line.beneficiary!)));
  const tinFor=(id:string)=>id==='user10'?'1010101010101':id.replace('user','').repeat(13);
  const actor=nonempty(d.payerId)||known(d.payerName);
  const method=nonempty(d.paymentMethod)||nonempty(d.paymentChannel);
  const taxpayerName=recipients.length?recipients.join(', '):
    known(d.taxpayerName)||(d.payerMode==='OTHER'?undefined:known(d.payerName));
  const taxpayerTin=recipients.length?recipients.map(tinFor).join(', '):nonempty(d.taxpayerTin);
  const date=new Date(tx.createdAt);
  const lines:Array<PaymentHead>=Array.isArray(d.lines)?d.lines.filter(isHead):[];
  const breakdown:Record<string,string>={};
  lines.forEach((line,i)=>{
    const prefix='head_'+(i+1)+'_';
    const name=nonempty(line.headNameEn);
    if(name)breakdown[prefix+'name']=name;
    if(nonempty(line.economicCode))breakdown[prefix+'code']=String(line.economicCode);
    for(const key of ['taxAmount','penaltyAmount','surchargeAmount','interestAmount','totalAmount'] as const){
      if(typeof line[key]==='number'&&Number.isFinite(line[key])){
        const label=key==='taxAmount'?'tax':key==='penaltyAmount'?'penalty':key==='surchargeAmount'?'surcharge':key==='interestAmount'?'interest':'total';
        breakdown[prefix+label]=money(line[key]);
      }
    }
    if(nonempty(line.note))breakdown[prefix+'note']=String(line.note);
  });
  return {
    key:tx.id,
    date:Number.isNaN(date.getTime())?'—':date.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).replace(/\bSept\b/,'Sep'),
    taxpayer_name:taxpayerName??(taxpayerTin?'TIN '+taxpayerTin:'—'),
    tin:taxpayerTin??'—',
    payer_name:actor??'—',
    payment_type:allocations.length?Array.from(new Set(allocations.map(
      line=>paymentServiceName[line.category||'']??line.category??tx.service))).join(', '):
      paymentServiceName[tx.service]??tx.service,
    assessment_year:allocations.length?Array.from(new Set(allocations.map(
      line=>line.assessmentYear||'—'))).join(', '):nonempty(d.assessmentYear)??'—',
    amount:money(tx.amountMinor/100),
    financial_receipt_status:tx.status==='SIMULATED_SUCCESS'?'Simulated success':tx.status.replace(/_/g,' '),
    ledger_status:'No official tax credit',
    ...(method?{payment_channel:methodLabels[method]??method.replace(/_/g,' ')}:{}),
    payment_ref:tx.id,
    ...(nonempty(d.receiptReference)?{acs_reference:d.receiptReference}:{}),
    ...(nonempty(d.taxZone)?{zone:d.taxZone}:{}),
    ...(nonempty(d.taxCircle)?{circle:d.taxCircle}:{}),
    ...(nonempty(d.receiptMobile)?{receipt_mobile:d.receiptMobile}:{}),
    ...(nonempty(d.noticeReference)?{notice_reference:d.noticeReference}:{}),
    ...(nonempty(d.payerMode)?{payer_mode:d.payerMode==='SELF'?'My own tax':d.payerMode==='OTHER'?"Someone else's tax":d.payerMode}:{}),
    ...(nonempty(d.incomeTaxType)?{income_tax_type:d.incomeTaxType==='NON_COMPANY'?'Person other than company':d.incomeTaxType==='COMPANY'?'Company':d.incomeTaxType}:{}),
    ...(nonempty(d.travelRoute)?{travel_route:d.travelRoute}:{}),
    ...(nonempty(d.travelDate)?{travel_date:d.travelDate}:{}),
    ...(nonempty(d.passengerName)?{passenger_name:d.passengerName}:{}),
    ...(tx.service==='TRAVEL_TAX'?{passport_number:nonempty(d.passportNumberMasked)??'—'}:{}),
    ...(allocations.length?{
      beneficiary_count:recipients.length,
      authorization_references:allocations.map(line=>line.authorizationId||'Self payment').join(', '),
      payer_beneficiary_audit:allocations.map(line=>
        `${actor??'—'} paid for ${line.beneficiary}: ${money((line.amountMinor||0)/100)} · ${line.category||tx.service} · authorization ${line.authorizationId||'self'}`).join(' | '),
      payment_lines:JSON.stringify(allocations),
    }:{}),
    ...breakdown,
  };
}
