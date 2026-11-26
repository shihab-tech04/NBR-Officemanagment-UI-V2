import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, ChevronUp, Clock3, CreditCard, FilePlus2, Landmark, ShieldAlert, Users, Wallet } from 'lucide-react';
import { PaymentRecordList } from './PaymentRecordList';
import { PaymentCategoryTag } from './PaymentCategoryTag';
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
  referenceAudit, referencePayments, referenceTaxpayers,
} from './paymentReference';
import { demoTransactions, demoUserIds, transactionTotalMinor } from './paymentScenarioModel';
import { loadSimulationHistory,loadSimulationNotices,type SimulationTransaction,type SimulationNotice } from './simulatedPaymentsApi';
import { getStoryPayments, getStoryNotices, type StoryPayment, type StoryNotice } from './story1OfficeApi';
import { toStoryPaymentRow, toStoryTaxpayerPaymentRow } from './story1PaymentPresentation';
import { OfficeTransactionDrawer } from './OfficeTransactionDrawer';
import {OfficeTaxJourney} from './OfficeTaxJourney';
import {OfficeConsolidatedTaxpayerLedger} from './OfficeConsolidatedTaxpayerLedger';
import { correctionHistoryEvents, registrationHistoryEvents } from './officeTaxJourneyEvidence';
import { availableOfficeOverviewSummary, createSingleFlight } from './officeOverviewData';
import { officePaymentAnalytics } from './officePaymentAnalytics';
import { OfficePaymentDashboardInsights } from './OfficePaymentDashboardInsights';
import { summarizeTaxpayerRecordedActivity } from './officeTaxpayerActivity';
import { buildOfficeBeneficiaryDirectoryRows } from './officeBeneficiaryDirectory';
import { OfficeTaxpayer360Activity, OfficeTaxpayer360Notices } from './OfficeTaxpayer360Activity';
import {getOfficeTaxpayerRegistrations,getOfficePreviewTaxpayers,REGISTRATION_FIELDS,type OfficePreviewTaxpayer,type TaxpayerRegistrationProfile,type RegistrationField} from './officeTaxpayerRegistrationProfiles';
import {OfficeTaxpayerRegistrationDetails} from './OfficeTaxpayerRegistrationDetails';
import {resolveVerifiedOfficeLedgerTin} from './officeVerifiedLedgerIdentity';
import { linkedTaxpayerCorrections } from './officeTaxpayerCorrections';
import {partitionOfficeCorrectionCases} from './officeCorrectionCaseCategories';
import { formatLocalizedCurrency, formatLocalizedDateTime, formatLocalizedNumber } from '../../utils/localeFormatting';
import { localizeRecordValue } from '../../utils/recordDisplay';
import {
  listOfficeCorrectionInquiries,
  submitOfficeCorrectionDecision,
  submitOfficeInitiatedCorrection,
  listOfficeInitiatedCorrections,
  type OfficeInitiatedCorrection,
  type CorrectionReviewAction,
  type OfficeCorrectionInquiry,
  type OfficeCorrectionQueue,
} from './correctionReviewApi';

import {officeCorrectionTargets,validateTypedOfficeCorrection,type TypedOfficeCorrection} from './officeTypedCorrection';

const money = (amount: number) => `৳${new Intl.NumberFormat('en-BD').format(amount)}`;
const normal = (value: string) => value || '—';
const demoProfiles = demoUserIds.map((id,index)=>({
  name:id,tin:`DEMO-TIN-${String(index+1).padStart(3,'0')}`,
  zone:'—',circle:'—',status:'Not verified',type:'—',
  nid:'—',phone:'—'
}));
const demoUserTin=(id:string)=>`DEMO-TIN-${String(demoUserIds.indexOf(id as typeof demoUserIds[number])+1).padStart(3,'0')}`;
const demoDate=(value:string)=>new Date(value).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).replace(/\bSept\b/,'Sep');
const demoTimeline=(events:readonly {occurredAt:string;action:string;note:string}[])=>
  events.map(e=>`${new Date(e.occurredAt).toISOString()} · ${e.action==='SIMULATION_RECORDED'?'RECORDED':e.action} · ${e.note}`).join(' | ');
const demoGlobalRows=demoTransactions.map(tx=>({
  key:tx.id,date:demoDate(tx.createdAt),taxpayer_name:Array.from(new Set(tx.allocations.map(a=>a.beneficiary))).join(', '),
  tin:'—',payer_name:tx.payer,
  payment_type:Array.from(new Set(tx.allocations.map(a=>a.category))).join(', '),
  assessment_year:Array.from(new Set(tx.allocations.map(a=>a.assessmentYear))).join(', '),
  income_year:'—',amount:money(transactionTotalMinor(tx)/100),
  financial_receipt_status:tx.state==='SIMULATED'?'Payment record saved':tx.state,ledger_status:'Tax credit not verified',
  tax_event_id:'—',payment_ref:tx.id,acs_reference:'—',payment_channel:'Not connected',
  beneficiary_count:new Set(tx.allocations.map(a=>a.beneficiary)).size,
  allocation_count:tx.allocations.length,
  allocations:tx.allocations.map(a=>`${a.id}: ${a.beneficiary} / ${a.category} / AY ${a.assessmentYear} / ${money(a.amountMinor/100)}`).join(' | '),
  transaction_timeline:demoTimeline(tx.events),event_timeline:demoTimeline(tx.events),
  note:'Settlement and tax credit are not verified'
}));
const demoAllocationRows=demoTransactions.flatMap(tx=>tx.allocations.map(a=>({
  key:`${tx.id}:${a.id}`,date:demoDate(tx.createdAt),taxpayer_name:a.beneficiary,
  tin:demoUserTin(a.beneficiary),payer_name:tx.payer,payment_type:a.category,
  assessment_year:a.assessmentYear,income_year:'—',amount:money(a.amountMinor/100),
  financial_receipt_status:tx.state==='SIMULATED'?'Payment record saved':tx.state,ledger_status:'Tax credit not verified',
  tax_event_id:'—',payment_ref:tx.id,acs_reference:'—',payment_channel:'Not connected',
  allocation_id:a.id,transaction_total:money(transactionTotalMinor(tx)/100),
  transaction_timeline:demoTimeline(tx.events),event_timeline:demoTimeline(tx.events),note:'Beneficiary allocation only; never an official tax credit'
})));
/** Transactions always come from the same hosted SQL snapshot as TaxPay. */
const liveTransactionRows=(records:SimulationTransaction[])=>records.map(tx=>({
  key:tx.transactionId,date:demoDate(tx.createdAt),
  taxpayer_name:Array.from(new Set(tx.allocations.map(a=>a.beneficiary))).join(', '),
  tin:'—',payer_name:tx.payer,payment_type:Array.from(new Set(tx.allocations.map(a=>a.category))).join(', '),
  assessment_year:Array.from(new Set(tx.allocations.map(a=>a.assessmentYear))).join(', '),income_year:'—',
  amount:money(tx.totalMinor/100),financial_receipt_status:tx.state==='SIMULATED'?'Payment record saved':tx.state,
  ledger_status:'Tax credit not verified',tax_event_id:'—',payment_ref:tx.id,acs_reference:'—',
  payment_channel:'Not connected',beneficiary_count:new Set(tx.allocations.map(a=>a.beneficiary)).size,
  allocation_count:tx.allocations.length,
  allocations:tx.allocations.map(a=>`#${a.lineNo}: ${a.beneficiary} / ${a.category} / AY ${a.assessmentYear} / ${money(a.amountMinor/100)}`).join(' | '),
  transaction_timeline:demoTimeline(tx.events),event_timeline:demoTimeline(tx.events),
  note:'Settlement and tax credit are not verified'
}));
const liveAllocationRows=(records:SimulationTransaction[])=>records.flatMap(tx=>tx.allocations.map(a=>({
  key:tx.transactionId+':'+a.lineNo,date:demoDate(tx.createdAt),
  taxpayer_name:a.beneficiary,tin:demoUserTin(a.beneficiary),payer_name:tx.payer,
  payment_type:a.category,assessment_year:a.assessmentYear,income_year:'—',
  amount:money(a.amountMinor/100),financial_receipt_status:tx.state==='SIMULATED'?'Payment record saved':tx.state,
  ledger_status:'Tax credit not verified',tax_event_id:'—',payment_ref:tx.id,acs_reference:'—',
  payment_channel:'Not connected',allocation_id:a.id,transaction_timeline:demoTimeline(tx.events),event_timeline:demoTimeline(tx.events),
  note:'SQL-beneficiary allocation; no official credit'
})));
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
    transactions:columns([['date','colDate'],['taxpayer_name','colTaxpayer'],['payer_name','colPayer'],['payment_type','Service'],['assessment_year','ay'],['amount','colAmount'],['financial_receipt_status','colReceipt',true],['ledger_status','colCredit',true]]),
    correction:columns([['id','colCase'],['taxpayer','colTaxpayer'],['reason','colReason'],['amount','colAmount'],['stage','colStage'],['status','status',true]]),
    offline:columns([['id','colEvent'],['taxpayer','colTaxpayer'],['event','colType'],['component','component'],['amount','colAmount'],['status','status',true]]),
    incident:columns([['id','colReference'],['taxpayer','colTaxpayer'],['type','incidentType'],['date','colReported'],['status','status',true]]),
  };
}
const transactionMapping:MobileCardMapping = {primary:'taxpayer_name',identifier:'payment_ref',meta:['financial_receipt_status','ledger_status','assessment_year','payer_name'],status:'ledger_status',date:'date',amount:'amount'};
const beneficiaryAllocationMapping:MobileCardMapping = {primary:'taxpayer_name',identifier:'payment_ref',meta:['payment_type','assessment_year'],date:'date',amount:'amount'};
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
const firstDraft = { outcome:'', tin:'', type:'', ay:'', component:'', reduces:'', amount:'', reference:'', source:'', reason:'', evidence:'', noticed:'', altContact:'', nid:'', mobile:'' };

