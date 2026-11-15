import {useEffect,useMemo,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ResponsiveTable} from '../../components/tables/ResponsiveTable';
import {AppModal} from '../../components/modals/AppModal';
import {fc,type TableRow} from '../modulePageUtils';
import {OFFICE_LEDGER_SOURCES,loadOfficeConsolidatedLedger,
  type OfficeLedgerLine,type OfficeLedgerReport} from './officeConsolidatedLedger';

const validTin=(value:string)=>/^\d{12}$/.test(value);
const csvCell=(value:unknown)=>'"'+String(value??'').replaceAll('"','""')+'"';
function exportCsv(lines:readonly OfficeLedgerLine[],tin:string){
  const headings=['Source','Source transaction','Source allocation','Source revision',
    'Taxpayer TIN','Dhara','Payment source','Assessment year','Date','Entry kind',
    'Recorded amount (paisa)','Official credit (paisa)','Verification status',
    'Original reference','Evidence SHA-256','Canonical credit reference'];
  const records=lines.map(l=>[
    OFFICE_LEDGER_SOURCES[l.sourceSystem],l.sourceRecordId,l.sourceAllocationId,
    l.sourceRevision,l.taxpayerTin,l.dhara,l.paymentSource,l.assessmentYear,
    l.eventDate,l.entryKind,l.amountMinor,
    l.entryKind==='CREDIT'&&l.financialStatus==='VERIFIED'?l.amountMinor:'',
    l.financialStatus,l.originalReference,l.evidenceSha256,l.canonicalCreditReference
  ].map(csvCell).join(','));
  const csv='\uFEFF'+[headings.map(csvCell).join(','),...records].join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;link.download='sohojkor-office-ledger-'+tin.slice(-4)+'.csv';
  link.click();URL.revokeObjectURL(url);
}

