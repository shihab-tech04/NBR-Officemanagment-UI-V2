import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, ChevronUp, Clock3, CreditCard, FilePlus2, Landmark, ShieldAlert, Users, Wallet } from 'lucide-react';
import { PaymentRecordList } from './PaymentRecordList';
import { DynamicDetailsDrawer } from '../../components/drawers/DynamicDetailsDrawer';
import { AppModal } from '../../components/modals/AppModal';
import { TabBar } from '../../components/tabs/TabBar';
import { StatCard } from '../../components/cards/StatCard';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SecondaryButton } from '../../components/buttons/SecondaryButton';
import { AppTextField } from '../../components/forms/AppTextField';
import { AppDateField } from '../../components/forms/AppDateField';
import { CollapsibleKpiSection } from '../../components/cards/CollapsibleKpiSection';
import { AppTextArea } from '../../components/forms/AppTextArea';
import { AppSelectField } from '../../components/forms/AppSelectField';
import type { ColDef, TableRow, FilterDef, MobileCardMapping, KpiDef } from '../modulePageUtils';
import {
  referenceAudit, referenceCorrections, referenceIntelligence,
  referenceOffline, referencePayments, referenceTaxpayers, totalEligible, totalReceived,
} from './paymentReference';

const money = (amount: number) => `৳${new Intl.NumberFormat('en-BD').format(amount)}`;
const normal = (value: string) => value || '—';
const samplePayments = referencePayments.map(p => ({
  key:p.key, date:p.date, taxpayer_name:p.taxpayer_name, tin:p.tin, payer_name:p.payer_name,
  payment_type:p.type, assessment_year:p.ay, income_year:p.iy, amount:money(p.amount),
  financial_receipt_status:p.financial_receipt_status, ledger_status:p.tax_credit_status,
  tax_event_id:normal(p.tax_event_id), payment_ref:normal(p.payment_transaction_id),
  acs_reference:normal(p.acs_reference), payment_channel:p.payment_channel.replace(/ \(illustrative\)/i,''),
  note:p.note,
}));
/** Localized labels and exact Payment keys; no inferred financial semantics. */
function paymentColumns(t:(key:string)=>string) {
  const columns = (fields: [string,string,boolean?][]):ColDef[] => fields.map(([key,label,badge])=>({type:'col',col:{key,label:t(label),badge:!!badge,truncate:'normal'}}));
  return {
    transactions:columns([['date','colDate'],['taxpayer_name','colTaxpayer'],['assessment_year','ay'],['amount','colAmount'],['financial_receipt_status','colReceipt',true],['ledger_status','colCredit',true]]),
    correction:columns([['id','colCase'],['taxpayer','colTaxpayer'],['reason','colReason'],['amount','colAmount'],['stage','colStage'],['status','status',true]]),
    offline:columns([['id','colEvent'],['taxpayer','colTaxpayer'],['event','colType'],['component','component'],['amount','colAmount'],['status','status',true]]),
    incident:columns([['id','colReference'],['taxpayer','colTaxpayer'],['type','incidentType'],['date','colReported'],['status','status',true]]),
  };
}
const transactionMapping:MobileCardMapping = {primary:'taxpayer_name',identifier:'payment_ref',meta:['financial_receipt_status','ledger_status','assessment_year','payer_name'],status:'ledger_status',date:'date',amount:'amount'};
const correctionMapping:MobileCardMapping = {primary:'taxpayer',identifier:'id',meta:['reason','stage'],status:'status',amount:'amount'};
const offlineMapping:MobileCardMapping = {primary:'taxpayer',identifier:'id',meta:['event','component'],status:'status',amount:'amount'};
const incidentMapping:MobileCardMapping = {primary:'taxpayer',identifier:'id',meta:['type','date'],status:'status',date:'date'};
/** Session-only mock drafts. Module navigation does not clear them; a reload does. */
let mockDraftCounter=0;
const moduleDrafts:Record<'corrections'|'incidents'|'offline-events',TableRow[]>={'corrections':[],'incidents':[],'offline-events':[]};
const pages = ['overview','transactions','taxpayer-360','corrections','incidents','offline-events','analytics'] as const;
type PaymentPage = typeof pages[number];
type DraftKind = 'corrections' | 'incidents' | 'offline-events';
type Details = { title:string; record:TableRow } | null;
const firstDraft = { tin:'', type:'', ay:'', component:'', reduces:'', amount:'', reference:'', source:'', reason:'', evidence:'', noticed:'', altContact:'', nid:'', mobile:'' };

