import { useCallback, useEffect, useState } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SecondaryButton } from '../../components/buttons/SecondaryButton';
import { AppTextField } from '../../components/forms/AppTextField';
import { AppTextArea } from '../../components/forms/AppTextArea';
import { SimulatedOfficerReview } from './SimulatedOfficerReview';
import { SimulatedProfileAssignment } from './SimulatedProfileAssignment';

const url = String(import.meta.env.VITE_TAXPAY_REVIEW_URL || '');
const key = String(import.meta.env.VITE_TAXPAY_REVIEW_PUBLIC_KEY || '');
const client = url.startsWith('https://') && key && import.meta.env.VITE_TAXPAY_REVIEW_DISABLED !== 'true'
  ? createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
/** Reuse the authenticated officer session for protected simulation reads. */
export const getOfficeReviewClient = () => client;

type ReviewRequest = { id:string; owner_uid:string; purpose:string; category:string; assessment_year:string; amount_minor:number; request_status:string; financial_receipt_status:string; tax_credit_status:string; submitted_at:string };
type InboxNotice = { id:string; request_id:string; message_code:string; is_read:boolean; created_at:string };
type OfficerRole = 'MAKER' | 'REVIEWER' | 'APPROVER';
const descriptions:Record<string,[string,string]> = {
  SUBMITTED_FOR_REVIEW:['Submitted for review','পর্যালোচনার জন্য জমা'],
  ACKNOWLEDGED:['Acknowledged','গৃহীত'], INFO_REQUESTED:['Information requested','অতিরিক্ত তথ্য চাওয়া হয়েছে'],
  REVIEW_CLOSED:['Review closed','পর্যালোচনা সমাপ্ত'],OFFICER_NEW_REQUEST:['New request for officer review','কর্মকর্তার নতুন রিভিউ অনুরোধ']
};

