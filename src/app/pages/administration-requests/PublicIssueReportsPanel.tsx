import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type SupportReport = {
 id: string; category: 'payment'|'reference'|'security'; details: string;
 status: 'received'|'in_review'|'resolved'|'closed';
 review_note: string|null; submitted_at: string; updated_at: string;
};
const statusOptions = ['received','in_review','resolved','closed'] as const;
const labelStatus:Record<SupportReport['status'],string>={
 received:'Received',in_review:'In review',resolved:'Resolved',closed:'Closed'
};
const labelCategory:Record<SupportReport['category'],string>={
 payment:'Payment issue',reference:'Receipt or reference',security:'Security concern'
};
function referenceFromId(id:string){ return 'KRB-'+id.replace(/-/g,'').slice(0,12).toUpperCase(); }

/** Reuses the verified TaxPay CMS Supabase session; never uses the Office preview role. */
export function PublicIssueReportsPanel({cms,authUid}:{cms:SupabaseClient;authUid:string}){
 const [rows,setRows]=useState<SupportReport[]>([]);
 const [filter,setFilter]=useState('');
 const [status,setStatus]=useState<'all'|SupportReport['status']>('all');
 const [selected,setSelected]=useState<string|null>(null);
 const [draftStatus,setDraftStatus]=useState<SupportReport['status']>('received');
 const [draftNote,setDraftNote]=useState('');
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const refresh=useCallback(async()=>{
   setLoading(true);setError('');
   try{
     const {data,error:queryError}=await cms.from('taxpay_public_issue_reports')
       .select('id,category,details,status,review_note,submitted_at,updated_at')
       .order('submitted_at',{ascending:false}).limit(200);
     if(queryError)throw queryError;
     setRows((data||[]) as SupportReport[]);
   }catch(e){setError('Unable to load reports: '+(e as Error).message);}
   finally{setLoading(false);}
 },[cms]);
 useEffect(()=>{void refresh();},[refresh]);
 const visible=useMemo(()=>rows.filter(row=>
   (status==='all'||row.status===status) &&
   (!filter.trim()||[referenceFromId(row.id),row.category,row.details].some(value=>value.toLowerCase().includes(filter.trim().toLowerCase())))
 ),[filter,rows,status]);
 const current=rows.find(row=>row.id===selected)||null;
 const choose=(row:SupportReport)=>{
   setSelected(row.id);setDraftStatus(row.status);setDraftNote(row.review_note||'');setError('');setMessage('');
 };
 const save=async()=>{
   if(!current||saving||!authUid)return;
   setSaving(true);setError('');setMessage('');
   try{
     const {data,error:updateError}=await cms.from('taxpay_public_issue_reports')
       .update({status:draftStatus,review_note:draftNote.trim()||null,updated_at:new Date().toISOString(),reviewed_by:authUid})
       .eq('id',current.id).eq('updated_at',current.updated_at)
       .select('id,category,details,status,review_note,submitted_at,updated_at').maybeSingle();
     if(updateError)throw updateError;
     if(!data)throw new Error('This report changed in another session. Refresh before retrying.');
     setRows(prev=>prev.map(row=>row.id===data.id?data as SupportReport:row));
     setMessage('Status saved to TaxPay SQL.');
   }catch(e){setError('Could not save the review: '+(e as Error).message);}
   finally{setSaving(false);}
 };
 return <section className="cms-panel cms-reports" aria-label="Public issue reports">
   <div className="cms-panel__heading"><h2>Public reports <span className="cms-count">{visible.length}</span></h2>
     <button type="button" disabled={loading||saving} onClick={()=>void refresh()}>Refresh</button>
   </div>
   <p>Submission is not a verified payment or credit. Only verified TaxPay administrators can access this queue.</p>
   <div className="cms-reports__filters">
     <label htmlFor="cms-report-search">Search reports
       <input id="cms-report-search" type="search" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Reference or details"/>
     </label>
     <label htmlFor="cms-report-filter">Status
       <select id="cms-report-filter" value={status} onChange={e=>setStatus(e.target.value as typeof status)}>
         <option value="all">All</option>{statusOptions.map(x=><option value={x} key={x}>{labelStatus[x]}</option>)}
       </select>
     </label>
   </div>
   {loading&&<p role="status">Loading reports…</p>}
   {error&&<p role="alert">{error}</p>}
   {message&&<p role="status">{message}</p>}
   {!loading&&visible.length===0&&<p>No reports found.</p>}
   {visible.length>0&&<div className="cms-reports__table-scroll" role="region" aria-label="Report list" tabIndex={0}>
     <table className="cms-reports__table">
       <thead><tr><th scope="col">Reference</th><th scope="col">Type</th><th scope="col">Received</th><th scope="col">Status</th><th scope="col">Details</th></tr></thead>
       <tbody>{visible.map(row=><tr key={row.id}>
         <td><button type="button" aria-pressed={selected===row.id} onClick={()=>choose(row)}>{referenceFromId(row.id)}</button></td>
         <td>{labelCategory[row.category]}</td>
         <td>{new Date(row.submitted_at).toLocaleString('en-BD')}</td>
         <td>{labelStatus[row.status]}</td>
         <td>{row.details}</td>
       </tr>)}</tbody>
     </table>
   </div>}
   {current&&<section className="cms-reports__review" aria-labelledby="cms-review-heading">
     <h3 id="cms-review-heading">Review {referenceFromId(current.id)}</h3>
     <p>{current.details}</p>
     <label htmlFor="cms-review-status">Review status
       <select id="cms-review-status" value={draftStatus} disabled={saving}
         onChange={e=>setDraftStatus(e.target.value as SupportReport['status'])}>
         {statusOptions.map(x=><option key={x} value={x}>{labelStatus[x]}</option>)}
       </select>
     </label>
     <label htmlFor="cms-review-note">Internal review note
       <textarea id="cms-review-note" rows={3} maxLength={500} disabled={saving}
         value={draftNote} onChange={e=>setDraftNote(e.target.value)}/>
     </label>
     <div className="cms-actions">
       <button type="button" onClick={()=>setSelected(null)} disabled={saving}>Close</button>
       <button className="cms-primary" type="button" disabled={saving||loading}
         onClick={()=>void save()}>{saving?'Saving…':'Save review'}</button>
     </div>
   </section>}
 </section>;
}
