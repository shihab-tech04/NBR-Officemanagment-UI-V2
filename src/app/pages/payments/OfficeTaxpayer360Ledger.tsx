import {useEffect,useMemo,useState} from 'react';
import {AppDateField} from '../../components/forms/AppDateField';
import {SecondaryButton} from '../../components/buttons/SecondaryButton';
import {PaymentRecordList} from './PaymentRecordList';
import {officeMoney} from './officeTransactionDetails';
import {OFFICE_MIRROR_SOURCE,projectOfficeTaxpayer360Ledger} from './officeTaxpayer360LedgerModel';
import type {TaxpayerActivitySnapshot} from './officeTaxpayerActivity';
import type {ColDef,FilterDef,TableRow} from '../modulePageUtils';

/** Read-only display of existing SQL-mirrored, taxpayer-scoped records.
 * This is explicitly NOT an official Taxpayer Ledger until WS3 supplies
 * authority-confirmed Dhara, liability, credit, status and reconciliation. */
export function OfficeTaxpayer360Ledger({snapshot,taxpayerTin,year,language,loading,error,onRetry,onOpen}:{
  snapshot:TaxpayerActivitySnapshot|null;
  taxpayerTin:string;year:string;language:'en'|'bn';
  loading:boolean;error:string;
  onRetry:()=>void;onOpen:(row:TableRow)=>void;
}){
  const bn=language==='bn';
  const t=(english:string,bengali:string)=>bn?bengali:english;
  const [fromDate,setFromDate]=useState('');
  const [toDate,setToDate]=useState('');
  useEffect(()=>{setFromDate('');setToDate('');},[taxpayerTin,year]);
  const invalidRange=Boolean(fromDate&&toDate&&fromDate>toDate);
  const view=useMemo(()=>snapshot
    ?projectOfficeTaxpayer360Ledger(snapshot,taxpayerTin,year,fromDate,toDate)
    :null,[snapshot,taxpayerTin,year,fromDate,toDate]);
  const rows=view?.rows??[];
  // Localize the mirrored state only at the display boundary. Keep underlying
  // source records and taxpayer/amount attribution unchanged.
  const displayedRows=useMemo(()=>rows.map(row=>({
    ...row,
    source_system:row.source_system===OFFICE_MIRROR_SOURCE
      ?(bn?'অফিস SQL পেমেন্ট প্রতিলিপি':OFFICE_MIRROR_SOURCE):row.source_system,
    ledger_stage:row.ledger_stage==='Pending'?(bn?'অপেক্ষমাণ':'Pending')
      :row.ledger_stage==='Failed'?(bn?'ব্যর্থ':'Failed')
      :row.ledger_stage==='Cancelled'?(bn?'বাতিল':'Cancelled')
      :row.ledger_stage==='Unverified'?(bn?'যাচাই হয়নি':'Unverified'):row.ledger_stage,
    credit_status:row.credit_status==='Not verified'?(bn?'যাচাই হয়নি':'Not verified'):row.credit_status,
  })),[view,bn]);
  const years=Array.from(new Set(displayedRows.flatMap(row=>String(row.assessment_year??'')
    .split(',').map(y=>y.trim()).filter(y=>y&&y!=='—')))).sort().reverse();
  const stages=Array.from(new Set(displayedRows.map(row=>String(row.ledger_stage??''))
    .filter(Boolean))).sort();
  const filters:FilterDef[]=[
    {key:'source_system',label:t('Source','উৎস'),type:'select',options:['All',bn?'অফিস SQL পেমেন্ট প্রতিলিপি':OFFICE_MIRROR_SOURCE]},
    {key:'dhara',label:t('Dhara (section)','ধারা'),type:'select',options:['All']},
    {key:'assessment_year',label:t('Assessment year','করবর্ষ'),type:'select',options:['All',...years]},
    {key:'ledger_stage',label:t('Record stage','রেকর্ডের অবস্থা'),type:'select',options:['All',...stages]}
  ];
  const col=(key:string,en:string,bengali:string,align?:'right'):ColDef=>
    ({type:'col',col:{key,label:t(en,bengali),truncate:'normal',...(align?{align}:{})}});
  const columns:ColDef[]=[
    col('date','Date','তারিখ'),
    col('assessment_year','Assessment year','করবর্ষ'),
    col('payment_type','Payment type','পেমেন্টের ধরন'),
    col('dhara','Dhara','ধারা'),
    col('amount','Recorded amount','নথিভুক্ত পরিমাণ','right'),
    col('ledger_stage','Record stage','রেকর্ডের অবস্থা'),
    col('credit_status','Tax credit status','কর ক্রেডিটের অবস্থা'),
    col('source_system','Source','উৎস'),
    col('payment_ref','Source reference','উৎস রেফারেন্স')
  ];
  return <section data-testid="office-taxpayer-360-ledger" className="space-y-3">
    <section className="card payment-module__card">
      <h2>{t('Taxpayer ledger','করদাতার লেজার')}</h2>
      <p className="table-page__desc">{t(
        'Read-only mirrored payment records for the taxpayer selected above. Saved payments do not confirm Treasury settlement, a tax credit or remaining liability.',
        'উপরে নির্বাচিত করদাতার জন্য শুধু সংরক্ষিত পেমেন্ট রেকর্ড দেখানো হচ্ছে। সংরক্ষিত পেমেন্ট ট্রেজারি নিষ্পত্তি, কর ক্রেডিট বা অবশিষ্ট করদায় নিশ্চিত করে না।'
      )}</p>
      <p className="table-page__desc" role="status">{t(
        'Dhara and official reconciliation are unavailable from this source; no legal section or verified balance has been inferred.',
        'এই উৎসে ধারা ও সরকারি সমন্বয়ের তথ্য নেই; কোনো ধারা বা যাচাইকৃত ব্যালেন্স অনুমান করা হয়নি।'
      )}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <AppDateField id="office-ledger-from" label={t('From date','শুরুর তারিখ')}
          value={fromDate} onChange={setFromDate} compact/>
        <AppDateField id="office-ledger-to" label={t('To date','শেষ তারিখ')}
          value={toDate} onChange={setToDate} compact/>
      </div>
      {invalidRange&&<p className="table-page__desc" role="alert">{t(
        'The end date must be on or after the start date.',
        'শেষের তারিখ শুরুর তারিখের আগে হতে পারবে না।'
      )}</p>}
      {(fromDate||toDate)&&<SecondaryButton size="sm" onClick={()=>{setFromDate('');setToDate('');}}>
        {t('Clear date filters','তারিখের ফিল্টার মুছুন')}
      </SecondaryButton>}
    </section>
    {loading&&<p className="table-page__desc" role="status">{t(
      'Loading linked payment records…','সংযুক্ত পেমেন্ট রেকর্ড লোড হচ্ছে…'
    )}</p>}
    {!loading&&error&&<div className="card payment-module__card" role="alert">
      <p className="table-page__desc">{t(
        'The Office payment source is unavailable. No ledger entries or totals have been verified.',
        'অফিসের পেমেন্ট উৎস পাওয়া যাচ্ছে না। কোনো লেজার রেকর্ড বা মোট পরিমাণ যাচাই করা হয়নি।'
      )}</p><SecondaryButton size="sm" onClick={onRetry}>{t('Retry','আবার চেষ্টা করুন')}</SecondaryButton>
    </div>}
    {!loading&&!error&&!invalidRange&&snapshot===null&&<div className="card payment-module__card" role="status">
      <p className="table-page__desc">{t(
        'Payment records could not be confirmed for this taxpayer. Try again before treating the ledger as empty.',
        'এই করদাতার পেমেন্ট রেকর্ড পাওয়া যায়নি কিনা তা নিশ্চিত করা যাচ্ছে না। আবার চেষ্টা করুন।'
      )}</p>
      <SecondaryButton size="sm" onClick={onRetry}>{t('Retry','আবার চেষ্টা করুন')}</SecondaryButton>
    </div>}
    {!loading&&!error&&!invalidRange&&snapshot!==null&&rows.length===0&&<p className="table-page__desc" role="status">{t(
      'No linked recorded payments match this taxpayer and selected filters.',
      'এই করদাতা ও নির্বাচিত ফিল্টারে কোনো সংযুক্ত পেমেন্ট রেকর্ড পাওয়া যায়নি।'
    )}</p>}
    {!loading&&!error&&!invalidRange&&rows.length>0&&<>
      <section className="card payment-module__card" aria-label={t('Saved payment amount summary','সংরক্ষিত পেমেন্টের পরিমাণের সারাংশ')}>
        <p className="table-page__desc">{t('Linked recorded payment entries','সংযুক্ত পেমেন্ট এন্ট্রি')}: {new Intl.NumberFormat(bn?'bn-BD':'en-BD').format(rows.length)}</p>
        <p className="font-semibold">{t('Recorded saved payment amount','সংরক্ষিত পেমেন্টের নথিভুক্ত পরিমাণ')}: {
          view?.recordedSavedAmountMinor===null?'—':officeMoney(view?.recordedSavedAmountMinor??0,language)
        }</p>
        <p className="table-page__desc">{t(
          'This sum covers only saved recorded payments; it is not Treasury settlement or verified tax credit.',
          'শুধু নথিভুক্ত সংরক্ষিত পেমেন্টের যোগফল; এটি ট্রেজারি নিষ্পত্তি বা যাচাইকৃত কর ক্রেডিট নয়।'
        )}</p>
      </section>
      {/* A taxpayer/year switch must not inherit the previous account's
          table search, stage filters, sorting or pagination. */}
      <PaymentRecordList key={taxpayerTin+':'+year+':'+language} kind="transactions" title={t('Recorded ledger entries','নথিভুক্ত লেজার এন্ট্রি')}
        rows={displayedRows} columns={columns} filters={filters}
        mobileMapping={{primary:'payment_type',identifier:'payment_ref',
          meta:['assessment_year','source_system','dhara','credit_status'],status:'ledger_stage',
          date:'date',amount:'amount'}} onOpen={onOpen}/>
    </>}
  </section>;
}
