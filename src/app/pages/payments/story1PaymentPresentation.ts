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
  SIMULATED:'Payment',A_CHALLAN_CARD:'Card',
};
const money=(amount:number)=>'৳'+new Intl.NumberFormat('en-BD',{maximumFractionDigits:2}).format(amount);
const moneyMinor=(minor:unknown)=>{
  if(typeof minor!=='number'||!Number.isSafeInteger(minor)||minor<0)return '—';
  const whole=Math.floor(minor/100);
  const fraction=minor%100;
  return '৳'+new Intl.NumberFormat('en-BD').format(whole)+
    (fraction ? '.'+String(fraction).padStart(2,'0').replace(/0$/,'') : '');
};
type PaymentHead={
  headId?:number;headNameEn?:string;economicCode?:string;
  amountMinor?:number;taxAmount?:number;penaltyAmount?:number;surchargeAmount?:number;
  interestAmount?:number;totalAmount?:number;note?:string;
};
function isHead(value:unknown):value is PaymentHead{
  return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
}
const nonempty=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():undefined;
const known=(value:unknown)=>nonempty(value)&&!['Taxpayer / withholding agent','GUEST','—'].includes(String(value))?String(value).trim():undefined;
const demoTinFor=(id:string)=>id==='user10'?'1010101010101':id.replace('user','').repeat(13);
const safeMinorTotal=(amounts:unknown[]):number|null=>{
  let sum=0;
  for(const amount of amounts){
    if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<=0)return null;
    sum+=amount;
    if(!Number.isSafeInteger(sum))return null;
  }
  return sum;
};
type StoryAllocation=NonNullable<NonNullable<StoryPayment['details']>['allocations']>[number];
const validExplicitAllocation=(line:StoryAllocation)=>
  Boolean(line)&&typeof line==='object'&&!Array.isArray(line)&&
  typeof line.taxpayerTin==='string'&&/^\d{12,13}$/.test(line.taxpayerTin)&&
  typeof line.headId==='number'&&Number.isSafeInteger(line.headId)&&line.headId>0&&
  typeof line.assessmentYear==='string'&&Boolean(line.assessmentYear.trim());
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
    line=>line&&typeof line==='object'&&!Array.isArray(line)&&typeof line.beneficiary==='string'&&/^user([1-9]|10)$/.test(line.beneficiary)
  ):[];
  const recipients=Array.from(new Set(allocations.map(line=>line.beneficiary!)));
  const explicit=Array.isArray(d.allocations)?d.allocations:[];
  const validExplicit=explicit.length>0&&explicit.every(validExplicitAllocation)&&
    safeMinorTotal(explicit.map(line=>line.amountMinor))===tx.amountMinor;
  const explicitTins=validExplicit?Array.from(new Set(explicit.map(line=>line.taxpayerTin!))):[];
  const actor=nonempty(d.payerId)||known(d.payerName);
  const method=nonempty(d.paymentMethod)||nonempty(d.paymentChannel);
  const taxpayerName=recipients.length?recipients.join(', '):explicitTins.length?
    explicitTins.map(tin=>nonempty(explicit.find(line=>line.taxpayerTin===tin)?.taxpayerName)||'TIN '+tin).join(', '):
    known(d.taxpayerName)||(d.payerMode==='OTHER'?undefined:known(d.payerName));
  const taxpayerTin=recipients.length?recipients.map(demoTinFor).join(', '):
    explicitTins.length?explicitTins.join(', '):nonempty(d.taxpayerTin);
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
        breakdown[prefix+label]=key==='totalAmount'&&typeof line.amountMinor==='number'
          ? moneyMinor(line.amountMinor) : money(line[key]);
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
      line=>line.assessmentYear||'—'))).join(', '):explicitTins.length?
      Array.from(new Set(explicit.map(line=>line.assessmentYear||'—'))).join(', '):nonempty(d.assessmentYear)??'—',
    amount:moneyMinor(tx.amountMinor),
    financial_receipt_status:tx.status==='SIMULATED_SUCCESS'?'Recorded':tx.status.replace(/_/g,' '),
    ledger_status:'Tax credit not verified',
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
        `${actor??'—'} paid for ${line.beneficiary}: ${moneyMinor(line.amountMinor)} · ${line.category||tx.service} · authorization ${line.authorizationId||'self'}`).join(' | '),
      payment_lines:JSON.stringify(allocations),
    }:{}),
    ...breakdown,
  };
}