export function PaymentModulePage({page}: {page: string}) {
  const {t} = useTranslation('payment');
  const navigate = useNavigate();
  const current:PaymentPage = pages.includes(page as PaymentPage) ? page as PaymentPage : 'overview';
  const [scopeYear,setScopeYear] = useState('all');
  const [kpiOpen,setKpiOpen] = useState(true);
  const [selectedTin,setSelectedTin] = useState<string>(referenceTaxpayers[0].tin);
  const [taxpayerTab,setTaxpayerTab] = useState('identity');
  const [analyticsTab,setAnalyticsTab] = useState('insights');
  const [details,setDetails] = useState<Details>(null);
  const [draftKind,setDraftKind] = useState<DraftKind | null>(null);
  const [draft,setDraft] = useState(firstDraft);
  const [draftPreview,setDraftPreview] = useState(false);
  const [formError,setFormError] = useState('');
  const [errors,setErrors] = useState<Record<string,string>>({});
  const goto = (id:PaymentPage) => navigate(`/payments/${id}`);
  const view = (record:TableRow,title:string) => setDetails({record,title});
  const openDraft=(kind:DraftKind)=>{setDraftKind(kind);setDraft(firstDraft);setDraftPreview(false);setFormError('');setErrors({});};
  const change=(key:keyof typeof firstDraft,value:string)=>{setDraft(s=>({...s,[key]:value}));setDraftPreview(false);setFormError('');setErrors(s=>({...s,[key]:''}));};
  const previewDraft=()=>{
    const required = draftKind === 'offline-events'
      ? ['tin','type','ay','component','amount','reference','source','reason','evidence']
      : draftKind === 'corrections' ? ['tin','reference','reason','evidence'] : ['type','reason'];
    const next:Record<string,string>={};
    required.forEach(key=>{if(!draft[key as keyof typeof firstDraft].trim())next[key]=t('required');});
    if(draft.tin && !/^\d{12}$/.test(draft.tin))next.tin=t('tinError');
    if(draftKind==='offline-events' && draft.type==='LIABILITY_REDUCED' && !draft.reduces)next.reduces=t('required');
    if(draftKind==='offline-events' && (!Number.isFinite(Number(draft.amount)) || Number(draft.amount)<=0))next.amount=t('amountError');
    setErrors(next);
    if(Object.keys(next).length){setFormError(t('required'));return;}
    setFormError('');setDraftPreview(true);
  };
  const keys=paymentColumns(t);
  const scopedPayments=scopeYear==='all'?samplePayments:samplePayments.filter(p=>p.assessment_year.replace('–','-')===scopeYear);
  const scopedOriginal=referencePayments.filter(p=>scopeYear==='all'||p.ay.replace('–','-')===scopeYear);
  const yearSelect=<AppSelectField id="payment-year-scope" label={t('yearScope')} value={scopeYear} onChange={setScopeYear} compact
    options={[{value:'all',label:t('allYears')},...Array.from(new Set(referencePayments.map(p=>p.ay.replace('–','-')))).sort().reverse().map(y=>({value:y,label:y}))]}/>;
  const taxP=referenceTaxpayers.find(p=>p.tin===selectedTin)??referenceTaxpayers[0];
  const taxPayments=scopedPayments.filter(p=>p.tin===selectedTin);
  const original=scopedOriginal.filter(p=>p.tin===selectedTin);
  const [localRecords,setLocalRecords] = useState<Record<DraftKind,TableRow[]>>(()=>({...moduleDrafts}));
  const corrRows=[...localRecords.corrections,...referenceCorrections.map(x=>({...x,amount:money(x.amount)}))];
  const incidentRows=localRecords.incidents;
  const offlineRows=[...localRecords['offline-events'],...referenceOffline.map(e=>({...e,event:t(`event_${e.event}`),amount:money(e.amount)}))];
  const yearFilters:FilterDef[]=[{key:'assessment_year',label:t('ay'),type:'select',options:['All',...Array.from(new Set(scopedPayments.map(p=>p.assessment_year)))]}];
  const optionKeys={ 'All':'paymentStatuses.all','Failed':'paymentStatuses.failed','Awaiting bank payment':'paymentStatuses.awaiting','Received by Government':'paymentStatuses.received','Not yet credited':'paymentStatuses.notCredited','Eligible — credited':'paymentStatuses.credited','Blocked — under review':'paymentStatuses.blockedCredit','Blocked':'paymentStatuses.blocked','Decided':'paymentStatuses.decided','Draft':'paymentStatuses.draft','Pending':'paymentStatuses.pending','With Reviewer':'paymentStatuses.withReviewer' };
  const payFilters:FilterDef[]=[...yearFilters,{key:'financial_receipt_status',label:t('colReceipt'),type:'select',options:['All',...Array.from(new Set(scopedPayments.map(p=>p.financial_receipt_status)))],optionKeys},{key:'ledger_status',label:t('colCredit'),type:'select',options:['All',...Array.from(new Set(scopedPayments.map(p=>p.ledger_status)))],optionKeys}];
  const queueFilters:FilterDef[]=[{key:'status',label:t('status'),type:'select',options:['All','Blocked','Decided','Draft'],optionKeys},{key:'stage',label:t('colStage'),type:'select',options:['All','With Reviewer','Decided (illustrative)','Draft']}];
  const offlineFilters:FilterDef[]=[{key:'status',label:t('status'),type:'select',options:['All','Pending','Draft'],optionKeys},{key:'event',label:t('eventType'),type:'select',options:['All',...Array.from(new Set(offlineRows.map(e=>String(e.event))))]}];
  const incidentFilters:FilterDef[]=[{key:'type',label:t('incidentType'),type:'select',options:['All',...Array.from(new Set(incidentRows.map(e=>String(e.type))))]}];
  const saveDraft=()=>{
    if(!draftKind||!draftPreview)return;
    const id=`DRAFT-${++mockDraftCounter}`;
    const p=referenceTaxpayers.find(x=>x.tin===draft.tin);
    const common={id,tin:draft.tin,reference:draft.reference,reason:draft.reason,evidence:draft.evidence,source:draft.source,
      ay:draft.ay,amount:draft.amount ? money(Number(draft.amount)) : '—',status:'Draft',type:draft.type,noticed:draft.noticed,
      nid:draft.nid,mobile:draft.mobile,altContact:draft.altContact,reduces:draft.reduces};
    const record:TableRow=draftKind==='corrections' ? {...common,taxpayer:p?.name||draft.tin,stage:'Draft'}
      :draftKind==='incidents' ? {...common,taxpayer:p?.name||t('unknown'),type:t(`incident_${draft.type}`),date:draft.noticed||'—'}
      :{...common,taxpayer:p?.name||draft.tin,event:t(`event_${draft.type}`),component:draft.component};
    moduleDrafts[draftKind]=[record,...moduleDrafts[draftKind]];
    setLocalRecords({...moduleDrafts});setDraftKind(null);setDraftPreview(false);
  };

  const showKpis=(kpis:KpiDef[]) => <CollapsibleKpiSection open={kpiOpen} kpis={kpis}/>;
  const kpi=(label:string,value:string,Icon:typeof Wallet,tone:'primary'|'success'|'warning'|'error'|'neutral'='primary'):KpiDef=>({label,value,icon:Icon,tone});
  const openDetails=(record:TableRow,title:string)=>view(record,title);
  const table=(cols:ColDef[],items:TableRow[],key:string,filters:FilterDef[]=[],mobileMapping?:MobileCardMapping)=>
    <PaymentRecordList key={key+':'+scopeYear} title={t(key)} columns={cols} rows={items} filters={filters} mobileMapping={mobileMapping} onOpen={row=>openDetails(row,t(key))}/>;
  const toolbar=(label:string,action?:()=>void)=> (
    <header className="table-page__header payment-module__header">
      <div><h1 className="table-page__title">{label}</h1><p className="table-page__desc">{t('moduleDescription')}</p></div>
      <div className="table-page__actions">
        {action && <button type="button" className="table-card__toolbar-btn table-card__toolbar-btn--primary" onClick={action}><FilePlus2 size={14} aria-hidden="true"/>{t('addNew')}</button>}
        {(['overview','taxpayer-360','analytics'].includes(current)) && <button type="button" className="table-page__kpi-toggle" aria-expanded={kpiOpen} aria-controls="kpi-section-panel" onClick={()=>setKpiOpen(v=>!v)}>{kpiOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} {kpiOpen?t('hideSummary'):t('showSummary')}</button>}
      </div>
    </header>
  );
  const overview=()=> <>
    {toolbar(t('overview'))}
    <div className="payment-module__year-control">{yearSelect}</div>
    {showKpis([
      kpi(t('payments'),String(scopedPayments.length),CreditCard),
      kpi(t('received'),money(totalReceived(scopedOriginal)),Landmark,'success'),
      kpi(t('eligible'),money(totalEligible(scopedOriginal)),CheckCircle2,'success'),
      kpi(t('blocked'),String(scopedOriginal.filter(p=>p.tax_credit_status==='Blocked — under review').length),ShieldAlert,'warning'),
      kpi(t('offlinePending'),String(referenceOffline.filter(e=>e.status==='Pending' && (scopeYear==='all'||e.ay.replace('–','-')===scopeYear)).length),Clock3,'warning'),
    ])}
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
    <div className="payment-module__year-control">{yearSelect}</div>
    {table(keys.transactions,scopedPayments,'transactions',payFilters,transactionMapping)}
  </>;
  const taxpayer=()=> <>
    {toolbar(t('taxpayer360'))}
    <div className="payment-module__filters"><AppSelectField id="payment-taxpayer" label={t('taxpayer')} value={selectedTin} onChange={setSelectedTin}
      options={referenceTaxpayers.map(p=>({value:p.tin,label:`${p.name} · ${p.tin}${/^\d{12}$/.test(p.tin)?'':` (${t('invalidReference')})`}`}))} searchableAfter={5}/></div>
    <div className="payment-module__year-control">{yearSelect}</div>
    <div className="payment-module__identity"><h2>{taxP.name}</h2><p>{t('tin')}: {taxP.tin} · {taxP.zone} · {taxP.circle}</p></div>
    {showKpis([
      kpi(t('payments'),String(original.length),CreditCard),
      kpi(t('received'),money(totalReceived(original)),Landmark,'success'),
      kpi(t('eligible'),money(totalEligible(original)),CheckCircle2,'success'),
      kpi(t('blocked'),String(original.filter(p=>p.tax_credit_status==='Blocked — under review').length),ShieldAlert,'warning'),
    ])}
    <div className="payment-module__tab-scroll"><TabBar active={taxpayerTab} onChange={setTaxpayerTab} tabs={['identity','taxPosition','returns','paymentsTab','correctionsTab','notices','ledger'].map(id=>({id,label:t(id)}))}/></div>
    {taxpayerTab==='identity' ? <section className="card payment-module__card payment-module__identity-grid">
      {Object.entries({[t('name')]:taxP.name,[t('tin')]:taxP.tin,[t('nidMasked')]:taxP.nid,[t('phoneMasked')]:taxP.phone,[t('zone')]:taxP.zone,[t('circle')]:taxP.circle,[t('type')]:taxP.type,[t('status')]:taxP.status==='Reference'?'—':taxP.status}).map(([k,v])=><div key={k}><p className="payment-module__field-label">{k}</p><p>{v}</p></div>)}
    </section> : taxpayerTab==='paymentsTab' ? <>{table(keys.transactions,taxPayments,'transactions',payFilters,transactionMapping)}</> : taxpayerTab==='correctionsTab' ? table(keys.correction,referenceCorrections.filter(c=>c.taxpayer===taxP.name).map(c=>({...c,amount:money(c.amount)})),'corrections',queueFilters,correctionMapping) :
      taxpayerTab==='taxPosition' ? <section className="card payment-module__card"><h2>{t('taxPosition')}</h2><p className="table-page__desc">{t('taxPositionSummary')}</p><div className="payment-module__identity-grid">{[[t('received'),money(totalReceived(original))],[t('eligible'),money(totalEligible(original))],[t('blocked'),String(original.filter(p=>p.tax_credit_status==='Blocked — under review').length)]].map(([label,value])=><div key={label}><p className="payment-module__field-label">{label}</p><p>{value}</p></div>)}</div></section> :
      taxpayerTab==='ledger' ? <section className="card payment-module__card"><h2>{t('ledger')}</h2><p className="table-page__desc">{t('creditPreview')}</p>{taxPayments.length?table(keys.transactions,taxPayments,'transactions',payFilters,transactionMapping):<p>{t('noSampleRecords')}</p>}</section> :
      taxpayerTab==='notices' ? <section className="card payment-module__card payment-module__empty"><h2>{t('notices')}</h2><p>{t('noSampleNotices')}</p></section> :
      <section className="card payment-module__card payment-module__empty"><h2>{t('returns')}</h2><p>{t('noSampleReturns')}</p></section>}
  </>;
  const corrections=()=> <>
    {toolbar(t('corrections'),()=>openDraft('corrections'))}
    <div className="payment-module__year-control">{yearSelect}</div>
    {table(keys.correction,corrRows,'corrections',queueFilters,correctionMapping)}
  </>;
  const incidents=()=> <>
    {toolbar(t('incidents'),()=>openDraft('incidents'))}
    <div className="payment-module__year-control">{yearSelect}</div>
    {table(keys.incident,incidentRows,'incidents',incidentFilters,incidentMapping)}
  </>;
  const offline=()=> <>
    {toolbar(t('offlineEvents'),()=>openDraft('offline-events'))}
    <div className="payment-module__year-control">{yearSelect}</div>
    {table(keys.offline,offlineRows,'offlineEvents',offlineFilters,offlineMapping)}
  </>;
  const analytics=()=> <>
    {toolbar(t('analytics'))}
    <div className="payment-module__year-control">{yearSelect}</div>
    {showKpis([
      kpi(t('paymentVolume'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.volume),BarChart3),
      kpi(t('successful'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.successful),CheckCircle2,'success'),
      kpi(t('failed'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.failed),AlertTriangle,'error'),
      kpi(t('pending'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.pending),Clock3,'warning'),
      kpi(t('abandoned'),referenceIntelligence.abandonment,Users,'warning'),
      kpi(t('wrongSection'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.wrongSection),ShieldAlert,'warning'),
      kpi(t('wrongYear'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.wrongYear),ShieldAlert,'warning'),
      kpi(t('correctionRequests'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.corrections),CreditCard),
      kpi(t('invalidated'),new Intl.NumberFormat('en-BD').format(referenceIntelligence.invalidatedCredits),AlertTriangle,'error'),
    ])}
    <div className="payment-module__tab-scroll"><TabBar active={analyticsTab} onChange={setAnalyticsTab} tabs={[{id:'insights',label:t('insights')},{id:'monitoring',label:t('monitoring')}]} /></div>
    <p className="table-page__desc">{t('analyticsScope')}</p>
    {analyticsTab==='insights' ? <div className="payment-module__summary-grid">
      <section className="card payment-module__card"><h2>{t('channelPerformance')}</h2>
        {([['Internet Banking',98.1],['bKash',97.6],['Nagad',97.2],['Rocket',96.4],['Visa / Mastercard',91.3]] as const).map(([name,value],index)=><div className="payment-module__metric" key={name}><label htmlFor={`pay-channel-${index}`}>{name}</label><progress id={`pay-channel-${index}`} value={value} max="100"/><p>{value}%</p></div>)}
      </section>
      <section className="card payment-module__card"><h2>{t('funnel')}</h2>
        {([[t('identify'),100],[t('taxPosition'),94],[t('selected'),78],[t('review'),71],[t('channelChosen'),66]] as const).map(([name,value],i)=><div className="payment-module__metric" key={i}><label htmlFor={`pay-funnel-${i}`}>{name}</label><progress id={`pay-funnel-${i}`} value={value} max="100"/><p>{value}%</p></div>)}
      </section>
    </div> : <section className="card payment-module__card payment-module__empty"><h2>{t('monitoring')}</h2><p>{t('noRecords')}</p></section>}
  </>;

  return <div className="table-page payment-module" data-testid={`payment-${current}`}>
    {current==='overview'?overview():current==='transactions'?transactions():current==='taxpayer-360'?taxpayer():current==='corrections'?corrections():current==='incidents'?incidents():current==='offline-events'?offline():analytics()}
    <DynamicDetailsDrawer open={details!==null} onClose={()=>setDetails(null)} title={details?.title} rowData={details?.record??null}
      columns={Object.keys(details?.record??{}).filter(key=>key!=='key').map(key=>({key,label:t(`field_${key}`,{defaultValue:key.replace(/_/g,' ').replace(/\b\w/g,s=>s.toUpperCase())}),groupLabel:
        ['taxpayer_name','tin','payer_name','taxpayer'].includes(key)?t('drawerTaxpayer'):
        ['amount','payment_type','assessment_year','income_year','date','payment_channel'].includes(key)?t('drawerFinancial'):
        ['financial_receipt_status','ledger_status','status'].includes(key)?t('drawerStatus'):
        ['tax_event_id','payment_ref','acs_reference','reference','source','evidence','note'].includes(key)?t('drawerReferences'):t('drawerOther')}))} showActions={false}/>
    <AppModal open={draftKind!==null} title={draftKind?t(`new_${draftKind}`):t('newRequest')} onClose={()=>setDraftKind(null)} size="lg" icon={<FilePlus2 size={16}/>} 
      footer={<><SecondaryButton onClick={()=>draftPreview?setDraftPreview(false):setDraftKind(null)}>{draftPreview?t('edit'):t('cancel')}</SecondaryButton><PrimaryButton onClick={draftPreview?saveDraft:previewDraft}>{draftPreview?t('addToList'):t('reviewDraft')}</PrimaryButton></>}>
      <form id="payment-draft-form" onSubmit={e=>{e.preventDefault();draftPreview?saveDraft():previewDraft();}}>
      <div className="payment-module__form" aria-label={t('newRequest')}>
        <AppSelectField id="payment-draft-tin" label={draftKind==='incidents'?t('claimedTinOptional'):t('tin')} value={draft.tin} onChange={v=>change('tin',v)} required={draftKind!=='incidents'} error={errors.tin} options={[{value:'',label:t('selectTaxpayer')},...referenceTaxpayers.filter(p=>/^\d{12}$/.test(p.tin)).map(p=>({value:p.tin,label:`${p.name} · ${p.tin}`}))]}/>
        {draftKind==='incidents'&&<>
          <AppSelectField id="payment-incident-type" label={t('incidentType')} value={draft.type} onChange={v=>change('type',v)} required error={errors.type} options={[{value:'',label:t('select')},...['ONBOARDING','IDENTITY_MISUSE','UNKNOWN_REP','UNAUTHORIZED_PAYMENT','UNAUTHORIZED_ATTRIBUTION'].map(v=>({value:v,label:t(`incident_${v}`)}))]}/>
          <AppTextField id="payment-incident-nid" label={t('claimedNidOptional')} value={draft.nid} onChange={v=>change('nid',v)}/>
          <AppTextField id="payment-incident-mobile" label={t('claimedMobileOptional')} value={draft.mobile} onChange={v=>change('mobile',v)}/>
          <AppTextField id="payment-incident-reference" label={t('knownReferenceOptional')} value={draft.reference} onChange={v=>change('reference',v)} error={errors.reference}/>
          <AppDateField id="payment-incident-date" label={t('noticedOptional')} value={draft.noticed} onChange={v=>change('noticed',v)} customPicker mobileSheet/>
          <AppTextField id="payment-incident-contact" label={t('alternateContactOptional')} value={draft.altContact} onChange={v=>change('altContact',v)}/>
          <p className="payment-module__note payment-module__full">{t('incidentNoIdentityOracle')}</p>
        </>}
        {draftKind==='offline-events' && <>
          <AppSelectField id="payment-draft-type" label={t('eventType')} value={draft.type} required onChange={v=>change('type',v)} error={errors.type} options={[{value:'',label:t('select')},...['LIABILITY_REDUCED','OFFLINE_PAYMENT','LIABILITY_CREATED'].map(v=>({value:v,label:t(`event_${v}`)}))]}/>
          <AppSelectField id="payment-draft-year" label={t('ay')} value={draft.ay} required onChange={v=>change('ay',v)} error={errors.ay} options={[{value:'',label:t('select')},...['2027–28','2026–27','2025–26','2024–25'].map(v=>({value:v,label:v}))]}/>
          <AppSelectField id="payment-draft-component" label={t('component')} value={draft.component} required onChange={v=>change('component',v)} error={errors.component} options={[{value:'',label:t('select')},...['Regular tax','Assessed demand','Penalty'].map(v=>({value:v,label:v}))]}/>
          {draft.type==='LIABILITY_REDUCED'&&<AppSelectField id="payment-draft-reduces" label={t('reduces')} value={draft.reduces} onChange={v=>change('reduces',v)} options={['','Tax / demand','Penalty','Interest'].map(v=>({value:v,label:v||t('select')}))}/>}
          <AppTextField id="payment-draft-amount" label={t('amount')} value={draft.amount} onChange={v=>change('amount',v)} error={errors.amount} inputMode="decimal" required/>
        </>}
        {draftKind!=='incidents'&&<AppTextField id="payment-draft-reference" label={t('reference')} value={draft.reference} onChange={v=>change('reference',v)} error={errors.reference} required/>}
        {draftKind==='offline-events'&&<AppTextField id="payment-draft-source" label={t('source')} value={draft.source} onChange={v=>change('source',v)} error={errors.source} required/>}
        <AppTextArea id="payment-draft-reason" label={t('reason')} value={draft.reason} onChange={v=>change('reason',v)} error={errors.reason} required={draftKind!=='incidents'}/>
        <AppTextArea id="payment-draft-evidence" label={t('evidenceDescription')} value={draft.evidence} onChange={v=>change('evidence',v)} error={errors.evidence} required={draftKind!=='incidents'}/>
      </div>
      {formError&&<p role="alert" className="payment-module__error">{formError}</p>}
      {draftPreview&&<section className="payment-module__preview" aria-live="polite"><h3>{t('draftReviewed')}</h3><dl className="payment-module__review-grid">{Object.entries(draft).filter(([,value])=>value.trim()).map(([key,value])=><div key={key}><dt>{t(key,{defaultValue:key})}</dt><dd>{key==='type' && draftKind==='offline-events'?t(`event_${value}`):value}</dd></div>)}</dl></section>}
      <button className="sr-only" type="submit" tabIndex={-1} aria-hidden="true">{draftPreview?t('addToList'):t('reviewDraft')}</button>
      </form>
    </AppModal>
  </div>;
}