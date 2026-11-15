import {useEffect,useMemo,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {GenPage} from '../../../components/pages/GeneratedTablePage';
import type {PageCfg,KpiDef} from '../../modulePageUtils';
import {TIN_NAME,fc,BASE_FILTERS} from '../../modulePageUtils';
import {ROW_VIEW,VIEW} from '../../../data/modulePageConfigs';
import {getStoryPayments,type StoryPayment} from '../../payments/story1OfficeApi';
import {officeMoney} from '../../payments/officeTransactionDetails';
import {projectMirroredTaxLedgerRows} from '../../payments/taxLedgerProjection';
import {OfficeConsolidatedTaxpayerLedger} from '../../payments/OfficeConsolidatedTaxpayerLedger';

export function TaxpayerLedgerPage(){
  const {i18n}=useTranslation();
  const bn=i18n.resolvedLanguage?.startsWith('bn')??false;
  const t=(english:string,bengali:string)=>bn?bengali:english;
  const [records,setRecords]=useState<StoryPayment[]>([]);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const [ledgerTin,setLedgerTin]=useState('');
  const [openedLedgerTin,setOpenedLedgerTin]=useState('');
  useEffect(()=>{
    let active=true;
    async function load(){
      if(!active)return;
      setBusy(true);
      try {
        const payments=await getStoryPayments();
        if(active){setRecords(payments);setError('');}
      } catch(e) {
        if(active)setError(e instanceof Error?e.message:'Unable to read payment records');
      } finally {
        if(active)setBusy(false);
      }
    }
    void load();
    const timer=window.setInterval(()=>void load(),60000);
    return()=>{active=false;window.clearInterval(timer);};
  },[revision]);
  const rows=useMemo(()=>projectMirroredTaxLedgerRows(records),[records]);
  const totalMinor=useMemo(()=>records.reduce((n,p)=>{
    if(!Number.isSafeInteger(p.amountMinor)||p.amountMinor<0||!Number.isSafeInteger(n+p.amountMinor))return NaN;
    return n+p.amountMinor;
  },0),[records]);
  const kpis:KpiDef[]=[
    {label:t('Recorded transactions','নথিভুক্ত লেনদেন'),value:String(records.length),tone:'primary'},
    {label:t('Recorded payment amount','নথিভুক্ত পেমেন্টের পরিমাণ'),
      value:Number.isSafeInteger(totalMinor)?officeMoney(totalMinor,bn?'bn':'en'):'—',tone:'neutral'},
    {label:t('Verified tax credits','যাচাইকৃত কর ক্রেডিট'),value:'—',tone:'neutral'},
    {label:t('Verified remaining balance','যাচাইকৃত অবশিষ্ট ব্যালেন্স'),value:'—',tone:'neutral'}
  ];
  const cfg:PageCfg={
    title:'Taxpayer Ledger',titleKey:'taxpayerLedger.title',
    desc:t('Read-only SQL-mirrored payment records. Treasury settlement, liabilities and credits require verified source events.',
      'SQL থেকে সমন্বিত পেমেন্ট রেকর্ড। ট্রেজারি নিষ্পত্তি, করদায় ও ক্রেডিটের জন্য যাচাইকৃত তথ্য প্রয়োজন।'),
    cols:[
      ...TIN_NAME,
      fc('transaction_date',t('Date','তারিখ'),{headerKey:'headers.date'}),
      fc('particulars',t('Particulars & Economic Code','বিবরণ ও অর্থনৈতিক কোড')),
      fc('amount',t('Recorded amount','নথিভুক্ত পরিমাণ'),{align:'right'}),
      fc('debit',t('Debit (liability)','ডেবিট (দায়)'),{align:'right'}),
      fc('credit',t('Credit (payment)','ক্রেডিট (পরিশোধ)'),{align:'right'}),
      fc('balance',t('Remaining balance','অবশিষ্ট ব্যালেন্স'),{align:'right'}),
      fc('reference',t('Reference','রেফারেন্স'),{headerKey:'headers.refNo'})
    ],
    drawerCols:[
      ...TIN_NAME,
      fc('reference',t('Payment transaction ID','পেমেন্ট লেনদেন আইডি')),
      fc('tax_event_id',t('Tax event ID','কর ঘটনার আইডি')),
      fc('transaction_date',t('Date','তারিখ')),
      fc('payer_name',t('Payer','পরিশোধকারী')),
      fc('payment_type',t('Payment type','পেমেন্টের ধরন')),
      fc('assessment_year',t('Assessment year','করবর্ষ')),
      fc('income_year',t('Income year','আয়বর্ষ')),
      fc('tax_zone',t('Tax zone','কর অঞ্চল')),
      fc('tax_circle',t('Tax circle','কর সার্কেল')),
      fc('payment_channel',t('Channel','মাধ্যম')),
      fc('amount',t('Amount','পরিমাণ')),
      fc('receipt_reference',t('Challan / receipt','চালান / রসিদ')),
      fc('receipt_status',t('Financial receipt status','আর্থিক রসিদের অবস্থা')),
      fc('credit_status',t('Tax-credit status','কর ক্রেডিটের অবস্থা')),
      fc('liability_settled',t('Liability settled','নিষ্পত্তিকৃত করদায়')),
      fc('remaining_balance',t('Remaining balance','অবশিষ্ট ব্যালেন্স')),
      fc('activity_history',t('Activity history','কার্যক্রমের ইতিহাস')),
      fc('where_this_counts',t('Where this payment counts','এই পেমেন্ট কোথায় গণনা হয়')),
      fc('source',t('Source system','উৎস সিস্টেম'))
    ],
    mobileCardMapping:{primary:'name',identifier:'reference',meta:['particulars','transaction_date','status'],date:'transaction_date',amount:'amount'},
    filters:BASE_FILTERS,actions:ROW_VIEW,drawerActions:VIEW,rows,kpis
  };
  return <div className="space-y-3">
    <form className="card flex flex-wrap items-end gap-3 p-4" onSubmit={e=>{
      e.preventDefault();
      setOpenedLedgerTin(/^\d{12}$/.test(ledgerTin.trim())?ledgerTin.trim():'');
    }}>
      <label className="text-sm">{t('Taxpayer TIN for consolidated ledger','সমন্বিত লেজারের জন্য করদাতার টিআইএন')}
        <input value={ledgerTin} onChange={e=>setLedgerTin(e.target.value)} required maxLength={12}
          pattern="[0-9]{12}" inputMode="numeric" autoComplete="off"
          className="mt-1 block min-h-10 rounded-md border px-3"
          aria-label={t('Enter 12-digit taxpayer TIN','১২ সংখ্যার করদাতার টিআইএন দিন')}/>
      </label>
      <button className="table-card__toolbar-btn min-h-10" type="submit">
        {t('Open verified source ledger','যাচাইকৃত উৎস লেজার খুলুন')}
      </button>
      {openedLedgerTin&&<button className="table-card__toolbar-btn min-h-10" type="button" onClick={()=>{
        setOpenedLedgerTin('');setLedgerTin('');
      }}>{t('Close ledger','লেজার বন্ধ করুন')}</button>}
    </form>
    {openedLedgerTin&&<OfficeConsolidatedTaxpayerLedger key={openedLedgerTin} tin={openedLedgerTin}/>}
    {busy&&<p role="status" className="table-page__desc">{t('Synchronizing payment history from SQL…','SQL থেকে পেমেন্ট ইতিহাস সমন্বয় হচ্ছে…')}</p>}
    {error&&<div role="alert" className="table-page__desc">
      {t('Payment history could not be synchronized. Existing rows may be outdated.','পেমেন্ট ইতিহাস সমন্বয় হয়নি। আগের তথ্য পুরোনো হতে পারে।')}
      <button type="button" className="table-card__toolbar-btn ml-2" onClick={()=>setRevision(v=>v+1)}>{t('Retry','আবার চেষ্টা করুন')}</button>
    </div>}
    {!busy&&!error&&records.length===0&&<p role="status" className="table-page__desc">{t('No SQL payment records are available.','SQL-এ কোনো পেমেন্ট রেকর্ড পাওয়া যায়নি।')}</p>}
    <GenPage cfg={cfg}/>
  </div>;
}
