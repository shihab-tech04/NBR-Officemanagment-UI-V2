import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, CreditCard, FilePlus2, Landmark, ShieldAlert, Users, Wallet } from 'lucide-react';
import { ResponsiveTable } from '../../components/tables/ResponsiveTable';
import { DynamicDetailsDrawer } from '../../components/drawers/DynamicDetailsDrawer';
import { AppModal } from '../../components/modals/AppModal';
import { TabBar } from '../../components/tabs/TabBar';
import { StatCard } from '../../components/cards/StatCard';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SecondaryButton } from '../../components/buttons/SecondaryButton';
import { AppTextField } from '../../components/forms/AppTextField';
import { AppTextArea } from '../../components/forms/AppTextArea';
import { AppSelectField } from '../../components/forms/AppSelectField';
import type { ColDef, TableRow } from '../modulePageUtils';
import {
  referenceAudit, referenceCorrections, referenceIntelligence,
  referenceOffline, referencePayments, referenceTaxpayers, totalEligible, totalReceived,
} from './paymentReference';

const money = (amount: number) => `৳${new Intl.NumberFormat('en-BD').format(amount)}`;
const columns = (...items: [string, string][]): ColDef[] => items.map(([key, label]) => ({ type: 'col', col: { key, label, truncate:'normal' } }));
const normal = (value: string) => value || '—';
const EVENT_LABELS:Record<string,string> = { LIABILITY_REDUCED:'Liability reduced', OFFLINE_PAYMENT:'Offline payment', LIABILITY_CREATED:'Liability created' };
const formatEvent = (event: string) => EVENT_LABELS[event] || event;
const rows = (arr: ReadonlyArray<Record<string, unknown>>): TableRow[] =>
  arr.map(record => Object.fromEntries(Object.entries(record).map(([key,value]) => [key, String(value ?? '—')])));
const samplePayments = referencePayments.map(p => ({
  key:p.key, date:p.date, taxpayer_name:p.taxpayer_name, payer_name:p.payer_name,
  payment_type:p.type, assessment_year:p.ay, amount:money(p.amount),
  financial_receipt_status:p.financial_receipt_status, tax_credit_status:p.tax_credit_status,
  tax_event_id:normal(p.tax_event_id), payment_transaction_id:normal(p.payment_transaction_id),
  acs_reference:normal(p.acs_reference), payment_channel:p.payment_channel.replace(/ \(illustrative\)/i,''),
}));
const keys = {
  transactions:columns(['date','Date'],['taxpayer_name','Taxpayer'],['payer_name','Payer'],['payment_type','Type'],['assessment_year','AY'],['amount','Amount'],['financial_receipt_status','Treasury receipt'],['tax_credit_status','NBR credit']),
  correction:columns(['id','Case'],['taxpayer','Taxpayer'],['reason','Reason'],['amount','Amount'],['stage','Stage'],['status','Status']),
  offline:columns(['id','Event'],['taxpayer','Taxpayer'],['event','Type'],['component','Component'],['amount','Amount'],['status','Status']),
  incident:columns(['id','Reference'],['taxpayer','Taxpayer'],['type','Incident type'],['date','Reported'],['status','Status']),
  audit:columns(['id','Event'],['date','Date'],['actor','Actor'],['action','Action'],['reason','Reason']),
};
const pages = ['overview','transactions','taxpayer-360','corrections','incidents','offline-events','analytics'] as const;
type PaymentPage = typeof pages[number];
type DraftKind = 'corrections' | 'incidents' | 'offline-events';
type Details = { title:string; record:TableRow } | null;
const firstDraft = { tin:'', type:'', ay:'', component:'', reduces:'', amount:'', reference:'', source:'', reason:'', evidence:'', noticed:'', altContact:'', nid:'', mobile:'' };

