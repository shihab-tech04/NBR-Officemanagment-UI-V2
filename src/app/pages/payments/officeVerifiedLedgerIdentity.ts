import type {TaxpayerRegistrationProfile} from './officeTaxpayerRegistrationProfiles';

const VERIFIED_PROFILE_SOURCES=new Set(['NBR_TIN','REVIEWED_CERTIFICATE']);

/**
 * Resolve the canonical Taxpayer TIN for the guarded Office ledger.
 * Preview account sample TINs are presentation-only and are never trusted as
 * identity. A server-validated registration profile must establish the exact
 * account binding and an authoritative identity source before a SQL read.
 */
export function resolveVerifiedOfficeLedgerTin(
 selectedTin:string,
 previewAccountId:string|null,
 profile:TaxpayerRegistrationProfile|null,
):string{
 if(!profile||typeof profile.accountId!=='string'||!profile.accountId.trim()||
    typeof profile.tin!=='string'||!/^\d{12}$/.test(profile.tin)||
    !profile.profile||typeof profile.profile!=='object'||
    profile.profile.tin!==profile.tin||
    !VERIFIED_PROFILE_SOURCES.has(profile.profile.source)||
    typeof profile.profile.sourceUpdatedAt!=='string'||
    !Number.isFinite(Date.parse(profile.profile.sourceUpdatedAt)))return '';
 if(previewAccountId!==null)
  return profile.accountId===previewAccountId?profile.tin:'';
 return profile.tin===selectedTin?profile.tin:'';
}