/** Segregated non-financial SQL inbox. No officer may post or approve tax receipt/credit here. */
export function OfficeReviewQueue() {
  const {i18n}=useTranslation();
  const bn=i18n.language.toLowerCase().startsWith('bn');
  const t=(en:string,local:string)=>bn?local:en;
  const [user,setUser]=useState<User|null>(null);
  const [role,setRole]=useState<OfficerRole|null>(null);
  const [email,setEmail]=useState('');
  const [rows,setRows]=useState<ReviewRequest[]>([]);
  const [notices,setNotices]=useState<InboxNotice[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [reason,setReason]=useState('');
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  const label=(s:string)=>descriptions[s]?.[bn?1:0]||s;
  const ids=rows.map(r=>r.id);
  const selectedRequest=rows.find(r=>r.id===selected);

  useEffect(()=>{
    if(!client)return;
    let active=true;
    const {data:sub}=client.auth.onAuthStateChange((_event,session)=>{
      if(!active)return;
      setUser(session?.user??null);setRole(null);setRows([]);setNotices([]);setSelected(null);
    });
    void client.auth.getUser().then(({data})=>{if(active)setUser(data.user);});
    return()=>{active=false;sub.subscription.unsubscribe();};
  },[]);

  const refresh=useCallback(async()=>{
    if(!client||!user)return;
    const {data:identity,error:authError}=await client.auth.getUser();
    if(authError||identity.user?.id!==user.id)throw Error('Officer session changed');
    const access=await client.from('taxpay_officer_roles').select('role,active').eq('user_uid',user.id).maybeSingle();
    if(access.error)throw access.error;
    if(!access.data?.active){setRole(null);setRows([]);setNotices([]);return;}
    setRole(access.data.role as OfficerRole);
    const [r,n]=await Promise.all([
      client.from('taxpay_payment_requests').select('id,owner_uid,purpose,category,assessment_year,amount_minor,request_status,financial_receipt_status,tax_credit_status,submitted_at').order('submitted_at',{ascending:false}).limit(100),
      client.from('taxpay_in_app_notifications').select('id,request_id,message_code,is_read,created_at').order('created_at',{ascending:false}).limit(50)
    ]);
    if(r.error||n.error)throw Error(r.error?.message||n.error?.message||'Read back failed');
    const {data:current}=await client.auth.getUser();
    if(current.user?.id!==user.id)throw Error('Officer session changed');
    setRows((r.data||[]) as ReviewRequest[]);setNotices((n.data||[]) as InboxNotice[]);setStatus('');
  },[user]);

  useEffect(()=>{
    if(!client||!user)return;
    let live=true;
    const reload=()=>void refresh().catch(e=>{if(live)setStatus(e instanceof Error?e.message:'Load failed');});
    reload();const timer=window.setInterval(reload,20000);
    return()=>{live=false;window.clearInterval(timer);};
  },[user,refresh,revision]);

  const login=async(event:React.FormEvent)=>{
    event.preventDefault();if(!client||busy)return;
    setBusy(true);setStatus('');
    try{const {error}=await client.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:window.location.origin+window.location.pathname,shouldCreateUser:false}});if(error)throw error;
      setStatus(t('Sign-in link sent. Access requires an assigned officer role.','সাইন-ইন লিংক পাঠানো হয়েছে। নির্ধারিত কর্মকর্তা ভূমিকা প্রয়োজন।'));
    }catch(e){setStatus(e instanceof Error?e.message:'Could not sign in');}finally{setBusy(false);}
  };
  const act=async(action:'ACKNOWLEDGE'|'REQUEST_INFORMATION'|'CLOSE_REVIEW')=>{
    if(!client||!user||!selectedRequest||busy||reason.trim().length<10)return;
    setBusy(true);setStatus('');
    const nonce=crypto.randomUUID();
    try{
      const {data:identity}=await client.auth.getUser();if(identity.user?.id!==user.id)throw Error('Officer session changed');
      const {error}=await client.rpc('taxpay_record_officer_review',{p_request_id:selectedRequest.id,p_action:action,p_reason:reason.trim(),p_idempotency_key:nonce});
      if(error)throw error;
      await refresh();setReason('');setStatus(t('Action recorded in SQL.','কার্যক্রম SQL-এ সংরক্ষিত হয়েছে।'));
    }catch(e){setStatus(e instanceof Error?e.message:'Action failed');}finally{setBusy(false);}
  };
  const markRead=async(n:InboxNotice)=>{
    if(!client||!user||busy)return;setBusy(true);
    try{const {data:identity}=await client.auth.getUser();if(identity.user?.id!==user.id)throw Error('Session changed');
      const {error}=await client.from('taxpay_in_app_notifications').update({is_read:true}).eq('id',n.id);
      if(error)throw error;await refresh();
    }catch(e){setStatus(e instanceof Error?e.message:'Notification update failed');}finally{setBusy(false);}
  };

  const signOut=async()=>{
    if(!client||busy)return;
    setBusy(true);setStatus('');
    try {const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;
      setUser(null);setRole(null);setRows([]);setNotices([]);setSelected(null);setReason('');
    }catch(e){setStatus(e instanceof Error?e.message:'Sign-out failed');}finally{setBusy(false);}
  };

  // Preserve the accepted Office Payments UI when no verified backend is configured.
  if(!client) return null;
  return <section className="card payment-module__card" aria-label={t('Connected officer review','সংযুক্ত কর্মকর্তা পর্যালোচনা')}>
    <h2>{t('Officer review inbox','কর্মকর্তার পর্যালোচনা ইনবক্স')}</h2>
    <p>{t('Non-financial requests only. Financial receipts and tax credits cannot be changed here.','শুধু অ-আর্থিক অনুরোধ। এখানে আর্থিক রসিদ বা কর ক্রেডিট পরিবর্তন করা যায় না।')}</p>
    {!client?<p role="status">{t('Secure review connection not configured. Existing payment screens remain unchanged.','নিরাপদ রিভিউ সংযোগ কনফিগার করা নেই। বিদ্যমান পেমেন্ট স্ক্রিন অপরিবর্তিত।')}</p>:
    !user?<form onSubmit={e=>void login(e)}><AppTextField id="office-review-email" label={t('Officer email','কর্মকর্তার ইমেইল')} value={email} onChange={setEmail} required/><PrimaryButton type="submit" size="sm" disabled={busy}>{t('Send sign-in link','সাইন-ইন লিংক পাঠান')}</PrimaryButton></form>:
    !role?<p role="status">{t('No active officer role assigned to this account.','এই অ্যাকাউন্টে সক্রিয় কর্মকর্তা ভূমিকা নির্ধারিত নেই।')}</p>:
    <>
      <p>{t('Authorized role','অনুমোদিত ভূমিকা')}: {role}</p>
      <SimulatedOfficerReview client={client} userId={user.id} role={role}/>
      {role==='APPROVER'&&<SimulatedProfileAssignment client={client} officerId={user.id}/>}
      <SecondaryButton size="sm" disabled={busy} onClick={()=>void signOut()}>{t('Sign out','সাইন আউট')}</SecondaryButton>
      <SecondaryButton size="sm" onClick={()=>setRevision(v=>v+1)}>{t('Refresh inbox','ইনবক্স হালনাগাদ')}</SecondaryButton>
      {notices.some(n=>!n.is_read)&&<section><h3>{t('New notices','নতুন বিজ্ঞপ্তি')}</h3><ul>{notices.filter(n=>!n.is_read).map(n=><li key={n.id}><p>{label(n.message_code)} · {n.request_id}</p><SecondaryButton size="sm" onClick={()=>void markRead(n)}>{t('Mark read','পড়া হয়েছে')}</SecondaryButton></li>)}</ul></section>}
      <div><h3>{t('Review requests','পর্যালোচনার অনুরোধ')}</h3>{rows.length===0?<p>{t('No requests assigned to this review inbox.','এই ইনবক্সে কোনো অনুরোধ নেই।')}</p>:<ul>{rows.map(r=><li key={r.id}><button type="button" className="table-card__toolbar-btn" onClick={()=>{setSelected(r.id);setReason('');}} aria-pressed={selected===r.id}>{r.id} · {r.category} · {r.assessment_year} · {label(r.request_status)}</button></li>)}</ul>}</div>
      {selectedRequest&&<div><h3>{t('Selected request','নির্বাচিত অনুরোধ')}</h3><p>{selectedRequest.id}</p><p>{t('Financial receipt','আর্থিক রসিদ')}: {selectedRequest.financial_receipt_status} · {t('Tax credit','কর ক্রেডিট')}: {selectedRequest.tax_credit_status}</p>
        <AppTextArea id="office-review-reason" label={t('Reason (minimum 10 characters)','কারণ (কমপক্ষে ১০ অক্ষর)')} value={reason} onChange={setReason}/>
        <div className="table-page__actions">
          {selectedRequest.request_status==='SUBMITTED_FOR_REVIEW'&&<PrimaryButton size="sm" disabled={busy||reason.trim().length<10} onClick={()=>void act('ACKNOWLEDGE')}>{t('Acknowledge','গ্রহণ করুন')}</PrimaryButton>}
          {selectedRequest.request_status!=='REVIEW_CLOSED'&&<SecondaryButton size="sm" disabled={busy||reason.trim().length<10} onClick={()=>void act('REQUEST_INFORMATION')}>{t('Request information','তথ্য চান')}</SecondaryButton>}
          {['ACKNOWLEDGED','INFO_REQUESTED'].includes(selectedRequest.request_status)&&role!=='MAKER'&&<PrimaryButton size="sm" disabled={busy||reason.trim().length<10} onClick={()=>void act('CLOSE_REVIEW')}>{t('Close review','পর্যালোচনা শেষ')}</PrimaryButton>}
        </div>
      </div>}
      <p>{t('Visible request IDs','দৃশ্যমান অনুরোধ আইডি')}: {ids.length}</p>
    </>}
    {status&&<p role="status" aria-live="polite">{status}</p>}
  </section>;
}