export function PaymentModulePage({page}: {page: string}) {
  const {t} = useTranslation('payment');
  const navigate = useNavigate();
  const current:PaymentPage = pages.includes(page as PaymentPage) ? page as PaymentPage : 'overview';
  const [query,setQuery] = useState('');
  const [receiptFilter,setReceiptFilter] = useState('All');
  const [selectedTin,setSelectedTin] = useState<string>(referenceTaxpayers[0].tin);
  const [taxpayerTab,setTaxpayerTab] = useState('identity');
  const [queueFilter,setQueueFilter] = useState('All');
  const [analyticsTab,setAnalyticsTab] = useState('insights');
  const [details,setDetails] = useState<Details>(null);
  const [draftKind,setDraftKind] = useState<DraftKind | null>(null);
  const [draft,setDraft] = useState(firstDraft);
  const [draftPreview,setDraftPreview] = useState(false);
  const [formError,setFormError] = useState('');
  const goto = (id:PaymentPage) => navigate(`/payments/${id}`);
  const view = (record:TableRow,title:string) => setDetails({record,title});
  const openDraft=(kind:DraftKind)=>{setDraftKind(kind);setDraft(firstDraft);setDraftPreview(false);setFormError('');};
  const change=(key:keyof typeof firstDraft,value:string)=>{setDraft(s=>({...s,[key]:value}));setDraftPreview(false);setFormError('');};
  const previewDraft=()=>{
    const required = draftKind === 'offline-events'
      ? ['tin','type','ay','component','amount','reference','source','reason','evidence']
      : draftKind === 'corrections'
      ? ['tin','reference','reason','evidence']
      : ['type','reason'];
    const missing = required.filter(key=>!draft[key as keyof typeof firstDraft].trim());
    if(missing.length) {setFormError(`${t('required')}: ${missing.map(k=>t(k)).join(', ')}`);return;}
    if(draft.tin && !/^\d{12}$/.test(draft.tin)) {setFormError(t('tinError'));return;}
    if(draftKind === 'offline-events' && draft.type === 'LIABILITY_REDUCED' && !draft.reduces) {setFormError(`${t('required')}: ${t('reduces')}`);return;}
    if(draftKind==='offline-events' && (!Number.isFinite(Number(draft.amount)) || Number(draft.amount)<=0)) {setFormError(t('amountError'));return;}
    setDraftPreview(true);
  };
  const queryText=query.trim().toLowerCase();
  const filteredPayments=useMemo(()=>samplePayments.filter(p =>
    (receiptFilter==='All'||p.financial_receipt_status===receiptFilter) &&
    (!queryText||Object.values(p).some(v=>String(v).toLowerCase().includes(queryText)))
  ),[queryText,receiptFilter]);
  const taxP=referenceTaxpayers.find(p=>p.tin===selectedTin)??referenceTaxpayers[0];
  const taxPayments=samplePayments.filter(p=>p.taxpayer_name===taxP.name);
  const original=referencePayments.filter(p=>p.tin===selectedTin);
  const [localRecords,setLocalRecords] = useState<Record<DraftKind,TableRow[]>>({'corrections':[],'incidents':[],'offline-events':[]});
  const corrRows=[...localRecords.corrections,...referenceCorrections.map(x=>({...x,amount:money(x.amount)}))].filter(x=>queueFilter==='All'||x.status===queueFilter);
  const incidentRows=localRecords.incidents;
  const offlineRows=[...localRecords['offline-events'],...referenceOffline.map(e=>({...e,event:formatEvent(e.event),amount:money(e.amount)}))];
  const saveDraft=()=>{
    if(!draftKind||!draftPreview)return;
    const id=`DRAFT-${String(localRecords[draftKind].length+1).padStart(3,'0')}`;
    const p=referenceTaxpayers.find(x=>x.tin===draft.tin);
    const record:TableRow=draftKind==='corrections' ? {
      id, taxpayer:p?.name||draft.tin,reason:draft.reason,amount:'—',stage:t('draft'),status:t('draft'),reference:draft.reference,evidence:draft.evidence,
    } : draftKind==='incidents' ? {
      id, taxpayer:p?.name||t('unknown'),type:t(`incident_${draft.type}`),date:draft.noticed||'—',status:t('draft'),reason:draft.reason,reference:draft.reference,
    } : {
      id,taxpayer:p?.name||draft.tin,event:t(`event_${draft.type}`),component:draft.component,amount:money(Number(draft.amount)),status:t('draft'),ay:draft.ay,reference:draft.reference,
    };
    setLocalRecords(prev=>({...prev,[draftKind]:[record,...prev[draftKind]]}));
    setQueueFilter('All');setDraftKind(null);setDraftPreview(false);
  };

  const toolbar=(label:string,action?:()=>void)=> (
    <header className="table-page__header payment-module__header">
      <div><h1 className="table-page__title">{label}</h1></div>
      {action && <div className="table-page__actions"><PrimaryButton size="sm" icon={FilePlus2} onClick={action}>{t('addNew')}</PrimaryButton></div>}
    </header>
  );
  const table=(c:ColDef[],records:TableRow[],titleKey:string)=> (
    <section className="table-card payment-module__table-card" aria-label={t(titleKey)}>
      <div className="table-card__toolbar"><div className="table-card__title-group"><h2 className="table-card__title">{t(titleKey)}</h2><span className="table-card__count">{records.length} {t('records')}</span></div></div>
      <ResponsiveTable cols={c} rows={records} noCard onRowClick={record=>view(record,t(titleKey))} aria-label={t(titleKey)}/>
    </section>
  );
  const kpi=(label:string,value:string,Icon:typeof Wallet,tone:'primary'|'success'|'warning'|'error'|'neutral'='primary')=>
    <StatCard icon={Icon} value={value} fullValue={value} label={label} tone={tone}/>;

  const overview=()=> <>
    {toolbar(t('overview'))}
    <div className="payment-module__kpis">
      {kpi(t('payments'),String(referencePayments.length),CreditCard)}
      {kpi(t('received'),money(totalReceived(referencePayments)),Landmark,'success')}
      {kpi(t('eligible'),money(totalEligible(referencePayments)),CheckCircle2,'success')}
      {kpi(t('blocked'),String(referencePayments.filter(p=>p.tax_credit_status==='Blocked — under review').length),ShieldAlert,'warning')}
      {kpi(t('offlinePending'),String(referenceOffline.filter(e=>e.status==='Pending').length),Clock3,'warning')}
    </div>
    <div className="payment-module__summary-grid">
      <section className="card payment-module__card"><div className="payment-module__section-top"><h2>{t('attention')}</h2><SecondaryButton size="sm" onClick={()=>goto('corrections')}>{t('viewQueue')}</SecondaryButton></div>
        {referenceCorrections.filter(c=>c.status==='Blocked').map(c=><button className="payment-module__record-link" type="button" key={c.id} onClick={()=>view({...c,amount:money(c.amount)},c.id)}><strong>{c.id}</strong><p>{c.reason} · {money(c.amount)}</p></button>)}
      </section>
      <section className="card payment-module__card"><div className="payment-module__section-top"><h2>{t('recentAudit')}</h2><SecondaryButton size="sm" onClick={()=>navigate('/audit/audit-trail')}>{t('centralAudit')}</SecondaryButton></div>
        {referenceAudit.slice(0,4).map(e=><button className="payment-module__record-link" key={e.id} type="button" onClick={()=>view({...e},e.id)}><strong>{e.action.replace(/_/g,' ').toLowerCase().replace(/\b\w/g,k=>k.toUpperCase())}</strong><p>{e.date} · {e.actor.replace(/ \(demo\)/i,'')}</p></button>)}
      </section>
    </div>
  </>;
  const transactions=()=> <>
    {toolbar(t('transactions'))}
    <div className="payment-module__filters">
      <AppTextField id="payment-search" label={t('search')} value={query} onChange={setQuery} compact/>
      <AppSelectField id="payment-receipt-filter" label={t('receiptFilter')} value={receiptFilter} onChange={setReceiptFilter} compact
        options={['All','Failed','Awaiting bank payment','Received by Government'].map(v=>({value:v,label:v==='All'?t('all'):v}))}/>
    </div>
    {table(keys.transactions,filteredPayments,'transactions')}
  </>;
  const taxpayer=()=> <>
    {toolbar(t('taxpayer360'))}
    <div className="payment-module__filters"><AppSelectField id="payment-taxpayer" label={t('taxpayer')} value={selectedTin} onChange={setSelectedTin}
      options={referenceTaxpayers.filter(p=>/^\d{12}$/.test(p.tin)).map(p=>({value:p.tin,label:`${p.name} · ${p.tin}`}))} searchableAfter={5}/></div>
    <div className="payment-module__identity"><h2>{taxP.name}</h2><p>{t('tin')}: {taxP.tin} · {taxP.zone} · {taxP.circle}</p></div>
    <div className="payment-module__kpis payment-module__kpis--four">
      {kpi(t('payments'),String(original.length),CreditCard)}
      {kpi(t('received'),money(totalReceived(original)),Landmark,'success')}
      {kpi(t('eligible'),money(totalEligible(original)),CheckCircle2,'success')}
      {kpi(t('blocked'),String(original.filter(p=>p.tax_credit_status==='Blocked — under review').length),ShieldAlert,'warning')}
    </div>
    <TabBar active={taxpayerTab} onChange={setTaxpayerTab} tabs={['identity','taxPosition','returns','paymentsTab','correctionsTab','notices','ledger'].map(id=>({id,label:t(id)}))}/>
    {taxpayerTab==='identity' ? <section className="card payment-module__card payment-module__identity-grid">
      {Object.entries({[t('name')]:taxP.name,[t('tin')]:taxP.tin,[t('nidMasked')]:taxP.nid,[t('phoneMasked')]:taxP.phone,[t('zone')]:taxP.zone,[t('circle')]:taxP.circle,[t('type')]:taxP.type,[t('status')]:taxP.status==='Reference'?'—':taxP.status}).map(([k,v])=><div key={k}><p className="payment-module__field-label">{k}</p><p>{v}</p></div>)}
    </section> : taxpayerTab==='paymentsTab'||taxpayerTab==='ledger' ? <>{table(keys.transactions,taxPayments,'transactions')}</> : taxpayerTab==='correctionsTab' ? table(keys.correction,rows(referenceCorrections.filter(c=>c.taxpayer===taxP.name).map(c=>({...c,amount:money(c.amount)}))),'corrections') :
      <section className="card payment-module__card payment-module__empty"><h2>{t(taxpayerTab)}</h2><p>{t('noRecords')}</p></section>}
  </>;
  const corrections=()=> <>
    {toolbar(t('corrections'),()=>openDraft('corrections'))}
    <div className="payment-module__filters"><AppSelectField id="payment-correction-status" label={t('status')} value={queueFilter} onChange={setQueueFilter} compact options={['All','Blocked','Decided'].map(x=>({value:x,label:x==='All'?t('all'):x}))}/></div>
    {table(keys.correction,rows(corrRows),'corrections')}
  </>;
  const incidents=()=> <>
    {toolbar(t('incidents'),()=>openDraft('incidents'))}
      {table(keys.incident,incidentRows,'incidents')}
  </>;
  const offline=()=> <>
    {toolbar(t('offlineEvents'),()=>openDraft('offline-events'))}
    {table(keys.offline,rows(offlineRows),'offlineEvents')}
  </>;
  const analytics=()=> <>
    {toolbar(t('analytics'))}
    <div className="payment-module__kpis">
      {kpi(t('paymentVolume'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.volume),BarChart3)}
      {kpi(t('successful'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.successful),CheckCircle2,'success')}
      {kpi(t('failed'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.failed),AlertTriangle,'error')}
      {kpi(t('pending'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.pending),Clock3,'warning')}
      {kpi(t('abandoned'),referenceIntelligence.abandonment,Users,'warning')}
      {kpi(t('wrongSection'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.wrongSection),ShieldAlert,'warning')}
      {kpi(t('wrongYear'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.wrongYear),ShieldAlert,'warning')}
      {kpi(t('correctionRequests'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.corrections),CreditCard)}
      {kpi(t('invalidated'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.invalidatedCredits),AlertTriangle,'error')}
    </div>
    <TabBar active={analyticsTab} onChange={setAnalyticsTab} tabs={[{id:'insights',label:t('insights')},{id:'monitoring',label:t('monitoring')}]} />
    {analyticsTab==='insights' ? <div className="payment-module__summary-grid">
      <section className="card payment-module__card"><h2>{t('channelPerformance')}</h2>
        {([['Internet Banking',98.1],['bKash',97.6],['Nagad',97.2],['Rocket',96.4],['Visa / Mastercard',91.3]] as const).map(([name,value],index)=><div className="payment-module__metric" key={name}><label htmlFor={`pay-channel-${index}`}>{name}</label><progress id={`pay-channel-${index}`} value={value} max="100"/><p>{value}%</p></div>)}
      </section>
      <section className="card payment-module__card"><h2>{t('funnel')}</h2>
        {([[t('identify'),100],[t('taxPosition'),94],[t('selected'),78],[t('review'),71],[t('channelChosen'),66]] as const).map(([name,value],i)=><div className="payment-module__metric" key={i}><label htmlFor={`pay-funnel-${i}`}>{name}</label><progress id={`pay-funnel-${i}`} value={value} max="100"/><p>{value}%</p></div>)}
      </section>
    </div> : <section className="card payment-module__card payment-module__empty"><h2>{t('monitoring')}</h2><p>{t('noRecords')}</p></section>}
  </>;

  return <div className="payment-module" data-testid={`payment-${current}`}>
    {current==='overview'?overview():current==='transactions'?transactions():current==='taxpayer-360'?taxpayer():current==='corrections'?corrections():current==='incidents'?incidents():current==='offline-events'?offline():analytics()}
    <DynamicDetailsDrawer open={details!==null} onClose={()=>setDetails(null)} title={details?.title} rowData={details?.record??null}
      columns={Object.keys(details?.record??{}).filter(k=>k!=='key').map(key=>({key,label:key.replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())}))} showActions={false}/>
    <AppModal open={draftKind!==null} title={draftKind?t(`new_${draftKind}`):t('newRequest')} onClose={()=>setDraftKind(null)} size="lg" icon={<FilePlus2 size={16}/>} 
      footer={<><SecondaryButton size="sm" onClick={()=>setDraftKind(null)}>{t('cancel')}</SecondaryButton><PrimaryButton size="sm" onClick={draftPreview?saveDraft:previewDraft}>{draftPreview?t('addToList'):t('reviewDraft')}</PrimaryButton></>}>
      <div className="payment-module__form">
        <AppSelectField id="payment-draft-tin" label={draftKind==='incidents'?t('claimedTinOptional'):t('tin')} value={draft.tin} onChange={v=>change('tin',v)} required={draftKind!=='incidents'} options={[{value:'',label:t('selectTaxpayer')},...referenceTaxpayers.filter(p=>/^\d{12}$/.test(p.tin)).map(p=>({value:p.tin,label:`${p.name} · ${p.tin}`}))]}/>
        {draftKind==='incidents'&&<>
          <AppSelectField id="payment-incident-type" label={t('incidentType')} value={draft.type} onChange={v=>change('type',v)} required options={[{value:'',label:t('select')},...['ONBOARDING','IDENTITY_MISUSE','UNKNOWN_REP','UNAUTHORIZED_PAYMENT','UNAUTHORIZED_ATTRIBUTION'].map(v=>({value:v,label:t(`incident_${v}`)}))]}/>
          <AppTextField id="payment-incident-nid" label={t('claimedNidOptional')} value={draft.nid} onChange={v=>change('nid',v)}/>
          <AppTextField id="payment-incident-mobile" label={t('claimedMobileOptional')} value={draft.mobile} onChange={v=>change('mobile',v)}/>
          <AppTextField id="payment-incident-reference" label={t('knownReferenceOptional')} value={draft.reference} onChange={v=>change('reference',v)}/>
          <AppTextField id="payment-incident-date" label={t('noticedOptional')} value={draft.noticed} onChange={v=>change('noticed',v)} placeholder="YYYY-MM-DD"/>
          <AppTextField id="payment-incident-contact" label={t('alternateContactOptional')} value={draft.altContact} onChange={v=>change('altContact',v)}/>
          <p className="payment-module__note payment-module__full">{t('incidentNoIdentityOracle')}</p>
        </>}
        {draftKind==='offline-events' && <>
          <AppSelectField id="payment-draft-type" label={t('eventType')} value={draft.type} required onChange={v=>change('type',v)} options={[{value:'',label:t('select')},...['LIABILITY_REDUCED','OFFLINE_PAYMENT','LIABILITY_CREATED'].map(v=>({value:v,label:t(`event_${v}`)}))]}/>
          <AppSelectField id="payment-draft-year" label={t('ay')} value={draft.ay} required onChange={v=>change('ay',v)} options={[{value:'',label:t('select')},...['2027–28','2026–27','2025–26','2024–25'].map(v=>({value:v,label:v}))]}/>
          <AppSelectField id="payment-draft-component" label={t('component')} value={draft.component} required onChange={v=>change('component',v)} options={[{value:'',label:t('select')},...['Regular tax','Assessed demand','Penalty'].map(v=>({value:v,label:v}))]}/>
          {draft.type==='LIABILITY_REDUCED'&&<AppSelectField id="payment-draft-reduces" label={t('reduces')} value={draft.reduces} onChange={v=>change('reduces',v)} options={['','Tax / demand','Penalty','Interest'].map(v=>({value:v,label:v||t('select')}))}/>}
          <AppTextField id="payment-draft-amount" label={t('amount')} value={draft.amount} onChange={v=>change('amount',v)} inputMode="decimal" required/>
        </>}
        {draftKind!=='incidents'&&<AppTextField id="payment-draft-reference" label={t('reference')} value={draft.reference} onChange={v=>change('reference',v)} required/>}
        {draftKind==='offline-events'&&<AppTextField id="payment-draft-source" label={t('source')} value={draft.source} onChange={v=>change('source',v)} required/>}
        <AppTextArea id="payment-draft-reason" label={t('reason')} value={draft.reason} onChange={v=>change('reason',v)} required={draftKind!=='incidents'}/>
        <AppTextArea id="payment-draft-evidence" label={t('evidenceDescription')} value={draft.evidence} onChange={v=>change('evidence',v)} required={draftKind!=='incidents'}/>
      </div>
      {formError&&<p role="alert" className="payment-module__error">{formError}</p>}
      {draftPreview&&<section className="payment-module__preview" aria-live="polite"><h3>{t('draftReviewed')}</h3><p>{t('tin')}: {normal(draft.tin)}</p><p>{t('reference')}: {normal(draft.reference)}</p><p>{t('reason')}: {normal(draft.reason)}</p></section>}
    </AppModal>
  </div>;
}