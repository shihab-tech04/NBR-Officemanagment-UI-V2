import {describe,expect,it} from 'vitest';
import {resolveMirrorSourceProject,signedTaxpayerSourceUrl} from '../supabase/functions/demo-story1-office/mirrorSource';

const id='12345678-1234-1234-1234-123456789012';
const session='00000000-1111-2222-3333-444444444444';

describe('Office dual Taxpayer signed mirror source routing',()=>{
  it('preserves the existing original Taxpayer source when omitted',()=>{
    expect(resolveMirrorSourceProject(undefined)).toBe('original');
    expect(signedTaxpayerSourceUrl('original','payment',id,session))
      .toBe('https://eyqhoavnitkrajvyqvxn.supabase.co/functions/v1/demo-story1-taxpay/payments/'+id+'?sessionId='+session);
  });
  it('routes an explicitly selected V2 signed source readback to V2 only',()=>{
    expect(resolveMirrorSourceProject('v2')).toBe('v2');
    expect(signedTaxpayerSourceUrl('v2','payment',id,session))
      .toBe('https://gmuhitmaynfhipcvbvkh.supabase.co/functions/v1/demo-story1-taxpay/payments/'+id+'?sessionId='+session);
  });
  it('supports signed authorization snapshots from either distinct source',()=>{
    for(const project of ['original','v2'] as const){
      expect(signedTaxpayerSourceUrl(project,'authorization',id)).toContain(
        '/functions/v1/demo-story1-taxpay/authorizations/'+id+'/snapshot'
      );
    }
    expect(signedTaxpayerSourceUrl('v2','authorization',id))
      .not.toContain('eyqhoavnitkrajvyqvxn');
  });
  it('rejects unknown, Office, blank and URL-like self-selected source values',()=>{
    for(const value of [null,'','V2','office','ihbtabrvmyiwikqqbhrf','https://evil.invalid',{},0,true]){
      expect(resolveMirrorSourceProject(value)).toBeNull();
    }
  });
  it('never accepts an omitted payment session on a signed payment readback',()=>{
    expect(()=>signedTaxpayerSourceUrl('v2','payment',id)).toThrow(/MIRROR_SESSION_REQUIRED/);
  });
  it('encodes all user-supplied path and query segments, never alters the host',()=>{
    const url=signedTaxpayerSourceUrl('v2','payment',id+'?q=attack',session+'&x=1');
    const parsed=new URL(url);
    expect(parsed.host).toBe('gmuhitmaynfhipcvbvkh.supabase.co');
    expect(parsed.searchParams.get('sessionId')).toBe(session+'&x=1');
    expect(parsed.searchParams.has('x')).toBe(false);
    expect(parsed.pathname.endsWith(encodeURIComponent(id+'?q=attack'))).toBe(true);
  });
  it('cannot route via an unsupported project even if a caller bypasses the parser',()=>{
    expect(()=>signedTaxpayerSourceUrl('office' as 'v2','payment',id,session)).toThrow(/UNKNOWN_TAXPAYER_SOURCE/);
  });
});
