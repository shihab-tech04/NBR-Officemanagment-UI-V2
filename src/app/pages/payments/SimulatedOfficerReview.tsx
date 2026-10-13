import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import { PrimaryButton } from '../../components/buttons/PrimaryButton';
import { SecondaryButton } from '../../components/buttons/SecondaryButton';
import { AppTextArea } from '../../components/forms/AppTextArea';

type Role = 'MAKER' | 'REVIEWER' | 'APPROVER';
type Action = 'MAKER_ACKNOWLEDGE' | 'REVIEWER_VERIFY' | 'APPROVER_CLOSE';
type LifecycleAction='COMPLETE_SIMULATION'|'FAIL_SIMULATION'|'REVERSE_SIMULATION';
const permittedLifecycle=(role:Role,reviewStatus:string,state:string):LifecycleAction[]=>{
 if(role!=='APPROVER'||reviewStatus!=='APPROVER_CLOSED')return [];
 if(state==='PENDING')return ['COMPLETE_SIMULATION','FAIL_SIMULATION'];
 if(state==='SIMULATED')return ['REVERSE_SIMULATION'];
 return [];
};
type Allocation = { beneficiary:string; category:string; assessmentYear:string; amountMinor:number };
type Event = { id:number;action:string;note:string;occurredAt:string };
type DemoTransaction = {
  transactionId:string;id:string;payer:string;state:string;reviewStatus:string;
  totalMinor:number;simulationOnly:true;allocations:Allocation[];events:Event[];
};
const nextAction = (role:Role,status:string):Action|null =>
  role==='MAKER' && status==='PENDING_OFFICER' ? 'MAKER_ACKNOWLEDGE' :
  role==='REVIEWER' && status==='MAKER_ACKNOWLEDGED' ? 'REVIEWER_VERIFY' :
  role==='APPROVER' && status==='REVIEWER_VERIFIED' ? 'APPROVER_CLOSE' : null;
const nextStatus:Record<Action,string> = {
  MAKER_ACKNOWLEDGE:'MAKER_ACKNOWLEDGED',
  REVIEWER_VERIFY:'REVIEWER_VERIFIED',
  APPROVER_CLOSE:'APPROVER_CLOSED'
};