export function OfficeConsolidatedTaxpayerLedger({tin}:{tin:string}){
  const {i18n}=useTranslation();
  const bn=i18n.resolvedLanguage?.startsWith('bn')??false;
  const t=(en:string,other:string)=>bn?other:en;
  const [version,setVersion]=useState(0);
  const [snapshot,setSnapshot]=useState<{tin:string;loading:boolean;report:OfficeLedgerReport|null;error:string}>({
    tin:'',loading:false,report:null,error:''
  });
  const [source,setSource]=useState('ALL');
  const [year,setYear]=useState('ALL');
  const [status,setStatus]=useState('ALL');
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState<OfficeLedgerLine|null>(null);
  useEffect(()=>{
    let active=true;
    setSelected(null);setSource('ALL');setYear('ALL');setStatus('ALL');setQuery('');
    if(!validTin(tin)){
      setSnapshot({tin,loading:false,report:null,error:''});
      return()=>{active=false;};
    }
    setSnapshot({tin,loading:true,report:null,error:''});
    void loadOfficeConsolidatedLedger(tin).then(report=>{
      if(active)setSnapshot({tin,loading:false,report,error:''});
    }).catch(error=>{
      if(active)setSnapshot({tin,loading:false,report:null,
        error:error instanceof Error?error.message:'Office ledger read failed'});
    });
    return()=>{active=false;};
  },[tin,version]);

  const report=snapshot.tin===tin?snapshot.report:null;
  const loading=snapshot.tin===tin&&snapshot.loading;
  const error=snapshot.tin===tin?snapshot.error:'';
  const money=(minor:number)=>'৳'+new Intl.NumberFormat(bn?'bn-BD':'en-BD',{
    minimumFractionDigits:2,maximumFractionDigits:2
  }).format(minor/100);
  const date=(value:string)=>{
    const n=Date.parse(value);
    return Number.isFinite(n)?new Intl.DateTimeFormat(bn?'bn-BD':'en-GB',{
      dateStyle:'medium',timeStyle:'short'
    }).format(n):t('Unavailable','পাওয়া যায়নি');
  };
  const years=useMemo(()=>[...new Set((report?.lines??[]).map(l=>l.assessmentYear).filter((v):v is string=>!!v))].sort().reverse(),[report]);
  const filtered=useMemo(()=>(report?.lines??[]).filter(l=>
    (source==='ALL'||l.sourceSystem===source)&&
    (year==='ALL'||l.assessmentYear===year)&&
    (status==='ALL'||l.financialStatus===status)&&
    (!query.trim()||[l.sourceRecordId,l.sourceAllocationId,l.originalReference,l.dhara,
      l.paymentSource,l.entryKind,l.assessmentYear].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
  ),[report,source,year,status,query]);
  const rows:TableRow[]=useMemo(()=>filtered.map(l=>({
    id:l.id,
    date:date(l.eventDate),
    source:OFFICE_LEDGER_SOURCES[l.sourceSystem],
    dhara:l.dhara||t('Not supplied','উৎসে নেই'),
    year:l.assessmentYear||'—',
    entry_kind:l.entryKind.replaceAll('_',' '),
    recorded:money(l.amountMinor),
    verified_credit:l.entryKind==='CREDIT'&&l.financialStatus==='VERIFIED'?money(l.amountMinor):'—',
    status:l.financialStatus,
    reference:l.originalReference||l.sourceRecordId
  })),[filtered,bn]);
  const columns=[
    fc('date',t('Date','তারিখ')),
    fc('source',t('Source','উৎস')),
    fc('dhara',t('Dhara','ধারা')),
    fc('year',t('Assessment year','করবর্ষ')),
    fc('entry_kind',t('Entry type','এন্ট্রির ধরন')),
    fc('recorded',t('Recorded amount','নথিভুক্ত পরিমাণ'),{align:'right'}),
    fc('verified_credit',t('Confirmed credit','নিশ্চিত ক্রেডিট'),{align:'right'}),
    fc('status',t('Evidence status','প্রমাণের অবস্থা')),
    fc('reference',t('Reference','রেফারেন্স'))
  ];

  if(!validTin(tin))return <section className="card p-4" data-testid="office-verified-ledger">
    <p className="table-page__desc">{t('Select a valid 12-digit taxpayer TIN to open the authorized ledger.',
      'অনুমোদিত লেজার দেখতে বৈধ ১২ সংখ্যার করদাতা টিআইএন নির্বাচন করুন।')}</p>
  </section>;

  return <section className="card space-y-4 p-4" data-testid="office-verified-ledger">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{t('Consolidated taxpayer ledger','সমন্বিত করদাতা লেজার')}</h2>
        <p className="table-page__desc">{t('Original source lines, not reconstructed or assumed tax credits.',
          'মূল উৎসের রেকর্ড; অনুমানভিত্তিক কর ক্রেডিট নয়।')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="table-card__toolbar-btn" onClick={()=>setVersion(v=>v+1)}
          disabled={loading}>{t('Refresh','হালনাগাদ')}</button>
        <button type="button" className="table-card__toolbar-btn"
          disabled={!report||!filtered.length} onClick={()=>exportCsv(filtered,tin)}>
          {t('Export filtered CSV','ফিল্টার করা CSV রপ্তানি')}</button>
      </div>
    </div>
    {loading&&<p role="status" className="table-page__desc">{t('Checking authorized Office SQL ledger…','অনুমোদিত অফিস SQL লেজার যাচাই করা হচ্ছে…')}</p>}
    {error&&<p role="alert" className="table-page__desc">{t('Ledger unavailable: ','লেজার পাওয়া যায়নি: ')+error}</p>}
    {!loading&&report&&<>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-3"><span className="text-sm">{t('Recorded deposits and payments','নথিভুক্ত জমা ও পেমেন্ট')}</span><p className="text-lg font-semibold tabular-nums">{money(report.recordedPaymentMinor)}</p></div>
        <div className="card p-3"><span className="text-sm">{t('Recorded source deductions','নথিভুক্ত উৎস কর কর্তন')}</span><p className="text-lg font-semibold tabular-nums">{money(report.recordedDeductionMinor)}</p></div>
        <div className="card p-3"><span className="text-sm">{t('Independently verified tax credit','স্বতন্ত্রভাবে যাচাইকৃত কর ক্রেডিট')}</span><p className="text-lg font-semibold tabular-nums">{report.lines.some(l=>l.entryKind==='CREDIT'&&l.financialStatus==='VERIFIED')?money(report.verifiedCreditMinor):t('Not verified','যাচাই হয়নি')}</p></div>
      </div>
      <p className="table-page__desc" role="status">{t('Source coverage: ','উৎস কভারেজ: ')}
        {report.allSourceCoverage.length?report.allSourceCoverage.map(s=>OFFICE_LEDGER_SOURCES[s]).join(', '):t('No verified source connections returned records','কোনো উৎস থেকে যাচাইকৃত রেকর্ড পাওয়া যায়নি')}
        {'. '}{t('Unavailable providers remain unverified. Source deductions and deposits are not automatically tax credit.',
          'অনুপলব্ধ উৎস যাচাই হয়নি। উৎসে কর্তন ও জমা স্বয়ংক্রিয়ভাবে কর ক্রেডিট নয়।')}</p>
      <div className="flex flex-wrap gap-3" role="group" aria-label={t('Ledger filters','লেজার ফিল্টার')}>
        <label className="text-sm">{t('Search reference or Dhara','রেফারেন্স বা ধারা খুঁজুন')}
          <input type="search" className="mt-1 block min-h-10 rounded-md border px-3" value={query}
            onChange={e=>setQuery(e.target.value)} aria-label={t('Search ledger','লেজার খুঁজুন')}/>
        </label>
        <label className="text-sm">{t('Source','উৎস')}
          <select className="mt-1 block min-h-10 rounded-md border px-3" value={source} onChange={e=>setSource(e.target.value)}>
            <option value="ALL">{t('All sources','সব উৎস')}</option>
            {Object.entries(OFFICE_LEDGER_SOURCES).map(([code,label])=><option value={code} key={code}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm">{t('Assessment year','করবর্ষ')}
          <select className="mt-1 block min-h-10 rounded-md border px-3" value={year} onChange={e=>setYear(e.target.value)}>
            <option value="ALL">{t('All years','সব করবর্ষ')}</option>
            {years.map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="text-sm">{t('Evidence status','প্রমাণের অবস্থা')}
          <select className="mt-1 block min-h-10 rounded-md border px-3" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="ALL">{t('All statuses','সব অবস্থা')}</option>
            {['VERIFIED','PENDING','UNVERIFIED','REVERSED'].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <p className="table-page__desc">{filtered.length} {t('source lines','উৎস রেকর্ড')}</p>
      <ResponsiveTable cols={columns} rows={rows}
        aria-label={t('Consolidated taxpayer payment and credit ledger','সমন্বিত করদাতা পেমেন্ট ও ক্রেডিট লেজার')}
        mobileCardMapping={{primary:'source',identifier:'reference',meta:['dhara','year','entry_kind','status'],status:'status',date:'date',amount:'recorded'}}
        onRowClick={row=>{const item=filtered.find(l=>l.id===row.id);if(item)setSelected(item);}}
        emptyMessage={t('No authorized ledger records match the filters.','নির্বাচিত ফিল্টারে অনুমোদিত কোনো লেজার রেকর্ড পাওয়া যায়নি।')}/>
    </>}
    <AppModal open={!!selected} onClose={()=>setSelected(null)}
      title={selected?t('Source record details','উৎস রেকর্ডের বিবরণ')+' · '+OFFICE_LEDGER_SOURCES[selected.sourceSystem]:''}
      size="lg">
      {selected&&<dl className="grid gap-3 sm:grid-cols-2">
        {([
          [t('Source','উৎস'),OFFICE_LEDGER_SOURCES[selected.sourceSystem]],
          [t('Source transaction','মূল লেনদেন'),selected.sourceRecordId],
          [t('Source allocation','মূল বরাদ্দ'),selected.sourceAllocationId??'—'],
          [t('Source revision','উৎস সংশোধন সংখ্যা'),String(selected.sourceRevision)],
          [t('Dhara','ধারা'),selected.dhara??t('Not supplied','উৎসে নেই')],
          [t('Payment source','পেমেন্টের উৎস'),selected.paymentSource],
          [t('Assessment year','করবর্ষ'),selected.assessmentYear??'—'],
          [t('Date','তারিখ'),date(selected.eventDate)],
          [t('Amount','পরিমাণ'),money(selected.amountMinor)],
          [t('Entry kind','এন্ট্রি ধরন'),selected.entryKind],
          [t('Evidence status','প্রমাণের অবস্থা'),selected.financialStatus],
          [t('Original reference','মূল রেফারেন্স'),selected.originalReference??'—'],
          [t('Evidence SHA-256','প্রমাণ SHA-256'),selected.evidenceSha256??'—'],
          [t('Official credit reference','সরকারি ক্রেডিট রেফারেন্স'),selected.canonicalCreditReference??'—'],
          [t('Official credit line','সরকারি ক্রেডিট লাইন'),selected.canonicalCreditLineId??'—'],
        ] as [string,string][]).map(([label,value])=><div key={label} className="min-w-0">
          <dt className="text-sm">{label}</dt><dd className="break-all text-sm font-medium">{value}</dd>
        </div>)}
      </dl>}
      {selected&&<p className="table-page__desc">{selected.entryKind==='CREDIT'&&selected.financialStatus==='VERIFIED'
        ?t('Independently verified credit evidence is recorded.','স্বতন্ত্রভাবে যাচাইকৃত ক্রেডিট প্রমাণ নথিভুক্ত।')
        :t('This record alone does not establish tax credit.','এই রেকর্ড এককভাবে কর ক্রেডিট প্রমাণ করে না।')}</p>}
    </AppModal>
  </section>;
}
