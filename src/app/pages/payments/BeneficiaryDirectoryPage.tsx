import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {createClient} from '@supabase/supabase-js';
import {useTranslation} from 'react-i18next';

// The Office presentation login never grants access to a taxpayer address book.
// A verified Korbritto portal administrator is checked by Auth AND SQL RLS.
const URL='https://eyqhoavnitkrajvyqvxn.supabase.co';
const PUBLISHABLE_KEY='sb_publishable_ZRyWCWCOWBmsg7b9qTseUg_CFlhl3Id';
// Separate Office-origin session: a TaxPay-site login does not carry cookies or
// local storage to Office Management's distinct domain.
const db=createClient(URL,PUBLISHABLE_KEY,{auth:{
  persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,
  storageKey:'office-taxpay-admin-session-v1',flowType:'pkce'
}});
interface SavedList {id:string;owner_uid:string;name:string;created_at:string}
interface SavedPerson {id:string;owner_uid:string;list_id:string;tin:string;display_name:string;created_at:string}
interface Snapshot {lists:SavedList[];people:SavedPerson[]}

/** Read every page, not just the PostgREST project max-rows page. */
export async function collectOfficeBeneficiaryPages<T>(fetchPage:(from:number,to:number)=>Promise<T[]>,size=500):Promise<T[]> {
  if(!Number.isSafeInteger(size)||size<1||size>1000)throw new Error('Invalid page size');
  const rows:T[]=[];
  for(let from=0;;from+=size){
    const page=await fetchPage(from,from+size-1);
    if(!Array.isArray(page))throw new Error('Invalid SQL response');
    rows.push(...page);
    if(page.length<size)return rows;
  }
}
async function readSnapshot():Promise<Snapshot>{
  const {data:{user},error:userError}=await db.auth.getUser();
  if(userError||!user)throw new Error('Sign in to Korbritto with a verified administrator account.');
  const {data:admin,error:adminError}=await db.from('taxpay_portal_admins')
    .select('user_uid').eq('user_uid',user.id).eq('active',true).maybeSingle();
  if(adminError||!admin)throw new Error('This account cannot view beneficiary records.');
  const [lists,people]=await Promise.all([
    collectOfficeBeneficiaryPages<SavedList>(async(from,to)=>{
      const {data,error}=await db.from('taxpay_beneficiary_lists')
        .select('id,owner_uid,name,created_at').order('owner_uid').order('name').order('id').range(from,to);
      if(error)throw error;
      return (data??[]) as SavedList[];
    }),
    collectOfficeBeneficiaryPages<SavedPerson>(async(from,to)=>{
      const {data,error}=await db.from('taxpay_beneficiaries')
        .select('id,owner_uid,list_id,tin,display_name,created_at')
        .order('owner_uid').order('created_at').order('id').range(from,to);
      if(error)throw error;
      return (data??[]) as SavedPerson[];
    }),
  ]);
  const index=new Map(lists.map(list=>[list.id,list.owner_uid]));
  if(people.some(person=>index.get(person.list_id)!==person.owner_uid))
    throw new Error('Beneficiary SQL readback is inconsistent. Refresh before reviewing.');
  return {lists,people};
}
export function BeneficiaryDirectoryPage(){
  const {i18n}=useTranslation();
  const bn=i18n.resolvedLanguage?.startsWith('bn')??false;
  const tr=(en:string,bnText:string)=>bn?bnText:en;
  const [snapshot,setSnapshot]=useState<Snapshot>({lists:[],people:[]});
  const [accountId,setAccountId]=useState<string|null>(null);
  const [accountLoading,setAccountLoading]=useState(true);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [signInBusy,setSignInBusy]=useState(false);
  const [authMessage,setAuthMessage]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const sessionRevision=useRef(0);
  const currentUserId=useRef<string|null>(null);
  const clearSnapshot=()=>setSnapshot({lists:[],people:[]});
  useEffect(()=>{
    let active=true;
    const listener=db.auth.onAuthStateChange((_event,session)=>{
      if(!active)return;
      const nextId=session?.user?.id??null;
      if(currentUserId.current!==nextId){
        currentUserId.current=nextId;
        sessionRevision.current++;
        setAccountId(nextId);
        setSnapshot({lists:[],people:[]});
      }
      setAccountLoading(false);
    });
    const revision=sessionRevision.current;
    void db.auth.getUser().then(({data,error})=>{
      if(active&&revision===sessionRevision.current){
        const nextId=error?null:data.user?.id??null;
        currentUserId.current=nextId;
        setAccountId(nextId);
        setAccountLoading(false);
      }
    }).catch(()=>{if(active&&revision===sessionRevision.current)setAccountLoading(false);});
    return()=>{active=false;listener.data.subscription.unsubscribe();};
  },[]);
  const refresh=useCallback(async()=>{
    const revision=sessionRevision.current;
    setLoading(true);setError('');
    try {
      const loaded=await readSnapshot();
      if(revision===sessionRevision.current)setSnapshot(loaded);
    } catch(e){
      if(revision===sessionRevision.current){
        setSnapshot({lists:[],people:[]});
        setError(e instanceof Error?e.message:'Could not load beneficiary records.');
      }
    } finally {if(revision===sessionRevision.current)setLoading(false);}
  },[]);
  useEffect(()=>{
    if(accountLoading||!accountId)return;
    void refresh();
    const focus=()=>{if(document.visibilityState!=='hidden')void refresh();};
    window.addEventListener('focus',focus);
    return()=>window.removeEventListener('focus',focus);
  },[accountId,accountLoading,refresh]);
  const signIn=async(event:FormEvent)=>{
    event.preventDefault();
    if(!email.trim()||!password)return;
    setSignInBusy(true);setAuthMessage('');
    const {error:signInError}=await db.auth.signInWithPassword({email:email.trim(),password});
    setPassword('');
    setSignInBusy(false);
    if(signInError)setAuthMessage(tr('Sign-in failed. Check your email and password.','সাইন ইন ব্যর্থ হয়েছে। ইমেইল ও পাসওয়ার্ড যাচাই করুন।'));
  };
  const sendSignInLink=async()=>{
    if(!email.trim())return;
    setSignInBusy(true);setAuthMessage('');
    // An Office-origin callback, not a TaxPay-origin session, is required.
    // Supabase must allowlist this URL in Auth Redirect URLs.
    const callback=new URL('/NBR-Officemanagment-UI-V2/payments/beneficiaries',window.location.origin).toString();
    const {error:sendError}=await db.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:callback,shouldCreateUser:false}});
    setSignInBusy(false);
    setAuthMessage(sendError
      ? tr('Could not send the sign-in link. Try password sign-in.','সাইন ইন লিংক পাঠানো যায়নি। পাসওয়ার্ড ব্যবহার করুন।')
      : tr('Check your email for the Office sign-in link.','অফিস সাইন ইন লিংকের জন্য ইমেইল দেখুন।'));
  };
  const signOut=async()=>{
    setAuthMessage('');
    const {error:signOutError}=await db.auth.signOut({scope:'local'});
    if(signOutError)setAuthMessage(tr('Sign-out failed. Please try again.','সাইন আউট ব্যর্থ হয়েছে। আবার চেষ্টা করুন।'));
    else {sessionRevision.current++;currentUserId.current=null;setAccountId(null);clearSnapshot();setError('');}
  };
  const names=useMemo(()=>new Map(snapshot.lists.map(list=>[list.id,list.name])),[snapshot.lists]);
  const visible=useMemo(()=>{
    // Every saved list is reviewable in Office, even with zero contacts.
    const members=new Map<string,SavedPerson[]>();
    for(const person of snapshot.people){
      const group=members.get(person.list_id)??[];
      group.push(person);members.set(person.list_id,group);
    }
    return snapshot.lists.flatMap(list=>{
      const stored=members.get(list.id);
      const rows=stored?.length?stored:[{id:'empty-'+list.id,owner_uid:list.owner_uid,list_id:list.id,tin:'',display_name:'',created_at:list.created_at}];
      return rows.filter(person=>
        (person.tin+' '+person.display_name+' '+list.name+' '+person.owner_uid)
          .toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    });
  },[snapshot.lists,snapshot.people,query]);
  return <section className="table-page space-y-4 p-4 sm:p-6" data-testid="office-beneficiary-directory">
    <header className="table-page__header flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="table-page__title">{tr('Beneficiaries','উপকারভোগী')}</h1>
        <p className="table-page__desc">{tr('Saved taxpayer lists · read only','সংরক্ষিত করদাতার তালিকা · শুধু দেখা যাবে')}</p></div>
      {accountId&&<div className="flex flex-wrap items-center gap-2">
        <button type="button" className="table-card__toolbar-btn" disabled={loading} onClick={()=>void refresh()}>{tr('Refresh','রিফ্রেশ')}</button>
        <button type="button" className="table-card__toolbar-btn" onClick={()=>void signOut()}>{tr('Sign out','সাইন আউট')}</button>
      </div>}
    </header>
    {accountLoading&&<p role="status">{tr('Checking administrator session…','অ্যাডমিন সেশন যাচাই করা হচ্ছে…')}</p>}
    {!accountLoading&&!accountId&&<form onSubmit={event=>void signIn(event)} className="max-w-lg space-y-3 rounded-lg border border-slate-200 bg-white p-4 sm:p-5" data-testid="office-beneficiary-admin-login">
      <p className="text-sm text-slate-700">{tr('Sign in here with your verified Korbritto administrator account.','যাচাইকৃত করবৃত্ত অ্যাডমিন অ্যাকাউন্ট দিয়ে এখানে সাইন ইন করুন।')}</p>
      <label className="block space-y-1"><span>{tr('Email address','ইমেইল ঠিকানা')}</span>
        <input className="w-full rounded-md border border-slate-300 p-3" type="email" autoComplete="username" required value={email} onChange={event=>setEmail(event.target.value)}/></label>
      <label className="block space-y-1"><span>{tr('Password','পাসওয়ার্ড')}</span>
        <input className="w-full rounded-md border border-slate-300 p-3" type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)}/></label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="table-card__toolbar-btn" disabled={signInBusy||!email.trim()||!password}>{tr('Sign in','সাইন ইন')}</button>
        <button type="button" className="table-card__toolbar-btn" disabled={signInBusy||!email.trim()} onClick={()=>void sendSignInLink()}>{tr('Email sign-in link','ইমেইলে সাইন ইন লিংক')}</button>
      </div>
    </form>}
    {authMessage&&<p role="status" className="text-sm text-slate-700">{authMessage}</p>}
    {accountId&&error&&<div role="alert" className="rounded-lg border border-amber-300 p-4"><p>{error}</p></div>}
    {accountId&&loading&&<p role="status">{tr('Loading saved lists…','সংরক্ষিত তালিকা লোড হচ্ছে…')}</p>}
    {accountId&&!loading&&!error&&<>
      <p role="status" className="table-page__desc">{snapshot.lists.length} {tr('lists','টি তালিকা')} · {snapshot.people.length} {tr('beneficiaries','জন উপকারভোগী')}</p>
      <label className="block space-y-1"><span>{tr('Search','খুঁজুন')}</span>
        <input className="w-full max-w-lg rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900"
          type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr('Name, TIN or list','নাম, টিআইএন বা তালিকা')}/>
      </label>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead className="bg-slate-100"><tr><th className="p-3">{tr('Account','অ্যাকাউন্ট')}</th><th className="p-3">{tr('List','তালিকা')}</th><th className="p-3">{tr('TIN','টিআইএন')}</th><th className="p-3">{tr('Name','নাম')}</th></tr></thead>
          <tbody>{visible.map(person=><tr key={person.id} className="border-t border-slate-200">
            <td className="p-3 font-mono">{person.owner_uid.slice(0,8)}…</td>
            <td className="p-3">{names.get(person.list_id)??'—'}</td>
            <td className="p-3 font-mono">{person.tin||'—'}</td>
            <td className="p-3">{person.display_name||tr('Empty list','খালি তালিকা')}</td>
          </tr>)}</tbody>
        </table>
        {visible.length===0&&<p className="p-5 text-center text-slate-600">
          {tr(snapshot.lists.length?'No matching beneficiaries':'No saved beneficiary records','কোনো সংরক্ষিত উপকারভোগী নেই')}
        </p>}
      </div>
    </>}
  </section>;
}