/** Project a mirrored simulation to one taxpayer and, when selected, one year.
 * An invalid or unreconciled allocation is hidden rather than attributed to a
 * different taxpayer. This is a display projection, not a tax-credit ledger. */
export function toStoryTaxpayerPaymentRow(tx:StoryPayment,tin:string,scopeYear='all') {
  if(!/^\d{12,13}$/.test(tin)||!Number.isSafeInteger(tx.amountMinor)||tx.amountMinor<=0)return null;
  const d=tx.details??{};
  if(d.lines!==undefined&&!Array.isArray(d.lines))return null;
  if(d.allocations!==undefined&&!Array.isArray(d.allocations))return null;
  const lines=Array.isArray(d.lines)?d.lines:[];
  if(lines.some(line=>!line||typeof line!=='object'||Array.isArray(line)))return null;
  const hasSyntheticLines=lines.some(line=>line.beneficiary!==undefined);
  const explicit=Array.isArray(d.allocations)?d.allocations:[];
  if(Array.isArray(d.allocations)&&!explicit.length)return null;
  // The two allocation shapes have no established cross-format identity
  // contract. Do not guess if a record contains both.
  if(hasSyntheticLines&&explicit.length)return null;
  const yearMatches=(year:unknown)=>scopeYear==='all'||(typeof year==='string'&&year.replace('–','-')===scopeYear);
  if(hasSyntheticLines){
    if(lines.some(line=>typeof line.beneficiary!=='string'||!/^user([1-9]|10)$/.test(line.beneficiary)))return null;
    if(safeMinorTotal(lines.map(line=>line.amountMinor))!==tx.amountMinor)return null;
    const own=lines.filter(line=>demoTinFor(line.beneficiary!)===tin&&yearMatches(line.assessmentYear));
    if(!own.length)return null;
    const amount=safeMinorTotal(own.map(line=>line.amountMinor));
    if(amount===null)return null;
    return toStoryPaymentRow({...tx,amountMinor:amount,details:{...d,taxpayerTin:tin,lines:own}});
  }
  if(explicit.length){
    if(!explicit.every(validExplicitAllocation))return null;
    if(safeMinorTotal(explicit.map(line=>line.amountMinor))!==tx.amountMinor)return null;
    const own=explicit.filter(line=>line.taxpayerTin===tin&&yearMatches(line.assessmentYear));
    if(!own.length)return null;
    const amount=safeMinorTotal(own.map(line=>line.amountMinor));
    if(amount===null)return null;
    const ownLines=own.map(line=>{
      const head=lines.find(item=>item.headId===line.headId);
      return {headId:line.headId,headNameEn:head?.headNameEn,economicCode:head?.economicCode,
        amountMinor:line.amountMinor,totalAmount:line.amountMinor!/100,note:line.assessmentYear};
    });
    const years=Array.from(new Set(own.map(line=>line.assessmentYear))).join(', ');
    const name=own.map(line=>nonempty(line.taxpayerName)).find(Boolean);
    return toStoryPaymentRow({...tx,amountMinor:amount,details:{...d,taxpayerTin:tin,taxpayerName:name,
      assessmentYear:years,lines:ownLines,allocations:own}});
  }
  if(d.taxpayerTin!==tin||!yearMatches(d.assessmentYear))return null;
  return toStoryPaymentRow(tx);
}