export function PaymentModulePage({page,taxpayerTin,paymentId}: {page: string;taxpayerTin?:string;paymentId?:string}) {
  const {t,i18n} = useTranslation('payment');
  const {t:translateTables} = useTranslation('tables');
  const displayNumber = (value:number) => formatLocalizedNumber(value,i18n.resolvedLanguage);
  const displayMoney = (amount:number) => formatLocalizedCurrency(amount,i18n.resolvedLanguage);
  const displayRecord = (value:string) => localizeRecordValue(value,translateTables,i18n.resolvedLanguage);
  const displayEventDate = (value:string) => formatLocalizedDateTime(value,i18n.resolvedLanguage);
  const navigate = useNavigate();
  const current:PaymentPage = pages.includes(page as PaymentPage) ? page as PaymentPage : 'overview';
  const [scopeYear,setScopeYear] = useState('all');
  const [paymentDataset,setPaymentDataset] = useState<'reference'|'scenarios'|'connected'>('reference');
  const [liveTransactions,setLiveTransactions] = useState<SimulationTransaction[]>([]);
  const [liveNotices,setLiveNotices] = useState<SimulationNotice[]>([]);
  const [storyPayments,setStoryPayments] = useState<StoryPayment[]>([]);
  const [storyNotices,setStoryNotices] = useState<StoryNotice[]>([]);
  const [storyLoading,setStoryLoading]=useState(true);
  const [storyError,setStoryError]=useState('');
  const [storyNoticeUnavailable,setStoryNoticeUnavailable]=useState(false);
  const [storyRefreshKey,setStoryRefreshKey]=useState(0);
  // Payment records require the existing authorized Office Auth and SQL contract.
  useEffect(()=>{
    let mounted=true;
    setStoryLoading(true);
    setStoryError('');
    const refresh=createSingleFlight(async()=>{
      try {
        const payments=await getStoryPayments();
        // A notice-service failure must never blank the payment register or its dashboard.
        let notices:StoryNotice[]=[];
        let noticeUnavailable=false;
        try {notices=await getStoryNotices();}
        catch {noticeUnavailable=true;}
        if(mounted){
          const visibleIds=new Set(payments.map(item=>item.id));
          setStoryPayments(payments);
          setStoryNotices(notices.filter(notice=>visibleIds.has(notice.paymentId)));
          setStoryNoticeUnavailable(noticeUnavailable);
          setStoryError('');
          setStoryLoading(false);
        }
      }catch(e){if(mounted){setStoryError(e instanceof Error?e.message:'Payment connection failed');setStoryLoading(false);}}
    });
    void refresh();
    // A full payment read spans multiple SQL pages; never overlap refreshes.
    const timer=window.setInterval(()=>void refresh(),30000);
    return()=>{mounted=false;window.clearInterval(timer);};
  },[storyRefreshKey]);
  const [liveError,setLiveError] = useState('');
  const [liveLoading,setLiveLoading] = useState(true);
  const [kpiOpen,setKpiOpen] = useState(true);
  const [selectedTin,setSelectedTin] = useState<string>(taxpayerTin??'');
  useEffect(()=>{setSelectedTin(taxpayerTin??'');},[taxpayerTin]);
  const [taxpayerTab,setTaxpayerTab] = useState('identity');
  const [previewAccounts,setPreviewAccounts] = useState<OfficePreviewTaxpayer[]>([]);
  const [previewLoading,setPreviewLoading] = useState(false);
  const [previewError,setPreviewError] = useState('');
  useEffect(()=>{
    if(current!=='taxpayer-360'){setPreviewAccounts([]);setPreviewError('');return;}
    let active=true,inFlight=false;
    const refresh=async()=>{
      if(!active||inFlight||document.visibilityState==='hidden')return;
      inFlight=true;
      setPreviewLoading(true);
      try{
        const items=await getOfficePreviewTaxpayers();
        if(active){setPreviewAccounts(items);setPreviewError('');}
      }catch(error){
        if(active){setPreviewAccounts([]);setPreviewError(error instanceof Error?error.message:'Preview directory unavailable');}
      }finally{inFlight=false;if(active)setPreviewLoading(false);}
    };
    const onFocus=()=>void refresh();
    const onVisible=()=>{if(document.visibilityState==='visible')void refresh();};
    void refresh();
    const timer=window.setInterval(()=>void refresh(),30000);
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onVisible);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisible);};
  },[current]);
  const [registrationProfiles,setRegistrationProfiles] = useState<TaxpayerRegistrationProfile[]>([]);
  const [registrationLoading,setRegistrationLoading] = useState(false);
  const [registrationError,setRegistrationError] = useState('');
  useEffect(()=>{
    if(current!=='taxpayer-360'){setRegistrationProfiles([]);setRegistrationError('');return;}
    let active=true,inFlight=false;
    setRegistrationLoading(true);setRegistrationProfiles([]);setRegistrationError('');
    const refresh=async()=>{
      if(!active||inFlight||document.visibilityState==='hidden')return;
      inFlight=true;
      try{
        const items=await getOfficeTaxpayerRegistrations();
        if(active){setRegistrationProfiles(items);setRegistrationError('');}
      }catch(error){
        if(active){
          setRegistrationProfiles([]);
          setRegistrationError(error instanceof Error?error.message:'Profile source unavailable');
        }
      }finally{
        inFlight=false;
        if(active)setRegistrationLoading(false);
      }
    };
    const onFocus=()=>{void refresh();};
    const onVisible=()=>{if(document.visibilityState==='visible')void refresh();};
    void refresh();
    const timer=window.setInterval(()=>{void refresh();},30000);
    window.addEventListener('focus',onFocus);
    document.addEventListener('visibilitychange',onVisible);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisible);};
  },[current]);
  const [analyticsTab,setAnalyticsTab] = useState('insights');
  const [details,setDetails] = useState<Details>(null);
  const [paymentLinkUnavailable,setPaymentLinkUnavailable]=useState(false);
  const handledPaymentLink=useRef<string|null>(null);
  useEffect(()=>{
    if(!paymentId){
      handledPaymentLink.current=null;
      setPaymentLinkUnavailable(false);
      return;
    }
    if(current!=='transactions'||storyLoading||handledPaymentLink.current===paymentId)return;
    handledPaymentLink.current=paymentId;
    const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId);
    const match=valid?storyPayments.find(item=>item.id.toLowerCase()===paymentId.toLowerCase()):undefined;
    if(!match){
      setDetails(null);
      setPaymentLinkUnavailable(true);
      return;
    }
    setPaymentLinkUnavailable(false);
    setDetails({record:toStoryPaymentRow(match),title:t('transactions')});
  },[paymentId,current,storyLoading,storyPayments,t]);
  const [officeCorrectionQueue,setOfficeCorrectionQueue] = useState<OfficeCorrectionQueue>({enabled:false,role:null,items:[]});
  const [correctionQueueTab,setCorrectionQueueTab]=useState<'corrections'|'reports'>('corrections');
  const [officeCorrectionLoading,setOfficeCorrectionLoading] = useState(false);
  const [officeCorrectionError,setOfficeCorrectionError] = useState('');
  const [correctionRefreshKey,setCorrectionRefreshKey] = useState(0);
  const [correctionDecision,setCorrectionDecision] = useState<{requestId:string;action:CorrectionReviewAction}|null>(null);
  const [correctionDecisionReason,setCorrectionDecisionReason] = useState('');
  const [correctionDecisionError,setCorrectionDecisionError] = useState('');
  const [correctionDecisionSubmitting,setCorrectionDecisionSubmitting] = useState(false);
  const [officeInitiated,setOfficeInitiated]=useState<OfficeInitiatedCorrection[]>([]);
  const [officeInitiationLoading,setOfficeInitiationLoading]=useState(false);
  const [officeInitiationError,setOfficeInitiationError]=useState('');
  const [initiationSubmitting,setInitiationSubmitting]=useState(false);
  const [initiationIdempotencyKey,setInitiationIdempotencyKey]=useState(()=>crypto.randomUUID());
  const [initiationStatus,setInitiationStatus]=useState('');
  const [draftKind,setDraftKind] = useState<DraftKind | null>(null);
  const [draft,setDraft] = useState(firstDraft);
  const [draftPreview,setDraftPreview] = useState(false);
  const [typedTargetKey,setTypedTargetKey]=useState('');
  const [typedProposal,setTypedProposal]=useState({proposedAY:'',proposedCircle:'',proposedHeadCode:''});
  const typedTargets=officeCorrectionTargets(storyPayments,draft.tin.trim(),draft.reference.trim());
  const typedTarget=typedTargets.find(target=>target.key===typedTargetKey);
  const typedCorrection:TypedOfficeCorrection|null=typedTarget?{allocationIndex:typedTarget.allocationIndex,allocationId:typedTarget.allocationId,currentAY:typedTarget.currentAY,currentCircle:typedTarget.currentCircle,currentHeadCode:typedTarget.currentHeadCode,...typedProposal}:null;
  const isDirectCorrection=draftKind==='corrections'&&officeCorrectionQueue.role==='SUPER_ADMIN';
  const [formError,setFormError] = useState('');
  const [errors,setErrors] = useState<Record<string,string>>({});
  const chooseTypedTarget=(key:string)=>{const target=typedTargets.find(item=>item.key===key);setTypedTargetKey(key);setTypedProposal({proposedAY:target?.currentAY??'',proposedCircle:target?.currentCircle??'',proposedHeadCode:target?.currentHeadCode??''});setDraftPreview(false);setFormError('');};
  useEffect(()=>{
    let active=true;
    const sync=async()=>{
      try {const rows=await loadSimulationHistory(null,'all');
        if(active){setLiveTransactions(rows);setLiveError('');setLiveLoading(false);}}
      catch(e){if(active){setLiveTransactions([]);setLiveError(e instanceof Error?e.message:'SQL connection failed');setLiveLoading(false);}}
    };
    void sync();const interval=window.setInterval(()=>void sync(),7000);
    return()=>{active=false;window.clearInterval(interval);};
  },[]);
  useEffect(()=>{
    const index=demoProfiles.findIndex(p=>p.tin===selectedTin);
    if(index<0){setLiveNotices([]);return;}
    const id=demoUserIds[index];
    let active=true;setLiveNotices([]);
    const sync=async()=>{try{const items=await loadSimulationNotices(id);if(active)setLiveNotices(items);}catch{if(active)setLiveNotices([]);/* No cached notices survive identity/authorization loss */}};
    void sync();const interval=window.setInterval(()=>void sync(),7000);
    return()=>{active=false;window.clearInterval(interval);};
  },[selectedTin]);
  useEffect(()=>{
    if(current!=='corrections' && !(current==='taxpayer-360' && !!selectedTin &&
      (taxpayerTab==='correctionsTab'||taxpayerTab==='taxJourney')))return;
    let active=true;
    const refresh=async()=>{
      try{
        const queue=await listOfficeCorrectionInquiries();
        if(active){setOfficeCorrectionQueue(queue);setOfficeCorrectionError('');setOfficeCorrectionLoading(false);}
        try{
          const initiated=await listOfficeInitiatedCorrections();
          if(active){setOfficeInitiated(initiated);setOfficeInitiationError('');setOfficeInitiationLoading(false);}
        }catch(error){
          if(active){setOfficeInitiated([]);setOfficeInitiationError(t('officeCorrectionQueueUnavailable'));setOfficeInitiationLoading(false);}
        }
      }catch(error){
        if(active){setOfficeCorrectionQueue({enabled:false,role:null,items:[]});setOfficeCorrectionError(t('officeCorrectionQueueUnavailable'));setOfficeCorrectionLoading(false);}
      }
    };
    setOfficeCorrectionLoading(true);
    setOfficeInitiationLoading(true);
    void refresh();
    const journeyOnly=current==='taxpayer-360'&&taxpayerTab==='taxJourney';
    if(journeyOnly){
      const onFocus=()=>void refresh();
      const onVisible=()=>{if(document.visibilityState==='visible')void refresh();};
      window.addEventListener('focus',onFocus);
      document.addEventListener('visibilitychange',onVisible);
      return()=>{active=false;window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onVisible);};
    }
    const timer=window.setInterval(()=>void refresh(),15000);
    return()=>{active=false;window.clearInterval(timer);};
  },[current,correctionRefreshKey,selectedTin,taxpayerTab]);
  const goto = (id:PaymentPage) => navigate(`/payments/${id}`);
  const view = (record:TableRow,title:string) => setDetails({record,title});
  const closeTransactionDetails=()=>{
    setDetails(null);
    if(paymentId)navigate('/payments/transactions',{replace:true});
  };
  const isTransactionDetails = details?.title === t('transactions');
  // The 360 payment drawer receives the same canonical SQL parent as Transactions.
  // Its display is independently scoped to the selected TIN and year below.
  const selectedStoryPayment = isTransactionDetails &&
    (current === 'transactions' || current === 'taxpayer-360' || current === 'overview')
    ? storyPayments.find(payment => payment.id === String(details?.record.payment_ref ?? '')) ?? null
    : null;
  const selectedCorrectionId=typeof details?.record.__correctionInquiryId==='string'
    ?details.record.__correctionInquiryId:null;
  const selectedCorrectionActions=Array.isArray(details?.record.__correctionAvailableActions)
    ?details.record.__correctionAvailableActions as CorrectionReviewAction[]:[];
  const correctionActionLabel=(action:CorrectionReviewAction)=>
    t(`officeCorrectionAction.${action}`,{defaultValue:action.replace(/_/g,' ')});

  const openDraft=(kind:DraftKind)=>{setDraftKind(kind);setDraft(firstDraft);setDraftPreview(false);setFormError('');setErrors({});setInitiationIdempotencyKey(crypto.randomUUID());setInitiationStatus('');setTypedTargetKey('');setTypedProposal({proposedAY:'',proposedCircle:'',proposedHeadCode:''});};
  const change=(key:keyof typeof firstDraft,value:string)=>{if(key==='tin'||key==='reference'){setTypedTargetKey('');setTypedProposal({proposedAY:'',proposedCircle:'',proposedHeadCode:''});}setDraft(s=>({...s,[key]:value}));setDraftPreview(false);setFormError('');setErrors(s=>({...s,[key]:''}));};
  const previewDraft=()=>{
    const required = draftKind === 'offline-events'
      ? ['tin','type','ay','component','amount','reference','source','reason','evidence']
      : draftKind === 'corrections' ? ['tin','reference','reason','outcome','evidence'] : ['type','reason'];
    const next:Record<string,string>={};
    required.forEach(key=>{if(!draft[key as keyof typeof firstDraft].trim())next[key]=t('required');});
    if(draft.tin && !(draftKind==='corrections'?/^\d{12,13}$/:/^\d{12}$/).test(draft.tin))next.tin=t('tinError');
    if(draftKind==='corrections'){
      if(draft.reference && !/^[A-Za-z0-9][A-Za-z0-9._/-]{5,79}$/.test(draft.reference.trim())) next.reference=t('required');
      if(draft.reason && (draft.reason.trim().length<10||draft.reason.trim().length>1000)) next.reason=t('required');
      if(draft.outcome && (draft.outcome.trim().length<10||draft.outcome.trim().length>600)) next.outcome=t('required');
      if(draft.evidence && (draft.evidence.trim().length<10||draft.evidence.length>2000)) next.evidence=t('required');
    }
    if(draftKind==='offline-events' && draft.type==='LIABILITY_REDUCED' && !draft.reduces)next.reduces=t('required');
    if(draftKind==='offline-events' && (!Number.isFinite(Number(draft.amount)) || Number(draft.amount)<=0))next.amount=t('amountError');
    if(isDirectCorrection&&(!typedCorrection||!validateTypedOfficeCorrection(typedCorrection))){setErrors(next);setFormError(t('typedCorrectionInvalid'));return;}
    setErrors(next);
    if(Object.keys(next).length){setFormError(t('required'));return;}
    setFormError('');setDraftPreview(true);
  };
  const submitInitiatedCorrection=async()=>{
    if(draftKind!=='corrections'||!draftPreview||initiationSubmitting)return;
    if(officeCorrectionQueue.role!=='SUPER_ADMIN'&&officeCorrectionQueue.role!=='MAKER'&&officeCorrectionQueue.role!=='APPROVER'){
      setFormError(i18n.resolvedLanguage?.startsWith('bn')?'অনুমোদিত সুপার অ্যাডমিন সেশন প্রয়োজন।':'A verified Super Admin correction session is required.');return;
    }
    const ref=draft.reference.trim(), tin=draft.tin.trim();
    const payments=storyPayments.filter(payment=>
      (payment.id===ref||payment.details?.receiptReference===ref||
       payment.details?.receiptSnapshot?.challanNo===ref)&&
      (payment.details?.taxpayerTin===tin||
       payment.details?.allocations?.some(a=>a.taxpayerTin===tin)));
    if(payments.length!==1){
      setFormError(i18n.resolvedLanguage?.startsWith('bn')?'এই করদাতার সঙ্গে নির্ভরযোগ্যভাবে যুক্ত একটি পেমেন্ট নির্বাচন করুন।':'Select exactly one connected payment belonging to this taxpayer.');return;
    }
    if(draft.outcome.trim().length<10||draft.outcome.trim().length>600||
       draft.reason.trim().length<10||draft.reason.trim().length>1000||
       draft.evidence.trim().length<10||draft.evidence.length>2000){
      setFormError(i18n.resolvedLanguage?.startsWith('bn')?'কারণ, প্রত্যাশিত ফলাফল এবং প্রমাণের বিবরণ পূরণ করুন।':'Complete reason, requested outcome and evidence within the supported limits.');return;
    }
    if(officeCorrectionQueue.role==='SUPER_ADMIN'&&(!typedTarget||!typedCorrection||typedTarget.paymentId!==payments[0].id||!validateTypedOfficeCorrection(typedCorrection))){setFormError(t('typedCorrectionInvalid'));return;}
    setInitiationSubmitting(true);setFormError('');
    try{
      await submitOfficeInitiatedCorrection({
        paymentId:payments[0].id,taxpayerTin:tin,originalReference:ref,
        reason:draft.reason,requestedOutcome:draft.outcome,
        evidenceNote:draft.evidence,idempotencyKey:initiationIdempotencyKey,
        ...(officeCorrectionQueue.role==='SUPER_ADMIN'&&typedCorrection?{correction:typedCorrection}:{}),
      });
      setInitiationStatus(officeCorrectionQueue.role==='SUPER_ADMIN'?t('typedCorrectionQueued'):i18n.resolvedLanguage?.startsWith('bn')
        ?'অনুরোধটি Office SQL-এ সংরক্ষিত হয়েছে। মূল করদাতা ডাটাবেসের যাচাই ও সংশ্লিষ্ট করদাতার নিশ্চিতকরণ অপেক্ষমাণ।'
        :'Office correction queued. Original Taxpayer SQL verification and account claim are pending.');
      setDraftKind(null);setDraftPreview(false);setCorrectionRefreshKey(v=>v+1);
    }catch(error){
      setFormError(error instanceof Error?error.message:'Could not submit correction');
    }finally{setInitiationSubmitting(false);}
  };
  const submitCorrectionDecision=async()=>{
    if(!correctionDecision)return;
    const reason=correctionDecisionReason.trim();
    if(reason.length<5||reason.length>1000){setCorrectionDecisionError(t('officeCorrectionReasonError'));return;}
    setCorrectionDecisionSubmitting(true);setCorrectionDecisionError('');
    try{
      await submitOfficeCorrectionDecision(correctionDecision.requestId,correctionDecision.action,
        reason,crypto.randomUUID());
      setCorrectionDecision(null);setCorrectionDecisionReason('');setDetails(null);
      setCorrectionRefreshKey(value=>value+1);
    }catch(error){
      setCorrectionDecisionError(t('officeCorrectionDecisionFailed'));
    }finally{setCorrectionDecisionSubmitting(false);}
  };
  const keys=paymentColumns(t);
  const storyRows=storyPayments.map(toStoryPaymentRow);
  const storySummary=availableOfficeOverviewSummary(storyPayments,storyNotices,scopeYear,storyLoading,storyError);
  // The actual Transactions page must never mix in reference snapshots,
  // scenario fixtures, authenticated preview ledgers or QA API records.
  // Payment Overview and Transactions always show TaxPay-submitted SQL demo rows,
  // never historical reference fixtures or private simulated-ledger examples.
  const allRows=current==='transactions'||current==='overview'?storyRows:paymentDataset==='reference'?samplePayments:paymentDataset==='scenarios'?demoGlobalRows:[...storyRows,...liveTransactionRows(liveTransactions)];
  const scopedPayments=scopeYear==='all'?allRows:allRows.filter(p=>p.assessment_year.split(', ').some(y=>y.replace('–','-')===scopeYear));
  const yearSelect=<AppSelectField id="payment-year-scope" label={t('yearScope')} value={scopeYear} onChange={setScopeYear} compact
    options={[{value:'all',label:t('allYears')},...Array.from(new Set([...referencePayments.map(p=>p.ay.replace('–','-')),...demoTransactions.flatMap(tx=>tx.allocations.map(a=>a.assessmentYear)),...storyRows.flatMap(row=>row.assessment_year.split(', ').map(year=>year.trim().replace('–','-')).filter(year=>year!=='—'))])).sort().reverse().map(y=>({value:y,label:y}))]}/>;
  // The directory follows the same 30 selectable Taxpayer preview accounts,
  // including those without payments. Payments remain scoped by their source
  // allocations, never guessed from a taxpayer name or a displayed sample TIN.
  const bnPreview=i18n.resolvedLanguage?.startsWith('bn')??false;
  const taxpayerAccounts=previewAccounts.map(preview=>{
    const own=storyPayments.filter(payment=>toStoryTaxpayerPaymentRow(payment,preview.sampleTin,'all')!==null);
    const latest=own.map(payment=>payment.createdAt).filter(date=>Number.isFinite(Date.parse(date)))
      .sort((a,b)=>Date.parse(b)-Date.parse(a))[0];
    return {
      key:preview.sampleTin,tin:preview.sampleTin,
      taxpayer_name:bnPreview?preview.nameBn:preview.nameEn,
      records:storyLoading||storyError?'—':own.length,
      last_activity:storyLoading||storyError?'—':latest?displayEventDate(latest):'—',
    };
  });
  const selectedPreview=previewAccounts.find(item=>item.sampleTin===selectedTin);
  const registrationProfile=registrationProfiles.find(p=>selectedPreview
    ?p.accountId===selectedPreview.accountId:p.tin===selectedTin);
  // Preview identifiers are fictional and cannot scope SQL reads. The ledger
  // accepts only the canonical TIN from a source-verified registration profile
  // bound to this selected preview account (or exact direct TIN selection).
  const ledgerTin=resolveVerifiedOfficeLedgerTin(selectedTin,
    selectedPreview?.accountId??null,registrationProfile??null);
  // A preview-only render record gives every account the approved 24-field
  // profile structure without asserting missing certificate facts as real.
  // This is never written to Taxpayer SQL or treated as a verified identity.
  const previewRoleLabel=selectedPreview?.roleCode==='TAXPAYER_CORPORATE'
    ?(bnPreview?'কোম্পানি':'Company')
    :selectedPreview?.roleCode==='WITHHOLDING_AGENT'
      ?(bnPreview?'উৎসে কর কর্তনকারী':'Withholding agent')
      :(bnPreview?'ব্যক্তি':'Individual');
  const previewCircle=selectedPreview?.jurisdictionLabel||
    (selectedPreview?'circle-'+selectedPreview.accountId.slice(4):'');
  const previewRegistrationRecord:TaxpayerRegistrationProfile|null=selectedPreview?{
    accountId:selectedPreview.accountId,tin:selectedPreview.sampleTin,
    revision:0,updatedAt:'',
    profile:{
      ...(Object.fromEntries(REGISTRATION_FIELDS.map(key=>[key,null])) as Record<RegistrationField,string|null>),
      taxpayerName:bnPreview?selectedPreview.nameBn:selectedPreview.nameEn,
      taxpayerStatus:previewRoleLabel,
      tinType:previewRoleLabel,
      taxesCircle:previewCircle,
      tin:null,
      source:'SYNTHETIC',sourceUpdatedAt:'',
    }
  }:null;
  const connectedTaxpayer=taxpayerAccounts.find(p=>p.tin===selectedTin);
  const taxP=connectedTaxpayer?{
    name:connectedTaxpayer.taxpayer_name,tin:selectedTin,
    nid:'—',phone:'—',zone:'—',circle:'—',type:'—',status:'Not verified'
  }:[...demoProfiles,...referenceTaxpayers].find(p=>p.tin===selectedTin)??{
    name:'—',tin:selectedTin,nid:'—',phone:'—',zone:'—',circle:'—',type:'—',status:'Not verified'
  };
  if(registrationProfile){
    taxP.name=registrationProfile.profile.taxpayerName||selectedPreview?.[bnPreview?'nameBn':'nameEn']||registrationProfile.accountId;
    taxP.zone=registrationProfile.profile.taxesZone||'—';
    taxP.circle=registrationProfile.profile.taxesCircle||'—';
    taxP.type=registrationProfile.profile.tinType||'—';
    taxP.phone=registrationProfile.profile.mobileNumber||'—';
    taxP.status=registrationProfile.profile.taxpayerStatus||'—';
  }
  const isDemo=demoProfiles.some(p=>p.tin===selectedTin);
  const taxPayments=storyPayments.map(payment=>toStoryTaxpayerPaymentRow(payment,selectedTin,scopeYear))
    .filter((row):row is NonNullable<typeof row>=>row!==null);
  const taxpayerJourneyPayments=storyPayments.map(payment=>toStoryTaxpayerPaymentRow(payment,selectedTin,'all'))
    .filter((row):row is NonNullable<typeof row>=>row!==null);
  const journeySourceById=new Map(storyPayments.map(payment=>[payment.id,payment.createdAt]));
  const taxpayerJourneyEntries=taxpayerJourneyPayments.map(record=>({
    record,occurredAt:journeySourceById.get(String(record.payment_ref??''))??''
  }));
  const linkedJourneyCorrections=officeCorrectionQueue.enabled && !storyLoading && !storyError
    ? linkedTaxpayerCorrections(officeCorrectionQueue.items,storyPayments,selectedTin,'all'):[];
  const taxpayerJourneyEvidenceEvents=[
    ...registrationHistoryEvents(registrationProfile),
    ...correctionHistoryEvents(linkedJourneyCorrections),
  ];
  const taxpayerActivity=storyLoading||storyError?null:
    summarizeTaxpayerRecordedActivity(storyPayments,storyNotices,selectedTin,scopeYear);
  const beneficiaryAllocationRows:TableRow[]=ledgerTin&&!storyLoading&&!storyError
    ?buildOfficeBeneficiaryDirectoryRows(storyPayments,ledgerTin,scopeYear).map(row=>({
      key:row.id,date:demoDate(row.paymentDate),taxpayer_name:row.taxpayerName,tin:row.taxpayerTin,
      payment_type:row.allocation,assessment_year:row.assessmentYear,
      amount:displayMoney(row.amountMinor/100),payment_ref:row.paymentId,
    }))
    :[];
  const beneficiaryAllocationColumns:ColDef[]=[
    {type:'col',col:{key:'tin',label:bnPreview?'টিআইএন':t('tin'),truncate:'normal'}},
    {type:'col',col:{key:'taxpayer_name',label:bnPreview?'করদাতার নাম':t('colTaxpayer'),truncate:'normal'}},
    {type:'col',col:{key:'payment_type',label:bnPreview?'বরাদ্দ':'Allocation',truncate:'normal'}},
    {type:'col',col:{key:'assessment_year',label:bnPreview?'করবর্ষ':t('ay'),truncate:'normal'}},
    {type:'col',col:{key:'amount',label:t('colAmount'),truncate:'normal'}},
    {type:'col',col:{key:'date',label:t('colDate'),truncate:'normal'}},
  ];
  const beneficiaryNotices=isDemo?liveNotices:[];
  const [localRecords,setLocalRecords] = useState<Record<DraftKind,TableRow[]>>(()=>({...moduleDrafts}));
  const correctionStateLabel=(state:string)=>t(`officeCorrectionState.${state}`,{defaultValue:state.replace(/_/g,' ')});
  const caseCategories=partitionOfficeCorrectionCases(officeCorrectionQueue.items);
  const officeCorrectionRows:TableRow[]=officeCorrectionQueue.items.map((item:OfficeCorrectionInquiry)=>({
    key:`office-correction:${item.requestId}`,
    id:`COR-${item.requestId.slice(0,8).toUpperCase()}`,
    taxpayer:item.originalReference,
    reason:item.reason,
    amount:'—',
    stage:correctionStateLabel(item.reviewState),
    status:correctionStateLabel(item.reviewState),
    original_reference:item.originalReference,
    requested_outcome:item.requestedOutcome,
    supporting_evidence:item.evidenceNote??'—',
    case_type:item.caseKind==='UNSOLICITED_PAYMENT_REPORT'
      ?(i18n.resolvedLanguage?.startsWith('bn')?'অনাকাঙ্ক্ষিত পেমেন্ট প্রতিবেদন':'Unsolicited payment report')
      :(i18n.resolvedLanguage?.startsWith('bn')?'সংশোধন পর্যালোচনা':'Correction review'),
    evidence_state:item.evidenceState,
    change_kind:item.changeKind??'—',
    old_value:item.oldValue??'—',
    new_value:item.newValue??'—',
    created_at:item.createdAt,
    review_state:correctionStateLabel(item.reviewState),
    review_revision:item.reviewRevision,
    review_updated_at:item.reviewUpdatedAt,
    pending_delivery:item.pendingDelivery?t('officeCorrectionDecisionPending'):t('officeCorrectionDecisionDelivered'),
    delivery_state:item.deliveryState??'—',
    delivery_error:item.lastDeliveryError??'—',
    // Display audited, TaxPay-acknowledged decisions inside the existing
    // detail drawer. No extra role, route, layout or hidden record access.
    decision_history:item.decisionHistory.length
      ?item.decisionHistory.map(event=>[
        correctionActionLabel(event.action),
        event.officerUid
          ?(i18n.resolvedLanguage?.startsWith('bn')?'কর্মকর্তা: ':'Officer: ')+event.officerUid
          :event.role,
        displayEventDate(event.occurredAt),
        event.reason ?t('field_reason')+': '+event.reason:null,
      ].filter(Boolean).join(' · ')).join(' | ')
      :'—',
    __correctionInquiryId:item.requestId,
    __correctionAvailableActions:item.availableActions,
  }));
  const taxpayerCorrectionIds=new Set(linkedJourneyCorrections
    .filter(item=>toStoryTaxpayerPaymentRow(item.payment,selectedTin,scopeYear)!==null)
    .map(item=>item.inquiry.requestId));
  const taxpayerCorrectionRows=officeCorrectionRows.filter(row=>taxpayerCorrectionIds.has(String(row.__correctionInquiryId)));
  // Never interleave illustrative cases with an operational correction queue.
  const correctionCaseIds=new Set(caseCategories.corrections.map(item=>item.requestId));
  const reportCaseIds=new Set(caseCategories.reports.map(item=>item.requestId));
  const pendingInitiationRows:TableRow[]=officeInitiated.filter(item=>!item.sourceConfirmed||(item.sourceAppliedCorrection&&!correctionCaseIds.has(item.caseId))).map(item=>({
    key:'office-initiation:'+item.caseId,id:'COR-'+item.caseId.slice(0,8).toUpperCase(),
    taxpayer:item.originalReference,reference:item.originalReference,
    reason:item.reason,requested_outcome:item.requestedOutcome,
    evidence:item.evidenceNote,amount:'—',
    stage:item.sourceAppliedCorrection?'APPROVED':item.deliveryState,status:item.sourceAppliedCorrection?t('officeCorrectionReviewState.APPROVED',{defaultValue:'Approved'}):item.deliveryState==='ACKNOWLEDGED'
      ?(i18n.resolvedLanguage?.startsWith('bn')?'করদাতার নিশ্চিতকরণের অপেক্ষায়':'Awaiting taxpayer claim')
      :(i18n.resolvedLanguage?.startsWith('bn')?'Taxpayer SQL সিঙ্ক অপেক্ষমাণ':'Taxpayer SQL synchronization pending'),
    source_payment_id:item.sourcePaymentId,
    created_at:item.createdAt,initiated_by_role:item.officerRole,
    ...(item.sourceAppliedCorrection?{assessment_year:item.sourceAppliedCorrection.assessmentYear,tax_circle:item.sourceAppliedCorrection.circle,tax_head:item.sourceAppliedCorrection.headCode,allocation_id:item.sourceAppliedCorrection.allocationId??'—'}:{}),
  }));
  const correctionReviewRows=[...localRecords.corrections,...pendingInitiationRows,
    ...officeCorrectionRows.filter(row=>correctionCaseIds.has(String(row.__correctionInquiryId)))];
  const reportRows=officeCorrectionRows.filter(row=>reportCaseIds.has(String(row.__correctionInquiryId)));
  const corrRows=correctionQueueTab==='reports'?reportRows:correctionReviewRows;
  const incidentRows=localRecords.incidents;
  // No verified SQL-backed offline-event reader is connected; show only unsent drafts.
  const offlineRows=[...localRecords['offline-events']];
  const yearOptions=['All',...Array.from(new Set([
    ...storyRows.flatMap(row=>String(row.assessment_year??'').split(',').map(y=>y.trim().replace('–','-'))),
    ...localRecords.corrections.map(row=>String(row.ay??'')),
    ...localRecords['offline-events'].map(row=>String(row.ay??''))
  ].filter(y=>y&&y!=='—'))).sort().reverse()];
  const yearFilters:FilterDef[]=[{key:'assessment_year',label:t('ay'),type:'select',options:yearOptions}];
  const eventYearFilter:FilterDef={key:'ay',label:t('ay'),type:'select',options:yearOptions};
  const optionKeys={ 'All':'paymentStatuses.all','Failed':'paymentStatuses.failed','Awaiting bank payment':'paymentStatuses.awaiting','Received by Government':'paymentStatuses.received','Not yet credited':'paymentStatuses.notCredited','Eligible — credited':'paymentStatuses.credited','Blocked — under review':'paymentStatuses.blockedCredit','Blocked':'paymentStatuses.blocked','Decided':'paymentStatuses.decided','Draft':'paymentStatuses.draft','Pending':'paymentStatuses.pending','With Reviewer':'paymentStatuses.withReviewer' };
  const payFilters:FilterDef[]=[...yearFilters,{key:'financial_receipt_status',label:t('colReceipt'),type:'select',options:['All',...Array.from(new Set(scopedPayments.map(p=>p.financial_receipt_status)))],optionKeys},{key:'ledger_status',label:t('colCredit'),type:'select',options:['All',...Array.from(new Set(scopedPayments.map(p=>p.ledger_status)))],optionKeys}];
  const queueFilters:FilterDef[]=[eventYearFilter,
    {key:'status',label:t('status'),type:'select',options:['All',...new Set(corrRows.map(row=>String(row.status??'')).filter(Boolean))],optionKeys},
    {key:'stage',label:t('colStage'),type:'select',options:['All',...new Set(corrRows.map(row=>String(row.stage??'')).filter(Boolean))]}];
  const offlineFilters:FilterDef[]=[eventYearFilter,{key:'status',label:t('status'),type:'select',options:['All','Pending','Draft'],optionKeys},{key:'event',label:t('eventType'),type:'select',options:['All',...Array.from(new Set(offlineRows.map(e=>String(e.event))))]}];
  const incidentFilters:FilterDef[]=[eventYearFilter,{key:'type',label:t('incidentType'),type:'select',options:['All',...Array.from(new Set(incidentRows.map(e=>String(e.type))))]}];
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
  const table=(cols:ColDef[],items:TableRow[],key:string,filters:FilterDef[]=[],mobileMapping?:MobileCardMapping)=> {
    const kind=key==='offlineEvents'?'offline-events':key as 'transactions'|'corrections'|'incidents'|'offline-events';
    return <PaymentRecordList key={kind+':'+scopeYear} kind={kind} title={t(key)} columns={cols} rows={items} filters={filters} mobileMapping={mobileMapping} onOpen={row=>openDetails(row,t(key))}/>;
  };
  const toolbar=(label:string,action?:()=>void)=> (
    <header className="table-page__header payment-module__header">
      <div><h1 className="table-page__title">{label}</h1><p className="table-page__desc">{t(`description_${current.replace(/-/g,'_')}`)}</p></div>
      <div className="table-page__actions">
        {action && <button type="button" className="table-card__toolbar-btn table-card__toolbar-btn--primary" onClick={action}><FilePlus2 size={14} aria-hidden="true"/>{t('addNew')}</button>}
        {(['overview','taxpayer-360','analytics'].includes(current)) && <button type="button" className="table-page__kpi-toggle" aria-expanded={kpiOpen} aria-controls="kpi-section-panel" onClick={()=>setKpiOpen(v=>!v)}>{kpiOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>} {kpiOpen?t('hideSummary'):t('showSummary')}</button>}
      </div>
    </header>
  );
  const overview=()=> <>
    {toolbar(t('overview'))}
    <div className="payment-module__year-control">{yearSelect}</div>
    {storySummary?.amountMinor===null&&<p role="alert" className="table-page__desc">{i18n.resolvedLanguage==='bn'?'পেমেন্টের পরিমাণ যাচাই করা যায়নি।':'Could not verify the payment amounts.'}</p>}
    {showKpis([
      kpi(i18n.resolvedLanguage==='bn'?'পেমেন্ট রেকর্ড':'Payment records',storySummary?displayNumber(storySummary.count):'—',CreditCard),
      kpi(i18n.resolvedLanguage==='bn'?'মোট নথিভুক্ত পরিমাণ':'Total recorded amount',!storySummary||storySummary.amountMinor===null?'—':displayMoney(storySummary.amountMinor/100),Wallet),
      kpi(i18n.resolvedLanguage==='bn'?'সেবার ধরন':'Service categories',storySummary?displayNumber(storySummary.services):'—',BarChart3),
      kpi(i18n.resolvedLanguage==='bn'?'ইন-অ্যাপ বিজ্ঞপ্তি':'In-app payment notices',storySummary&&!storyNoticeUnavailable?displayNumber(storySummary.notificationCount):'—',Users),
      kpi(i18n.resolvedLanguage==='bn'?'সর্বশেষ রেকর্ড':'Latest record',storySummary?.latestDate?displayEventDate(storySummary.latestDate):'—',Clock3),
    ])}
    <OfficePaymentDashboardInsights
      payments={storySummary?storyPayments:[]} year={scopeYear}
      loading={storyLoading} error={storyError}
      onRetry={()=>setStoryRefreshKey(value=>value+1)}
      language={i18n.resolvedLanguage?.startsWith('bn')?'bn':'en'}
      formatCount={displayNumber} formatDate={displayEventDate}
      onOpenPayment={row=>view(row,t('transactions'))}
      onViewTransactions={()=>goto('transactions')}
      onSelectYear={setScopeYear}/>
    <div className="payment-module__summary-grid">
      <section className="card payment-module__card"><div className="payment-module__section-top"><h2>{t('attention')}</h2><SecondaryButton size="sm" onClick={()=>goto('corrections')}>{t('viewQueue')}</SecondaryButton></div>
        <p className="table-page__desc">{i18n.resolvedLanguage==='bn'?'পেমেন্টস > ট্রানজ্যাকশনস-এ পেমেন্ট রেকর্ড দেখুন। কর্মকর্তার অনুমোদন এখনো চালু নেই।':'View payment records under Payments > Transactions. Officer approvals are not available yet.'}</p>
      </section>
      <section className="card payment-module__card"><div className="payment-module__section-top"><h2>{t('recentAudit')}</h2><SecondaryButton size="sm" onClick={()=>navigate('/audit/audit-trail')}>{t('centralAudit')}</SecondaryButton></div>
        {storySummary&&storyNotices.slice(0,4).map(n=><button className="payment-module__record-link" key={`story-${n.id}`} type="button" onClick={()=>{setPaymentDataset('connected');goto('transactions');}}><strong>{t('payments')}</strong><p>{displayEventDate(n.createdAt)} · {n.paymentId}</p></button>)}
        {storySummary&&storyNoticeUnavailable&&<p className="table-page__desc" role="status">{i18n.resolvedLanguage?.startsWith('bn')?'নোটিশ উৎস অনুপলব্ধ। পেমেন্ট রেকর্ড প্রভাবিত নয়।':'Payment notices are unavailable; payment records remain accessible.'}</p>}
        {storySummary&&!storyNoticeUnavailable&&!storyNotices.length&&<p className="table-page__desc">{i18n.resolvedLanguage==='bn'?'সাম্প্রতিক পেমেন্ট বিজ্ঞপ্তি নেই।':'No recent payment notices.'}</p>}
      </section>
    </div>
  </>;
  const transactions=()=> <>
    {toolbar(t('transactions'))}
    {storyLoading?<p className="table-page__desc" role="status">Loading transactions…</p>:null}
    {storyError?<p className="table-page__desc" role="alert">{storyError}</p>:null}
    {paymentLinkUnavailable&&<p className="table-page__desc" role="alert">
      {i18n.resolvedLanguage?.startsWith('bn')?'বিজ্ঞপ্তির পেমেন্ট রেকর্ডটি উপলভ্য নয়।':'The linked payment record is unavailable.'}
    </p>}
    {!storyLoading&&!storyError&&scopedPayments.length===0?<p className="table-page__desc" role="status">No payments submitted yet.</p>:null}
    {table(keys.transactions,scopedPayments,'transactions',payFilters,transactionMapping)}
  </>;
  const taxpayer=()=> !taxpayerTin ? <>
    {toolbar(t('taxpayer360'))}
    <p className="table-page__desc">{t('taxpayerRegisterScope')}</p>
    {storyLoading && <p role="status" className="table-page__desc">{t('loadingTaxpayers')}</p>}
    {storyError && <p role="alert" className="table-page__desc">{storyError}</p>}
    {registrationLoading&&<p role="status" className="table-page__desc">{i18n.resolvedLanguage?.startsWith('bn')?'প্রোফাইল লোড হচ্ছে…':'Loading taxpayer profiles…'}</p>}
    {registrationError&&<p role="alert" className="table-page__desc">{registrationError}</p>}
    {previewLoading&&<p role="status" className="table-page__desc">{bnPreview?'করদাতাদের তালিকা লোড হচ্ছে…':'Loading all 30 Taxpayer accounts…'}</p>}
    {previewError&&<p role="alert" className="table-page__desc">{previewError}</p>}
    {!previewLoading&&!previewError&&previewAccounts.length!==30&&<p role="alert" className="table-page__desc">{bnPreview?'করদাতা তালিকা অসম্পূর্ণ।':'Taxpayer directory incomplete.'}</p>}
    <PaymentRecordList kind="taxpayers" title={t('taxpayerRegister')} rows={taxpayerAccounts}
      columns={[
        {type:'col',col:{key:'taxpayer_name',label:t('name'),truncate:'normal'}},
        {type:'col',col:{key:'tin',label:bnPreview?'নমুনা টিআইএন':'Sample TIN',truncate:'normal'}},
        {type:'col',col:{key:'records',label:t('linkedPaymentRecords'),truncate:'normal'}},
        {type:'col',col:{key:'last_activity',label:t('colDate'),truncate:'normal'}}
      ]} mobileMapping={{primary:'taxpayer_name',identifier:'tin',meta:['records'],date:'last_activity'}}
      onOpen={record=>navigate('/payments/taxpayer-360/'+encodeURIComponent(String(record.tin??'')))}/>
  </> : <>
    <SecondaryButton size="sm" onClick={()=>navigate('/payments/taxpayer-360')}>{t('backToTaxpayers')}</SecondaryButton>
    {toolbar(t('taxpayer360'))}
    <p className="table-page__desc">{t('taxpayerDetailScope')}</p>
    {registrationLoading&&<p role="status" className="table-page__desc">{i18n.resolvedLanguage?.startsWith('bn')?'প্রোফাইল লোড হচ্ছে…':'Loading taxpayer profiles…'}</p>}
    {registrationError&&<p role="alert" className="table-page__desc">{registrationError}</p>}
    <div className="payment-module__year-control">{yearSelect}</div>
    <div className="payment-module__identity"><h2>{taxP.name}</h2>
      <p>{t('tin')}: {registrationProfile?.tin ? registrationProfile.tin.slice(0,3)+'****' : (bnPreview?'পাওয়া যায়নি':'Not available')} · {taxP.zone} · {taxP.circle}</p>
      {selectedPreview&&<p>{bnPreview?'নমুনা পেমেন্ট রেফারেন্স':'Sample payment reference'}: {selectedTin.slice(0,3)}****</p>}
    </div>
    {showKpis([
      kpi(i18n.resolvedLanguage?.startsWith('bn')?'সংযুক্ত পেমেন্ট':'Linked payments',taxpayerActivity?displayNumber(taxpayerActivity.linkedRecords):'—',CreditCard),
      kpi(i18n.resolvedLanguage?.startsWith('bn')?'সংরক্ষিত পেমেন্টের পরিমাণ':'Saved record amount',taxpayerActivity?.recordedSavedAmountMinor!==null&&taxpayerActivity?displayMoney(taxpayerActivity.recordedSavedAmountMinor/100):'—',Wallet,'neutral'),
      kpi(i18n.resolvedLanguage?.startsWith('bn')?'সংযুক্ত করবর্ষ':'Assessment years',taxpayerActivity?displayNumber(taxpayerActivity.assessmentYears.length):'—',BarChart3),
      kpi(i18n.resolvedLanguage?.startsWith('bn')?'পেমেন্ট বিজ্ঞপ্তি':'Payment notices',taxpayerActivity?displayNumber(taxpayerActivity.notices.length):'—',Users),
    ])}
    {taxpayerActivity&&<OfficeTaxpayer360Activity snapshot={taxpayerActivity}
      language={i18n.resolvedLanguage?.startsWith('bn')?'bn':'en'}
      formatCount={displayNumber} formatDate={displayEventDate}
      onOpen={row=>view(row,t('transactions'))}/>}
    <div className="payment-module__tab-scroll"><TabBar active={taxpayerTab} onChange={setTaxpayerTab} tabs={['identity','taxPosition','returns','paymentsTab','beneficiaries','correctionsTab','notices','ledger','taxJourney'].map(id=>({id,label:id==='beneficiaries'?(bnPreview?'সুবিধাভোগী':'Beneficiaries'):id==='taxJourney'?(bnPreview?'কর যাত্রা':'Tax journey'):t(id)}))}/></div>
    {taxpayerTab==='identity' && registrationProfile && !registrationLoading && !registrationError
      ? <OfficeTaxpayerRegistrationDetails record={registrationProfile}
          language={bnPreview?'bn':'en'}/>
      : taxpayerTab==='identity' && previewRegistrationRecord
      ? <>
          <p className="table-page__desc" role="status" data-testid="office-taxpayer-preview-profile">{bnPreview
            ?'এটি করদাতা প্রকল্পের একই লগইন প্রিভিউ অ্যাকাউন্ট। পূর্ণ নিবন্ধন তথ্যের যাচাইকৃত SQL রেকর্ড পাওয়া যায়নি। নিচের অপ্রাপ্য ঘরগুলো অনুমান করে পূরণ করা হয়নি।'
            :'This is the same selectable Taxpayer preview account. No full verified SQL registration is available; missing fields below are intentionally left unavailable.'}</p>
          <OfficeTaxpayerRegistrationDetails record={previewRegistrationRecord}
            language={bnPreview?'bn':'en'}/>
        </>
      : taxpayerTab==='identity' ? <section className="card payment-module__card" role="status">
          <p>{bnPreview?'করদাতার পরিচয় যাচাই করা যায়নি।':'No source-verified taxpayer identity is available.'}</p>
        </section> : taxpayerTab==='paymentsTab' ? <>{table(keys.transactions,taxPayments,'transactions',payFilters,transactionMapping)}</> :
      taxpayerTab==='beneficiaries' ? <section className="card payment-module__card" data-testid="office-taxpayer-beneficiary-scope">
        <div className="payment-module__section-top">
          <h2>{bnPreview?'পেমেন্ট-সংযুক্ত বরাদ্দ':'Payment-linked allocations'}</h2>
          {ledgerTin&&<button type="button" className="table-card__toolbar-btn" disabled={storyLoading}
            onClick={()=>setStoryRefreshKey(value=>value+1)}>{bnPreview?'রিফ্রেশ':'Refresh'}</button>}
        </div>
        <p className="table-page__desc">{bnPreview
          ?'শুধু এই যাচাইকৃত করদাতার অনুমোদিত পেমেন্টে SQL-এ সংরক্ষিত ও মিলানো বরাদ্দ দেখানো হচ্ছে। ব্যক্তিগত সংরক্ষিত যোগাযোগ ও ট্যাগ ব্যক্তিগতই থাকে।'
          :'Only reconciled SQL allocations from this verified taxpayer’s authorized payment records are shown. Saved contact lists and tags remain private.'}</p>
        {!ledgerTin
          ?<p className="table-page__desc" role="status">{bnPreview
            ?'করদাতার যাচাইকৃত ১২-সংখ্যার টিআইএন পাওয়া যায়নি। কোনো ব্যক্তিগত তালিকা দেখানো হচ্ছে না।'
            :'A source-verified 12-digit TIN is required. No private address-book data is shown.'}</p>
          :storyLoading
            ?<p className="table-page__desc" role="status">{bnPreview?'পেমেন্ট বরাদ্দ লোড হচ্ছে…':'Loading payment allocations…'}</p>
            :storyError
              ?<p className="table-page__desc" role="alert">{storyError}</p>
              :beneficiaryAllocationRows.length
                ?<>
                  <p className="table-page__desc" role="status">{displayNumber(beneficiaryAllocationRows.length)} {bnPreview?'টি সংযুক্ত বরাদ্দ রেকর্ড':'linked allocation records'}</p>
                  <PaymentRecordList kind="transactions"
                    title={bnPreview?'পেমেন্ট-সংযুক্ত বরাদ্দ':'Payment-linked allocations'}
                    rows={beneficiaryAllocationRows} columns={beneficiaryAllocationColumns}
                    mobileMapping={beneficiaryAllocationMapping}
                    onOpen={record=>view(record,t('transactions'))}/>
                </>
                :<p className="table-page__desc" role="status">{bnPreview
                  ?'এই করদাতার জন্য কোনো মিলানো পেমেন্ট বরাদ্দ পাওয়া যায়নি।'
                  :'No reconciled payment allocations were found for this taxpayer.'}</p>}
      </section> : taxpayerTab==='correctionsTab' ? <>
      {officeCorrectionLoading&&<p className="table-page__desc" role="status">{t('officeCorrectionLoading')}</p>}
      {officeCorrectionError&&<p className="table-page__desc" role="alert">{officeCorrectionError}</p>}
      {!officeCorrectionLoading&&!officeCorrectionError&&!officeCorrectionQueue.enabled&&<p className="table-page__desc" role="status">{t('officeCorrectionQueueUnavailable')}</p>}
      {officeCorrectionQueue.enabled&&!storyLoading&&!storyError&&<>
        <p className="table-page__desc">{i18n.resolvedLanguage?.startsWith('bn')
          ?'শুধু এই করদাতার নির্ভরযোগ্যভাবে সংযুক্ত পেমেন্টের সংশোধন আবেদন দেখানো হচ্ছে।'
          :'Showing correction inquiries matched to this taxpayer through a reconciled payment reference only.'}</p>
        {taxpayerCorrectionRows.length
          ? table(keys.correction,taxpayerCorrectionRows,'corrections',[],correctionMapping)
          : <p className="table-page__desc" role="status">{i18n.resolvedLanguage?.startsWith('bn')?'এই করদাতার জন্য সংযুক্ত সংশোধন আবেদন পাওয়া যায়নি।':'No correction inquiries were linked to this taxpayer.'}</p>}
      </>}
      {(storyLoading||storyError)&&<p className="table-page__desc" role={storyError?'alert':'status'}>{storyError||t('loadingTaxpayers')}</p>}
    </> :
      taxpayerTab==='taxPosition' ? <section className="card payment-module__card"><h2>{t('taxPosition')}</h2><p className="table-page__desc">{t('taxPositionNotVerified')}</p></section> :
      taxpayerTab==='taxJourney' ? <OfficeTaxJourney entries={taxpayerJourneyEntries}
        evidenceEvents={taxpayerJourneyEvidenceEvents}
        paymentsLoading={storyLoading} paymentsError={storyError}
        profileLoading={registrationLoading} profileError={registrationError}
        correctionsLoading={officeCorrectionLoading} correctionsError={officeCorrectionError}
        correctionsAvailable={officeCorrectionQueue.enabled}
        language={i18n.resolvedLanguage?.startsWith('bn')?'bn':'en'} onOpen={record=>view(record,t('transactions'))}/> :
      taxpayerTab==='ledger' ? <OfficeConsolidatedTaxpayerLedger tin={ledgerTin} /> :
      taxpayerTab==='notices' ? taxpayerActivity
        ? <OfficeTaxpayer360Notices snapshot={taxpayerActivity}
            language={i18n.resolvedLanguage?.startsWith('bn')?'bn':'en'}
            formatDate={displayEventDate} onOpen={row=>view(row,t('transactions'))}/>
        : <section className="card payment-module__card"><h2>{t('notices')}</h2>
            <p className="table-page__desc" role="status">{storyLoading?t('loadingTaxpayers'):storyError||t('noSampleNotices')}</p>
          </section> :
      <section className="card payment-module__card payment-module__empty"><h2>{t('returns')}</h2><p>{t('noSampleReturns')}</p></section>}
  </>;
  const corrections=()=> <>
    {toolbar(t('corrections'),()=>openDraft('corrections'))}
    {initiationStatus&&<p role="status" aria-live="polite" className="table-page__desc">{initiationStatus}</p>}
    {officeInitiationLoading&&<p role="status" className="table-page__desc">{i18n.resolvedLanguage?.startsWith('bn')?'অফিসের নতুন আবেদন লোড হচ্ছে…':'Loading Office-initiated corrections…'}</p>}
    {officeInitiationError&&<p role="alert" className="table-page__desc">{officeInitiationError}</p>}
    {officeCorrectionLoading&&<p className="table-page__desc" role="status">{t('officeCorrectionLoading')}</p>}
    {officeCorrectionError&&<p className="table-page__desc" role="alert">{officeCorrectionError}</p>}
    {!officeCorrectionLoading&&!officeCorrectionQueue.enabled&&!officeCorrectionError&&
      <p className="table-page__desc" role="status">{t('officeCorrectionQueueUnavailable')}</p>}
    {officeCorrectionQueue.enabled&&officeCorrectionQueue.role&&<p className="table-page__desc" role="status">
      {t('officeCorrectionRole')}: {t(`officeCorrectionRoleNames.${officeCorrectionQueue.role}`,{defaultValue:officeCorrectionQueue.role})}
      {' · '}{officeCorrectionQueue.items.length} {t('officeCorrectionItems')}
    </p>}
    <div className="payment-module__tab-scroll" data-testid="office-separate-payment-report-queue">
      <TabBar active={correctionQueueTab}
        onChange={value=>setCorrectionQueueTab(value==='reports'?'reports':'corrections')}
        tabs={[
          {id:'corrections',label:(i18n.resolvedLanguage?.startsWith('bn')?'সংশোধনের আবেদন':'Correction requests')+' ('+correctionReviewRows.length+')'},
          {id:'reports',label:(i18n.resolvedLanguage?.startsWith('bn')?'পেমেন্টের প্রতিবেদন':'Payment reports')+' ('+reportRows.length+')'},
        ]}/>
    </div>
    <p className="table-page__desc" role="note">{correctionQueueTab==='reports'
      ?(i18n.resolvedLanguage?.startsWith('bn')
        ?'শুধু করদাতার করা অনাকাঙ্ক্ষিত পেমেন্টের রিপোর্ট। এগুলো যাচাই বা আর্থিক সংশোধনের প্রমাণ নয়।'
        :'Recipient-reported unsolicited payments only. Reports are not proof of verified ownership, settlement or financial correction.')
      :(i18n.resolvedLanguage?.startsWith('bn')
        ?'এখানে শুধু সংযুক্ত সংশোধন আবেদন ও এই সেশনে তৈরি খসড়া দেখানো হচ্ছে। খসড়া SQL বা করদাতা পোর্টালে জমা হয়নি।'
        :'Only connected correction inquiries and drafts from this session are listed. Drafts are not submitted to SQL or the taxpayer portal.')}</p>
    {table(keys.correction,corrRows,'corrections',queueFilters,correctionMapping)}
  </>;
  const incidents=()=> <>
    {toolbar(t('incidents'),()=>openDraft('incidents'))}
    <p className="table-page__desc" role="note">{i18n.resolvedLanguage?.startsWith('bn')
      ?'এই উন্মুক্ত সংস্করণে সংযুক্ত ইনসিডেন্ট রেজিস্টার নেই। এখানে শুধু এই সেশনের খসড়া দেখা যায়।'
      :'No connected incident register is available in this open workspace. Only drafts from this session appear here.'}</p>
    {table(keys.incident,incidentRows,'incidents',incidentFilters,incidentMapping)}
  </>;
  const offline=()=> <>
    {toolbar(t('offlineEvents'),()=>openDraft('offline-events'))}
    <p className="table-page__desc" role="note">{i18n.resolvedLanguage?.startsWith('bn')
      ?'কোনো সংযুক্ত অফলাইন আর্থিক ঘটনা রেজিস্টার নেই। এখানে শুধু এই সেশনের জমা না দেওয়া খসড়া দেখানো হচ্ছে।'
      :'No connected offline financial-event register is available. Only unsubmitted drafts from this session are listed.'}</p>
    {table(keys.offline,offlineRows,'offlineEvents',offlineFilters,offlineMapping)}
  </>;
  const analyticsSnapshot=storyLoading||storyError?null:officePaymentAnalytics(storyPayments,scopeYear);
  const analytics=()=> <>
    {toolbar(t('analytics'))}
    <p className="table-page__desc">{i18n.resolvedLanguage==='bn'?'শুধু নথিভুক্ত পেমেন্ট কার্যক্রমের পরিসংখ্যান। ট্রেজারি নিষ্পত্তি বা কর ক্রেডিটের প্রমাণ নয়।':'Based on recorded payment activity only; not evidence of Treasury settlement or tax credit.'}</p>
    <div className="payment-module__year-control">{yearSelect}</div>
    {storyLoading&&<p className="table-page__desc" role="status">{i18n.resolvedLanguage==='bn'?'পেমেন্ট তথ্য লোড হচ্ছে…':'Loading recorded payment activity…'}</p>}
    {storyError&&<p className="table-page__desc" role="alert">{storyError}</p>}
    {showKpis([
      kpi(i18n.resolvedLanguage==='bn'?'পেমেন্ট রেকর্ড':'Payment records',analyticsSnapshot?displayNumber(analyticsSnapshot.total):'—',BarChart3),
      kpi(i18n.resolvedLanguage==='bn'?'নথিভুক্ত পেমেন্ট':'Saved records',analyticsSnapshot?displayNumber(analyticsSnapshot.saved):'—',CheckCircle2),
      kpi(i18n.resolvedLanguage==='bn'?'ব্যর্থ রেকর্ড':'Failed records',analyticsSnapshot?displayNumber(analyticsSnapshot.failed):'—',AlertTriangle),
      kpi(i18n.resolvedLanguage==='bn'?'প্রক্রিয়াধীন রেকর্ড':'Pending records',analyticsSnapshot?displayNumber(analyticsSnapshot.pending):'—',Clock3),
      kpi(i18n.resolvedLanguage==='bn'?'সেবার ধরন':'Service categories',analyticsSnapshot?displayNumber(analyticsSnapshot.services.length):'—',CreditCard),
      kpi(i18n.resolvedLanguage==='bn'?'নথিভুক্ত পরিমাণ':'Recorded amount',analyticsSnapshot?.amountMinor!==null&&analyticsSnapshot?displayMoney(analyticsSnapshot.amountMinor/100):'—',Wallet),
    ])}
    <div className="payment-module__tab-scroll"><TabBar active={analyticsTab} onChange={setAnalyticsTab} tabs={[{id:'insights',label:t('insights')},{id:'monitoring',label:t('monitoring')}]} /></div>
    {analyticsTab==='insights' ? <div className="payment-module__summary-grid">
      <section className="card payment-module__card"><h2>{i18n.resolvedLanguage==='bn'?'পেমেন্ট পদ্ধতি':'Payment methods'}</h2>
        {analyticsSnapshot?.methods.map(([name,count],index)=><div className="payment-module__metric" key={name}><label htmlFor={`pay-channel-${index}`}>{name}</label><progress id={`pay-channel-${index}`} value={count} max={analyticsSnapshot.total||1}/><p>{displayNumber(count)}</p></div>)}
        {analyticsSnapshot&&analyticsSnapshot.methods.length===0&&<p className="table-page__desc">{t('noRecords')}</p>}
      </section>
      <section className="card payment-module__card"><h2>{i18n.resolvedLanguage==='bn'?'সেবা অনুযায়ী রেকর্ড':'Records by service'}</h2>
        {analyticsSnapshot?.services.map(([name,count],index)=><div className="payment-module__metric" key={name}><label htmlFor={`pay-service-${index}`}>{name}</label><progress id={`pay-service-${index}`} value={count} max={analyticsSnapshot.total||1}/><p>{displayNumber(count)}</p></div>)}
        {analyticsSnapshot&&analyticsSnapshot.services.length===0&&<p className="table-page__desc">{t('noRecords')}</p>}
      </section>
    </div> : <section className="card payment-module__card payment-module__empty"><h2>{t('monitoring')}</h2><p>{t('noRecords')}</p></section>}
  </>;

  return <div className="table-page payment-module" data-testid={`payment-${current}`}>
    {current==='overview'?overview():current==='transactions'?transactions():current==='taxpayer-360'?taxpayer():current==='corrections'?corrections():current==='incidents'?incidents():current==='offline-events'?offline():analytics()}
    <OfficeTransactionDrawer
      row={isTransactionDetails ? details?.record ?? null : null}
      source={selectedStoryPayment}
      scopeTin={isTransactionDetails && current==='taxpayer-360' ? taxpayerTin : undefined}
      scopeYear={isTransactionDetails && current==='taxpayer-360' ? scopeYear : undefined}
      onClose={closeTransactionDetails}
    />
    <DynamicDetailsDrawer open={details!==null && !isTransactionDetails} onClose={() => setDetails(null)}
      title={details?.title} rowData={!isTransactionDetails ? details?.record ?? null : null}
      extraFooterActions={selectedCorrectionId&&selectedCorrectionActions.length>0?<div className="flex flex-wrap gap-2">
        {selectedCorrectionActions.map(action=>{
          const startReview=action==='APPROVE'||action==='MAKER_ACKNOWLEDGE'||action==='REVIEWER_VERIFY'||action==='APPROVER_CLOSE';
          const onClick=()=>{setCorrectionDecision({requestId:selectedCorrectionId,action});setCorrectionDecisionReason('');setCorrectionDecisionError('');};
          return startReview
            ?<PrimaryButton key={action} size="sm" onClick={onClick}>{correctionActionLabel(action)}</PrimaryButton>
            :<SecondaryButton key={action} size="sm" onClick={onClick}>{correctionActionLabel(action)}</SecondaryButton>;
        })}
      </div>:undefined}
      renderValue={(key,value)=>key==='payment_type'?<PaymentCategoryTag value={String(value??'')}/>:undefined}
      columns={Object.keys(!isTransactionDetails ? details?.record??{} : {}).filter(key=>key!=='key'&&!key.startsWith('__')).map(key=>({
        key,label:t(`field_${key}`,{defaultValue:key.replace(/_/g,' ').replace(/\\b\\w/g,s=>s.toUpperCase())}),
        groupLabel:
          ['taxpayer_name','tin','payer_name','taxpayer'].includes(key)?t('drawerTaxpayer'):
          ['amount','payment_type','assessment_year','income_year','date','payment_channel'].includes(key)?t('drawerFinancial'):
          ['financial_receipt_status','ledger_status','status'].includes(key)?t('drawerStatus'):
          ['tax_event_id','payment_ref','acs_reference','reference','source','evidence','note'].includes(key)?t('drawerReferences'):t('drawerOther')
      }))} showActions={false}/>
    <AppModal open={correctionDecision!==null} title={correctionDecision?t(`officeCorrectionAction.${correctionDecision.action}`):t('officeCorrectionDecisionTitle')}
      onClose={()=>{if(!correctionDecisionSubmitting)setCorrectionDecision(null);}} size="md" layer="top"
      footer={<><SecondaryButton size="sm" disabled={correctionDecisionSubmitting} onClick={()=>setCorrectionDecision(null)}>{t('cancel')}</SecondaryButton>
        <PrimaryButton size="sm" disabled={correctionDecisionSubmitting} onClick={()=>void submitCorrectionDecision()}>
          {correctionDecisionSubmitting?t('officeCorrectionSubmitting'):t('officeCorrectionSubmitDecision')}
        </PrimaryButton></>}>
      <div className="space-y-3">
        <p className="table-page__desc">{t('officeCorrectionDecisionHelp')}</p>
        <AppTextArea id="office-correction-decision-reason" label={t('officeCorrectionDecisionReason')}
          value={correctionDecisionReason} onChange={value=>{setCorrectionDecisionReason(value);setCorrectionDecisionError('');}}
          required rows={4}/>
        {correctionDecisionError&&<p className="payment-module__error" role="alert">{correctionDecisionError}</p>}
      </div>
    </AppModal>
    <AppModal open={draftKind!==null} title={draftKind?t(`new_${draftKind}`):t('newRequest')} onClose={()=>setDraftKind(null)} size="lg" icon={<FilePlus2 size={16}/>} 
      footer={<><SecondaryButton size="sm" disabled={initiationSubmitting} onClick={()=>draftPreview?setDraftPreview(false):setDraftKind(null)}>{draftPreview?t('edit'):t('cancel')}</SecondaryButton><PrimaryButton size="sm" disabled={initiationSubmitting} onClick={draftPreview?saveDraft:previewDraft}>{draftPreview?t('addToList'):t('reviewDraft')}</PrimaryButton>
       {draftKind==='corrections'&&draftPreview&&officeCorrectionQueue.enabled&&
        (officeCorrectionQueue.role==='SUPER_ADMIN'||officeCorrectionQueue.role==='MAKER'||officeCorrectionQueue.role==='APPROVER')&&
        <PrimaryButton size="sm" disabled={initiationSubmitting} onClick={()=>void submitInitiatedCorrection()}>
         {i18n.resolvedLanguage?.startsWith('bn')?'SQL-এ সংশোধনের আবেদন পাঠান':'Submit correction to Taxpayer SQL'}
        </PrimaryButton>}</>}>
      <form id="payment-draft-form" onSubmit={e=>{e.preventDefault();draftPreview?saveDraft():previewDraft();}}>
      <div className="payment-module__form" aria-label={t('newRequest')}>
        <AppSelectField id="payment-draft-tin" searchableAfter={4} label={draftKind==='incidents'?t('claimedTinOptional'):t('tin')} value={draft.tin} onChange={v=>change('tin',v)} required={draftKind!=='incidents'} error={errors.tin} options={[{value:'',label:t('selectTaxpayer')},
          ...[...new Set(storyPayments.flatMap(p=>[p.details?.taxpayerTin,p.details?.payerTin,
           ...(p.details?.allocations??[]).map(a=>a.taxpayerTin)]).filter((v):v is string=>typeof v==='string'&&/^\d{12,13}$/.test(v)))].map(tin=>({value:tin,label:tin})),
          ...referenceTaxpayers.filter(p=>/^\d{12}$/.test(p.tin)).map(p=>({value:p.tin,label:`${p.name} · ${p.tin}`}))]}/>
        {draftKind==='incidents'&&<>
          <AppSelectField id="payment-incident-type" searchableAfter={4} label={t('incidentType')} value={draft.type} onChange={v=>change('type',v)} required error={errors.type} options={[{value:'',label:t('select')},...['ONBOARDING','IDENTITY_MISUSE','UNKNOWN_REP','UNAUTHORIZED_PAYMENT','UNAUTHORIZED_ATTRIBUTION'].map(v=>({value:v,label:t(`incident_${v}`)}))]}/>
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
        {isDirectCorrection&&<>
          <AppSelectField id="payment-correction-allocation" label={t('typedCorrectionTarget')} value={typedTargetKey} onChange={chooseTypedTarget} required disabled={draftPreview||initiationSubmitting} options={[{value:'',label:t('select')},...typedTargets.map(target=>({value:target.key,label:[target.allocationId??target.reference,target.currentAY,target.currentHeadCode].filter(Boolean).join(' · ')}))]}/>
          {typedTarget&&([
            ['currentAY','proposedAY','typedCurrentAY','typedProposedAY'],
            ['currentCircle','proposedCircle','typedCurrentCircle','typedProposedCircle'],
            ['currentHeadCode','proposedHeadCode','typedCurrentHead','typedProposedHead'],
          ] as const).map(([currentKey,proposedKey,currentLabel,proposedLabel])=><div key={proposedKey} className="payment-module__full">
            <AppTextField id={'payment-correction-'+currentKey} label={t(currentLabel)} value={typedTarget[currentKey]} onChange={()=>{}} readOnly/>
            <AppTextField id={'payment-correction-'+proposedKey} label={t(proposedLabel)} value={typedProposal[proposedKey]} onChange={value=>{setTypedProposal(old=>({...old,[proposedKey]:value}));setDraftPreview(false);setFormError('');}} readOnly={draftPreview||initiationSubmitting} maxLength={120}/>
          </div>)}
          <p className="payment-module__note payment-module__full">{t('typedCorrectionHelp')}</p>
        </>}
        {draftKind==='corrections'&&<AppTextArea id="payment-draft-outcome"
          label={i18n.resolvedLanguage?.startsWith('bn')?'প্রত্যাশিত ফলাফল':'Requested outcome'}
          value={draft.outcome} onChange={v=>change('outcome',v)} error={errors.outcome} required/>}
        {draftKind==='corrections'&&!isDirectCorrection&&<p className="payment-module__note payment-module__full">
          {i18n.resolvedLanguage?.startsWith('bn')
            ?'SQL-এ পাঠাতে মূল পেমেন্টে থাকা রেফারেন্স ও করদাতার TIN ব্যবহার করুন। অনুমোদন নয়, শুধুই পর্যালোচনার আবেদন।'
            :'SQL submission requires a connected original payment, its reference and taxpayer TIN. It requests review only, not a financial change.'}
        </p>}
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
