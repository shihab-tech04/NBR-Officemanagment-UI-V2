/** Allowlisted Taxpayer simulation sources for Office-side signed readback.
 *
 * An inbound source selector is NOT an authorization claim: the selected
 * Taxpayer Edge still verifies the short-lived payment/session-bound proof
 * under its *own* private secret before Office can create a mirror.
 * Missing selector preserves the existing original-only client contract.
 */
export type MirrorSourceProject='original'|'v2';
const original='https://eyqhoavnitkrajvyqvxn.supabase.co';
const v2='https://gmuhitmaynfhipcvbvkh.supabase.co';
const projectHost:Readonly<Record<MirrorSourceProject,string>>=Object.freeze({original,v2});

export function resolveMirrorSourceProject(value:unknown):MirrorSourceProject|null {
  if(value===undefined||value==='original')return 'original';
  if(value==='v2')return 'v2';
  return null;
}

export function signedTaxpayerSourceUrl(
  source:MirrorSourceProject,
  type:'payment'|'authorization',
  id:string,
  sessionId?:string
):string {
  const base=projectHost[source];
  if(!base)throw Error('UNKNOWN_TAXPAYER_SOURCE');
  const paymentId=encodeURIComponent(id);
  const path=type==='authorization'
    ?'/functions/v1/demo-story1-taxpay/authorizations/'+paymentId+'/snapshot'
    :'/functions/v1/demo-story1-taxpay/payments/'+paymentId;
  if(type==='payment'){
    if(!sessionId)throw Error('MIRROR_SESSION_REQUIRED');
    return base+path+'?sessionId='+encodeURIComponent(sessionId);
  }
  return base+path;
}