/** Real SQL events on fictional transactions only; independent from Treasury or tax-credit status. */
export function SimulatedOfficerReview({client,userId,role}:{
  client:SupabaseClient;userId:string;role:Role
}) {
  const {i18n}=useTranslation();
  const bn=i18n.language.startsWith('bn');
  const tx=(en:string,bengali:string)=>bn?bengali:en;
  const [rows,setRows]=useState<DemoTransaction[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [reason,setReason]=useState('');
  const [lifecycleReason,setLifecycleReason]=useState('');
  const lifecycleNonce=useRef<{id:string;action:LifecycleAction;key:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [loaded,setLoaded]=useState(false);
  const nonce=useRef<{id:string;action:Action;key:string}|null>(null);
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(async()=>{
    const {data:identity,error:identityError}=await client.auth.getUser();
    if(identityError || identity.user?.id!==userId) throw Error('Officer session changed');
    const {data,error:readError}=await client.rpc('sim_payment_history',{p_user_id:null,p_view:'all'});
    if(readError || !Array.isArray(data)) throw Error(readError?.message||'Simulation history unavailable');
    const {data:current}=await client.auth.getUser();
    if(current.user?.id!==userId) throw Error('Officer session changed');
    setRows(data as DemoTransaction[]);
    setLoaded(true);setError('');
    return data as DemoTransaction[];
  },[client,userId]);

  useEffect(()=>{
    let live=true;
    setRows([]);setLoaded(false);setSelected(null);setReason('');setLifecycleReason('');nonce.current=null;lifecycleNonce.current=null;
    const run=()=>void refresh().catch(e=>{if(live)setError(e instanceof Error?e.message:'Could not refresh');});
    run();const timer=window.setInterval(run,10000);
    return()=>{live=false;window.clearInterval(timer);};
  },[refresh,revision]);

  const current=rows.find(r=>r.transactionId===selected);
  const action=current?nextAction(role,current.reviewStatus):null;
  const lifecycleActions=current?permittedLifecycle(role,current.reviewStatus,current.state):[];
  const act=async()=>{
    if(!current||!action||busy||reason.trim().length<10)return;
    setBusy(true);setError('');
    const state=nonce.current;
    const key=state?.id===current.transactionId && state?.action===action?state.key:crypto.randomUUID();
    nonce.current={id:current.transactionId,action,key};
    try {
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError||identity.user?.id!==userId)throw Error('Officer session changed');
      const {data,error:writeError}=await client.rpc('sim_payment_officer_action',{
        p_transaction_id:current.transactionId,p_action:action,p_reason:reason.trim(),p_idempotency_key:key
      });
      if(writeError||data!==nextStatus[action])throw Error(writeError?.message||'Review action not confirmed');
      const confirmed=(await refresh()).find(r=>r.transactionId===current.transactionId);
      if(confirmed?.reviewStatus!==nextStatus[action])throw Error('Independent SQL status read-back did not match');
      nonce.current=null;setReason('');
    } catch(e){setError(e instanceof Error?e.message:'Review action failed');}
    finally{setBusy(false);}
  };

  const actLifecycle=async(requested:LifecycleAction)=>{
    if(!current||busy||!lifecycleActions.includes(requested)||
       lifecycleReason.trim().length<10||lifecycleReason.trim().length>1000)return;
    setBusy(true);setError('');
    const previous=lifecycleNonce.current;
    const key=previous?.id===current.transactionId&&previous.action===requested?previous.key:crypto.randomUUID();
    lifecycleNonce.current={id:current.transactionId,action:requested,key};
    const expected=requested==='COMPLETE_SIMULATION'?'SIMULATED':requested==='FAIL_SIMULATION'?'FAILED':'REVERSED';
    try {
      const {data:identity,error:authError}=await client.auth.getUser();
      if(authError||identity.user?.id!==userId)throw Error('Officer session changed');
      const {data,error:sqlError}=await client.rpc('sim_payment_status_action',{
        p_transaction_id:current.transactionId,p_action:requested,
        p_reason:lifecycleReason.trim(),p_idempotency_key:key
      });
      if(sqlError||!data||data.state!==expected)throw Error(sqlError?.message||'Simulation state change not confirmed by SQL');
      const persisted=(await refresh()).find(r=>r.transactionId===current.transactionId);
      if(persisted?.state!==expected)throw Error('Read-back state does not match the authorized simulation transition');
      const newest=persisted.events.at(-1)?.action;
      const expectedEvent=requested==='COMPLETE_SIMULATION'?'SIMULATION_RECORDED':requested==='FAIL_SIMULATION'?'FAILED':'REVERSED';
      if(newest!==expectedEvent)throw Error('SQL event timeline did not record the expected transition');
      lifecycleNonce.current=null;setLifecycleReason('');
    } catch(e){setError(e instanceof Error?e.message:'Simulation state change failed');}
    finally{setBusy(false);}
  };

  return <section className="card payment-module__card" aria-label={tx('Simulation review actions','সিমুলেটেড পর্যালোচনা')}>
    <h3>{tx('Shared SQL — simulated transaction decisions','যৌথ SQL — সিমুলেটেড লেনদেনের সিদ্ধান্ত')}</h3>
    <p>{tx('Only fictional transactions. Different Maker, Reviewer and Approver accounts are required; no Government receipt, funds movement or tax credit can result.',
      'শুধু কাল্পনিক লেনদেন। পৃথক মেকার, রিভিউয়ার ও অনুমোদনকারী অ্যাকাউন্ট প্রয়োজন; সরকারি রসিদ, অর্থ স্থানান্তর বা কর ক্রেডিট তৈরি হয় না।')}</p>
    <SecondaryButton size="sm" disabled={busy} onClick={()=>setRevision(v=>v+1)}>{tx('Refresh simulated cases','নমুনা কেস হালনাগাদ')}</SecondaryButton>
    {error&&<p role="alert">{error}</p>}
    {!loaded?<p role="status">{tx('Loading connected simulation records…','সংযুক্ত নমুনা লেনদেন লোড হচ্ছে…')}</p>:
      rows.length===0?<p>{tx('No synthetic transactions','কোনো নমুনা লেনদেন নেই')}</p>:
      <ul>{rows.slice(0,100).map(r=><li key={r.transactionId}>
        <button type="button" className="table-card__toolbar-btn" aria-pressed={r.transactionId===selected}
          onClick={()=>{setSelected(r.transactionId);setReason('');setLifecycleReason('');nonce.current=null;lifecycleNonce.current=null;}}>
          {r.id} · {r.payer} · {r.reviewStatus} · {new Intl.NumberFormat('en-BD').format(r.totalMinor/100)} BDT
        </button>
      </li>)}</ul>}
    {current&&<div>
      <h4>{tx('Selected synthetic transaction','নির্বাচিত নমুনা লেনদেন')}</h4>
      <p>{current.id} · {tx('Status','অবস্থা')}: {current.reviewStatus}</p>
      <p>{tx('Allocation count','বরাদ্দের সংখ্যা')}: {current.allocations.length}; {tx('Amount','পরিমাণ')}: {new Intl.NumberFormat('en-BD').format(current.totalMinor/100)} BDT</p>
      <p>{tx('Payment simulation state','পেমেন্ট সিমুলেশন অবস্থা')}: {current.state} · {tx('Tax credit','কর ক্রেডিট')}: NOT VERIFIED</p>
      <details><summary>{tx('SQL event timeline','SQL ইভেন্ট সময়রেখা')}</summary>
        <ol>{current.events.map(e=><li key={e.id}><p>{e.action} · {e.occurredAt}</p><p>{e.note}</p></li>)}</ol>
      </details>
      {lifecycleActions.length>0&&<div className="payment-module__review-lifecycle">
        <h4>{tx('Controlled simulated lifecycle','নিয়ন্ত্রিত সিমুলেশন অবস্থা')}</h4>
        <p>{tx('Only an authorized Approver may change the simulated outcome after independent three-officer review. No money or official credit moves.',
          'শুধুমাত্র অনুমোদিত কর্মকর্তা পৃথক তিন-ধাপ পর্যালোচনার পরে সিমুলেশনের অবস্থা পরিবর্তন করতে পারবেন। কোনো অর্থ বা সরকারি ক্রেডিট স্থানান্তর হয় না।')}</p>
        <AppTextArea id="sim-lifecycle-reason"
          label={tx('Reason for simulation status change, 10–1000 characters','সিমুলেশন অবস্থার পরিবর্তনের কারণ, ১০–১০০০ অক্ষর')}
          value={lifecycleReason} onChange={value=>{setLifecycleReason(value);lifecycleNonce.current=null;}} required/>
        <div className="table-page__actions">
          {lifecycleActions.map(requested=><PrimaryButton key={requested} size="sm"
            disabled={busy||lifecycleReason.trim().length<10||lifecycleReason.trim().length>1000}
            onClick={()=>void actLifecycle(requested)}>
            {busy?tx('Recording…','সংরক্ষণ হচ্ছে…'):
             requested==='COMPLETE_SIMULATION'?tx('Mark simulation completed','সিমুলেশন সম্পন্ন করুন'):
             requested==='FAIL_SIMULATION'?tx('Mark simulation failed','সিমুলেশন ব্যর্থ করুন'):
             tx('Reverse simulated payment','সিমুলেটেড পেমেন্ট প্রত্যাহার করুন')}
          </PrimaryButton>)}
        </div>
      </div>}
      {action?<div>
        <AppTextArea id="sim-review-reason" label={tx('Reason, 10–1000 characters','কারণ, ১০–১০০০ অক্ষর')}
          value={reason} onChange={value=>{setReason(value);nonce.current=null;}} required/>
        <PrimaryButton size="sm" disabled={busy||reason.trim().length<10||reason.trim().length>1000} onClick={()=>void act()}>
          {busy?tx('Recording…','সংরক্ষণ হচ্ছে…'):
           action==='MAKER_ACKNOWLEDGE'?tx('Maker: acknowledge','মেকার: গ্রহণ'):
           action==='REVIEWER_VERIFY'?tx('Reviewer: verify','রিভিউয়ার: যাচাই'):
           tx('Approver: close review','অনুমোদনকারী: পর্যালোচনা শেষ')}
        </PrimaryButton>
      </div>:<p>{tx('No action is allowed for your role at this stage.','এই ধাপে আপনার ভূমিকার কোনো কার্যক্রম অনুমোদিত নয়।')}</p>}
    </div>}
  </section>;
}
