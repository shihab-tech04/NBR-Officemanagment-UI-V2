import {useEffect,useMemo,useState} from 'react';
import {PaymentRecordList} from './PaymentRecordList';
import {DynamicDetailsDrawer} from '../../components/drawers/DynamicDetailsDrawer';
import {SecondaryButton} from '../../components/buttons/SecondaryButton';
import {formatLedgerMinor,getGuardedOfficeLedger,projectGuardedLedgerRows,
  type GuardedOfficeLedgerEntry} from './officeGuardedLedgerSource';
import type {ColDef,FilterDef,TableRow} from '../modulePageUtils';

type State={
  tin:string;loading:boolean;loadingMore:boolean;error:boolean;items:GuardedOfficeLedgerEntry[];
  creditMinor:string|null;hasMore:boolean;
};
const initial=(tin:string):State=>({
  tin,loading:true,loadingMore:false,error:false,items:[],creditMinor:null,hasMore:false
});

/** An additional source-backed pane, never a replacement for the existing
 * labelled Sohojkor payment mirror. It remains unavailable until the guarded
 * WS3 contract and an actual Office payment-officer session are installed. */
export function OfficeGuardedLedgerPanel({taxpayerTin,year,language,fromDate,toDate}:{
  taxpayerTin:string;year:string;language:'en'|'bn';fromDate:string;toDate:string;
}){
  const bn=language==='bn';
  const t=(en:string,be:string)=>bn?be:en;
  const [refresh,setRefresh]=useState(0);
  const [state,setState]=useState<State>(()=>initial(taxpayerTin));
  const [selected,setSelected]=useState<TableRow|null>(null);
  // Scope and language changes invalidate any previously opened source detail.
  useEffect(()=>{setSelected(null);},[year,fromDate,toDate,language]);
  useEffect(()=>{
    let active=true;
    setSelected(null);
    setState(initial(taxpayerTin));
    void getGuardedOfficeLedger(taxpayerTin).then(page=>{
      if(active)setState({
        tin:taxpayerTin,loading:false,loadingMore:false,error:false,
        items:page.items,creditMinor:page.verifiedExternalCreditMinor,
        hasMore:page.items.length===page.limit
      });
    }).catch(()=>{
      if(active)setState({...initial(taxpayerTin),loading:false,error:true});
    });
    return()=>{active=false;};
  },[taxpayerTin,refresh]);
  const current=state.tin===taxpayerTin?state:initial(taxpayerTin);
  const rows=useMemo(()=>projectGuardedLedgerRows(
    current.items,year,language,fromDate,toDate
  ),[current.items,year,language,fromDate,toDate]);
  const more=async()=>{
    if(current.loadingMore||current.loading||current.error||!current.hasMore)return;
    const old=current;
    setState(s=>({...s,loadingMore:true}));
    try{
      const page=await getGuardedOfficeLedger(taxpayerTin,old.items.length);
      if(page.verifiedExternalCreditMinor!==old.creditMinor)throw Error('Ledger revision changed');
      const ids=new Set(old.items.map(e=>[e.sourceSystem,e.sourceRecordId,e.sourceAllocationId??'',e.sourceRevision].join('|')));
      if(page.items.some(e=>ids.has([e.sourceSystem,e.sourceRecordId,e.sourceAllocationId??'',e.sourceRevision].join('|'))))
        throw Error('Ledger page overlap');
      setState(s=>s.tin===taxpayerTin?{
        ...s,loadingMore:false,items:[...old.items,...page.items],
        hasMore:page.items.length===page.limit
      }:s);
    }catch{
      setState(s=>s.tin===taxpayerTin?{
        ...s,loadingMore:false,error:true,items:[],creditMinor:null,hasMore:false
      }:s);
    }
  };
  const col=(key:string,en:string,be:string,align?:'right'):ColDef=>({
    type:'col',col:{key,label:t(en,be),truncate:'normal',...(align?{align}:{})}
  });
  const columns:ColDef[]=[
    col('date','Event date (UTC)','ঘটনার তারিখ (UTC)'),
    col('source_system','Source system','উৎস সিস্টেম'),
    col('payment_type','Entry type','এন্ট্রির ধরন'),
    col('dhara','Dhara','ধারা'),
    col('assessment_year','Assessment year','করবর্ষ'),
    col('amount','Recorded amount','নথিভুক্ত পরিমাণ','right'),
    col('ledger_stage','Source status','উৎসের অবস্থা'),
    col('credit_status','Credit evidence','ক্রেডিটের প্রমাণ'),
    col('payment_ref','Source reference','উৎস রেফারেন্স')
  ];
  const options=(key:'source_system'|'payment_type'|'ledger_stage'|'credit_status',label:string):FilterDef=>({
    key,label,type:'select',options:['All',...new Set(rows.map(r=>String(r[key]??'')).filter(Boolean))]
  });
  const filters:FilterDef[]=[
    options('source_system',t('Source','উৎস')),
    options('payment_type',t('Entry type','এন্ট্রির ধরন')),
    options('ledger_stage',t('Source status','উৎসের অবস্থা')),
    options('credit_status',t('Credit evidence','ক্রেডিটের প্রমাণ'))
  ];
  return <section className="space-y-3" data-testid="office-guarded-ledger">
    <section className="card payment-module__card">
      <h2>{t('Authorized external ledger sources','অনুমোদিত বাহ্যিক লেজার উৎস')}</h2>
      <p className="table-page__desc">{t(
        'Separate officer-authorized source events. Sohojkor saved payment records never establish Treasury credit. External source credit is not a final tax balance.',
        'পৃথক অনুমোদিত কর্মকর্তার উৎস রেকর্ড। সহজকরের সংরক্ষিত পেমেন্ট কখনো ট্রেজারি ক্রেডিট নিশ্চিত করে না। বাহ্যিক উৎসের ক্রেডিট চূড়ান্ত কর ব্যালেন্স নয়।'
      )}</p>
      {current.loading&&<p role="status" className="table-page__desc">{t(
        'Checking authorized source…','অনুমোদিত উৎস যাচাই হচ্ছে…'
      )}</p>}
      {current.error&&<div role="alert">
        <p className="table-page__desc">{t(
          'An authorized external ledger cannot be confirmed. No source credits or balances are shown.',
          'অনুমোদিত বাহ্যিক লেজার যাচাই করা যায়নি। কোনো উৎস ক্রেডিট বা ব্যালেন্স দেখানো হচ্ছে না।'
        )}</p>
        <SecondaryButton size="sm" onClick={()=>setRefresh(v=>v+1)}>{t('Retry','আবার চেষ্টা করুন')}</SecondaryButton>
      </div>}
      {!current.loading&&!current.error&&<>
        {year==='all'&&!fromDate&&!toDate&&current.creditMinor!==null&&
          <p className="table-page__desc" data-testid="office-external-credit-summary">{t(
            'Source-verified external credit, all years (not a final tax balance): ',
            'সব বছরের উৎস-যাচাইকৃত বাহ্যিক ক্রেডিট (চূড়ান্ত কর ব্যালেন্স নয়): '
          )}{formatLedgerMinor(current.creditMinor,language)}</p>}
        {rows.length===0&&<p className="table-page__desc" role="status">{t(
          'No authorized source entries match the selected filters. This does not establish that every external provider is connected.',
          'নির্বাচিত ফিল্টারে কোনো অনুমোদিত উৎস রেকর্ড নেই। এতে সব বাহ্যিক সেবা সংযুক্ত আছে তা প্রমাণ হয় না।'
        )}</p>}
      </>}
    </section>
    {!current.loading&&!current.error&&rows.length>0&&
      <PaymentRecordList key={[taxpayerTin,year,language,fromDate,toDate].join(':')} kind="transactions"
        title={t('External source entries','বাহ্যিক উৎসের এন্ট্রি')}
        columns={columns} rows={rows} filters={filters}
        mobileMapping={{primary:'payment_type',identifier:'payment_ref',
          meta:['source_system','dhara','assessment_year','credit_status'],status:'ledger_stage',
          date:'date',amount:'amount'}}
        onOpen={setSelected}/>}
    {!current.loading&&!current.error&&current.hasMore&&<SecondaryButton size="sm"
      disabled={current.loadingMore} onClick={()=>void more()}>
      {current.loadingMore?t('Loading more…','আরও লোড হচ্ছে…'):t('Load more source entries','আরও উৎস এন্ট্রি দেখুন')}
    </SecondaryButton>}
    <DynamicDetailsDrawer open={selected!==null} onClose={()=>setSelected(null)}
      title={t('Source record details','উৎস রেকর্ডের বিবরণ')} rowData={selected}
      columns={[
        ...columns.map(c=>({key:c.type==='col'?c.col.key:'',label:c.type==='col'?c.col.label:''})),
        {key:'source_revision',label:t('Source revision','উৎস সংস্করণ')},
        {key:'source_allocation',label:t('Source allocation','উৎস বরাদ্দ')},
        {key:'original_reference',label:t('Original reference','মূল রেফারেন্স')},
        {key:'evidence_sha256',label:t('Source evidence SHA-256','উৎস প্রমাণ SHA-256')},
        {key:'event_timestamp',label:t('Source event time','উৎসের সময়')}
      ]} showActions={false}/>
  </section>;
}
