import { useEffect, useState, startTransition } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../store/store";
import { setIsDesktop } from "../store/uiSlice";
import { useAppearance } from "../hooks/useAppearance";
import { LoginPage } from "../pages/auth/LoginPage";
import { AppShell } from "./AppShell";
import { HelpProvider } from "../context/HelpContext";
import { HelpDrawer } from "../components/help/HelpDrawer";
import { getOfficeReviewClient } from "../pages/payments/OfficeReviewQueue";
import { PRIMARY_ADMIN_EMAIL } from "../utils/primaryAdminIdentity";
import { isOfficeAdminDemo } from "../utils/officeAdminDemo";

/**
 * Connected Office access MUST be based on server-verified Supabase identity and
 * a current active officer role. Legacy localStorage auth is preview-only when
 * no backend is configured; it cannot open the connected Office shell.
 */
export function AppRoot() {
  const dispatch = useDispatch<AppDispatch>();
  const previewAdminAuthenticated = useSelector((s:RootState)=>s.auth.isAuthenticated && s.auth.userId === "admin");
  const client=getOfficeReviewClient();
  const [verification,setVerification]=useState<'checking'|'authorized'|'denied'>(client?'checking':'denied');
  const [showShell,setShowShell]=useState(false);
  useAppearance();

  useEffect(()=>{
    const sync=()=>dispatch(setIsDesktop(window.innerWidth>=1024));
    sync();window.addEventListener('resize',sync);
    return()=>window.removeEventListener('resize',sync);
  },[dispatch]);

  useEffect(()=>{
    if(!client)return;
    let alive=true,sequence=0;
    const verify=async()=>{
      const current=++sequence;
      setVerification('checking');
      try{
        const {data:identity,error:authError}=await client.auth.getUser();
        if(!alive||sequence!==current)return;
        if(authError||!identity.user){setVerification('denied');return;}
        const role=await client.from('taxpay_officer_roles')
          .select('role,active').eq('user_uid',identity.user.id).maybeSingle();
        // Administrator membership is separately verified by Supabase RLS and cannot
        // authorize officer maker/reviewer/approver SQL operations.
        const isApprovedEmail=identity.user.email?.toLowerCase()===PRIMARY_ADMIN_EMAIL
          && Boolean(identity.user.email_confirmed_at);
        const admin=isApprovedEmail
          ? await client.from('taxpay_portal_admins')
              .select('active').eq('user_uid',identity.user.id).maybeSingle()
          : null;
        if(!alive||sequence!==current)return;
        const {data:confirm,error:confirmError}=await client.auth.getUser();
        if(!alive||sequence!==current)return;
        const unchangedSession=!confirmError && confirm.user?.id===identity.user.id;
        const authorizedOfficer=!role.error && role.data?.active===true;
        const authorizedAdministrator=isApprovedEmail && !!admin && !admin.error
          && admin.data?.active===true && confirm.user?.email?.toLowerCase()===PRIMARY_ADMIN_EMAIL
          && Boolean(confirm.user?.email_confirmed_at);
        setVerification(unchangedSession && (authorizedOfficer || authorizedAdministrator)?'authorized':'denied');
      }catch{if(alive&&sequence===current)setVerification('denied');}
    };
    const {data:listener}=client.auth.onAuthStateChange((event)=>{
      if(!alive)return;
      if(event==='SIGNED_OUT'){sequence++;setVerification('denied');}
      else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED')void verify();
    });
    void verify();
    return()=>{alive=false;sequence++;listener.subscription.unsubscribe();};
  },[client]);

  const authorized=client?verification==='authorized':(previewAdminAuthenticated && isOfficeAdminDemo());
  useEffect(()=>{startTransition(()=>setShowShell(authorized));},[authorized]);
  return <HelpProvider>
    {client&&verification==='checking'
      ? <main className="login-form-wrapper" role="status"><p>Verifying authorized officer account…</p></main>
      : showShell && authorized ? <AppShell/> : <LoginPage/>}
    <HelpDrawer/>
  </HelpProvider>;
}
