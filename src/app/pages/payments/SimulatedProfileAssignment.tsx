import {useCallback,useEffect,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {useTranslation} from 'react-i18next';
import {AppTextField} from '../../components/forms/AppTextField';
import {AppSelectField} from '../../components/forms/AppSelectField';
import {PrimaryButton} from '../../components/buttons/PrimaryButton';
import {SecondaryButton} from '../../components/buttons/SecondaryButton';

type Assignment={profile:string;assignedAt:string};
const profiles=Array.from({length:10},(_,i)=>'user'+(i+1));
/** Officer-controlled, verified-email synthetic account assignment only.
 * Never publish an arbitrary taxpayer/auth.users enumeration or credential.
 */
export function SimulatedProfileAssignment({client,officerId}:{client:SupabaseClient;officerId:string}){
 const {i18n}=useTranslation(),bn=i18n.language.toLowerCase().startsWith('bn');
 const tr=(en:string,local:string)=>bn?local:en;
 const [profile,setProfile]=useState('user1');
 const [email,setEmail]=useState('');
 const [assigned,setAssigned]=useState<Assignment[]>([]);
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false);
 const [revision,setRevision]=useState(0);
 const refresh=useCallback(async()=>{
  const {data:auth,error:authError}=await client.auth.getUser();
  if(authError||auth.user?.id!==officerId)throw Error('Officer session changed');
  const {data,error}=await client.rpc('sim_officer_profile_bindings');
  if(error||!Array.isArray(data))throw Error(error?.message||'Binding read-back unavailable');
  const {data:rechecked}=await client.auth.getUser();
  if(rechecked.user?.id!==officerId)throw Error('Officer session changed during refresh');
  setAssigned(data as Assignment[]);
  return data as Assignment[];
 },[client,officerId]);
 useEffect(()=>{
  let active=true;
  const run=()=>void refresh().catch(e=>{if(active)setMessage(e instanceof Error?e.message:'Profile status unavailable');});
  run();const interval=window.setInterval(run,15000);
  return()=>{active=false;window.clearInterval(interval);};
 },[refresh,revision]);
 const link=async(e:React.FormEvent)=>{
  e.preventDefault();if(busy)return;
  const safe=email.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safe)||safe.length>254){setMessage(tr('Enter a valid confirmed account email','যাচাইকৃত অ্যাকাউন্টের ইমেইল দিন'));return;}
  setBusy(true);setMessage('');
  try{
   const {data:auth,error:authError}=await client.auth.getUser();
   if(authError||auth.user?.id!==officerId)throw Error('Officer session changed');
   const {data,error}=await client.rpc('sim_bind_taxpayer_email',{p_user_id:profile,p_email:safe});
   if(error||data!==profile)throw Error(error?.message||'Assignment not confirmed');
   const read=await refresh();
   if(!read.some(x=>x.profile===profile))throw Error('Assignment saved but independent SQL read-back did not confirm it');
   setEmail('');setMessage(tr('Account assignment verified in SQL','SQL-এ অ্যাকাউন্ট সংযোগ যাচাইকৃত'));
  }catch(err){setMessage(err instanceof Error?err.message:'Assignment failed');}
  finally{setBusy(false);}
 };
 return <section className="card payment-module__card" aria-label={tr('Verified simulation profile access','যাচাইকৃত সিমুলেশন প্রোফাইল')}>
  <h3>{tr('Protected simulated taxpayer accounts','সুরক্ষিত সিমুলেটেড করদাতা অ্যাকাউন্ট')}</h3>
  <p>{tr('Assign each fictional user1–user10 profile to one confirmed Supabase account. Assignment is permanent until a separate reviewed recovery; no NBR identity or tax credit is created.','প্রতিটি কাল্পনিক user1–user10 প্রোফাইলকে একটি নিশ্চিত অ্যাকাউন্টে সংযুক্ত করুন। কোনো সরকারি কর পরিচয় বা ক্রেডিট তৈরি হয় না।')}</p>
  <form onSubmit={e=>void link(e)}>
   <AppSelectField id="sim-secure-profile" label={tr('Fictional profile','কাল্পনিক প্রোফাইল')} value={profile} onChange={setProfile}
    options={profiles.map(x=>({value:x,label:x}))} compact/>
   <AppTextField id="sim-secure-email" label={tr('Confirmed account email','নিশ্চিত অ্যাকাউন্ট ইমেইল')} value={email} onChange={setEmail} required/>
   <PrimaryButton type="submit" size="sm" disabled={busy||assigned.some(x=>x.profile===profile)}>
    {busy?tr('Saving…','সংরক্ষণ হচ্ছে…'):tr('Assign verified profile','যাচাইকৃত প্রোফাইল সংযুক্ত করুন')}
   </PrimaryButton>
  </form>
  <SecondaryButton size="sm" disabled={busy} onClick={()=>setRevision(v=>v+1)}>{tr('Refresh assignments','সংযোগ হালনাগাদ')}</SecondaryButton>
  {assigned.length>0&&<ul>{assigned.map(a=><li key={a.profile}><p>{a.profile} · {new Date(a.assignedAt).toLocaleDateString(bn?'bn-BD':'en-GB')}</p></li>)}</ul>}
  {message&&<p role="status" aria-live="polite">{message}</p>}
 </section>;
}