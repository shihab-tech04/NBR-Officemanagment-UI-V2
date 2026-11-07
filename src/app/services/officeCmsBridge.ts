import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Office Management is the ONLY source of identity for CMS publication.
 * TaxPay remains a different Supabase project containing the published assets.
 * Both keys here are publishable (never server credentials).
 */
export const OFFICE_CMS_URL = 'https://ihbtabrvmyiwikqqbhrf.supabase.co';
export const OFFICE_CMS_PUBLIC_KEY = 'sb_publishable_PyxzQzcf77wnlJQFepowrA_0MfhqGd5';
export const OFFICE_CMS_PUBLISHER_UID = '3c62128a-8755-41e5-af1c-8e5848c95bc7';
export const OFFICE_CMS_PUBLISHER_EMAIL = 'shihabshajib01@gmail.com';
const OFFICE_AUTH_STORAGE_KEY = 'nbr-office-management-cms-session';
const OFFICE_REMEMBER_KEY = 'nbr-office-management-remember-me';
let officeClient: SupabaseClient | null = null;

/** Remember me persists only the Supabase Auth session, never a password.
 * Unchecked sessions live in sessionStorage and end when the tab session closes.
 * Both storage locations are cleared on verified sign-out.
 */
export function readRememberOfficeSession(): boolean {
  try { return window.localStorage.getItem(OFFICE_REMEMBER_KEY) === 'true'; }
  catch { return false; }
}

const officeSessionStorage = {
  getItem(key: string): string | null {
    try {
      return readRememberOfficeSession()
        ? window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)
        : window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
    } catch { return null; }
  },
  setItem(key: string, value: string): void {
    if (readRememberOfficeSession()) {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
      window.localStorage.removeItem(key);
    }
  },
  removeItem(key: string): void {
    try { window.localStorage.removeItem(key); } catch { /* blocked */ }
    try { window.sessionStorage.removeItem(key); } catch { /* blocked */ }
  },
};

export function setRememberOfficeSession(remember: boolean): void {
  const previous = officeSessionStorage.getItem(OFFICE_AUTH_STORAGE_KEY);
  try { window.localStorage.setItem(OFFICE_REMEMBER_KEY, remember ? 'true' : 'false'); }
  catch { /* session-only fallback when local storage is unavailable */ }
  if (previous) officeSessionStorage.setItem(OFFICE_AUTH_STORAGE_KEY, previous);
}


export function getOfficeCmsAuthClient():SupabaseClient {
  if (!officeClient) officeClient = createClient(OFFICE_CMS_URL,OFFICE_CMS_PUBLIC_KEY,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,
      storageKey:OFFICE_AUTH_STORAGE_KEY,storage:officeSessionStorage},
  });
  return officeClient;
}

export async function isVerifiedOfficeCmsPublisher():Promise<boolean> {
  const { data, error } = await getOfficeCmsAuthClient().auth.getUser();
  const user = data?.user;
  return !error && !!user && !user.is_anonymous &&
    user.id === OFFICE_CMS_PUBLISHER_UID &&
    user.email?.toLowerCase() === OFFICE_CMS_PUBLISHER_EMAIL && !!user.email_confirmed_at;
}

export type OfficeCmsAction = 'status'|'list-banners'|'publish-logo'|'restore-logo'|'publish-banner'|'delete-banner';
export type OfficeCmsFields = Record<string,string|number|boolean|null|undefined>;
export async function callOfficeCmsBridge<T>(
  action:OfficeCmsAction, fields:OfficeCmsFields = {}, files:Record<string,File|null> = {},
):Promise<T> {
  const office = getOfficeCmsAuthClient();
  const { data:{session}, error:sessionError } = await office.auth.getSession();
  if (sessionError || !session?.access_token) throw new Error('Sign in to Office Management to publish TaxPay content.');
  const cmsUrl = import.meta.env.VITE_TAXPAY_CMS_SUPABASE_URL as string | undefined;
  const cmsKey = import.meta.env.VITE_TAXPAY_CMS_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if(!cmsUrl || !cmsKey) throw new Error('TaxPay publishing bridge is not configured.');
  const payload = new FormData();
  payload.append('action',action);
  for (const [key,value] of Object.entries(fields)) {
    if (value!==undefined && value!==null) payload.append(key,String(value));
  }
  for (const [key,file] of Object.entries(files)) if(file) payload.append(key,file,file.name);
  let response:Response;
  try {
    response=await fetch(cmsUrl+'/functions/v1/office-cms-publish',{
      method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:cmsKey},body:payload,
    });
  } catch {
    throw new Error('TaxPay publishing service could not be reached. Keep your draft and retry.');
  }
  const body = await response.json().catch(() => null) as {error?:string}|null;
  if(!response.ok) throw new Error(body?.error || ('TaxPay publishing rejected this request ('+response.status+').'));
  if(!body) throw new Error('TaxPay publishing returned no confirmation.');
  return body as T;
}