import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({user:vi.fn(),session:vi.fn(),rpc:vi.fn()}));
vi.mock('../../../services/officeCmsBridge',()=>({
  getOfficeCmsAuthClient:()=>({auth:{getUser:mocks.user,getSession:mocks.session},rpc:mocks.rpc})
}));
vi.mock('../../audit/auditSharedSql',()=>({
  isSharedAuditMode:()=>false,getAuditSqlClient:vi.fn()
}));
import {parseGuardedOfficeLedger,getGuardedOfficeLedger,projectGuardedLedgerRows,formatLedgerMinor}
  from '../officeGuardedLedgerSource';

const tin='111111111111';
const recorded={
  sourceSystem:'SOHOJKOR',sourceRecordId:'parent-1',sourceAllocationId:null,sourceRevision:1,
  taxpayerTin:tin,dhara:null,paymentSource:'Sohojkor',
  amountMinor:'5000',assessmentYear:'2026-27',eventDate:'2026-06-03T10:00:00Z',
  originalReference:null,entryKind:'PAYMENT_RECORD',financialStatus:'UNVERIFIED'
};
const verified={
  ...recorded,sourceSystem:'BANK',sourceRecordId:'evidence-1',
  sourceAllocationId:'allocation-1',entryKind:'CREDIT',financialStatus:'VERIFIED',
  amountMinor:'90071992547409931234',dhara:'164',
  evidenceSha256:'a'.repeat(64),
  canonicalCreditReference:'credit-parent',canonicalCreditLineId:'credit-line',
  reconciliationProvenance:{officialSourceRecordId:'source-bank-1',verifiedAt:'2026-06-03T10:01:00Z'}
};
const page=(items:unknown[],credit='90071992547409931234')=>({
  items,offset:0,limit:200,verifiedExternalCreditMinor:credit,
  mirroredSohojkorCreditVerified:false
});
describe('WS4 officer-only evidence ledger source',()=>{
  beforeEach(()=>{
    mocks.user.mockReset();mocks.session.mockReset();mocks.rpc.mockReset();
  });
  it('keeps simulated payment mirrors separate from source-evidenced credits',()=>{
    const result=parseGuardedOfficeLedger(page([recorded,verified]),tin,0);
    expect(result.items).toHaveLength(2);
    const rows=projectGuardedLedgerRows(result.items,'all','en');
    expect(rows.find(x=>x.payment_ref==='parent-1')?.credit_status).toBe('Not verified as credit');
    expect(rows.find(x=>x.payment_ref==='evidence-1')?.credit_status).toBe('Source-verified external credit');
    expect(rows.find(x=>x.payment_ref==='parent-1')?.dhara).toBe('—');
    expect(rows.find(x=>x.payment_ref==='evidence-1')?.dhara).toBe('164');
    expect(formatLedgerMinor(verified.amountMinor,'en')).toContain('900,719,925,474,099,312.34');
  });
  it('never admits a foreign taxpayer, guessed credit or duplicate source identity',()=>{
    expect(()=>parseGuardedOfficeLedger(page([{...recorded,taxpayerTin:'222222222222'}]),tin,0)).toThrow();
    expect(()=>parseGuardedOfficeLedger(page([{...recorded,financialStatus:'VERIFIED'}]),tin,0)).toThrow();
    expect(()=>parseGuardedOfficeLedger(page([{...verified,evidenceSha256:null}]),tin,0)).toThrow();
    expect(()=>parseGuardedOfficeLedger(page([{...verified,canonicalCreditLineId:null}]),tin,0)).toThrow();
    expect(()=>parseGuardedOfficeLedger(page([recorded,recorded]),tin,0)).toThrow();
    expect(()=>parseGuardedOfficeLedger({...page([recorded]),mirroredSohojkorCreditVerified:true},tin,0)).toThrow();
    expect(()=>parseGuardedOfficeLedger(page([recorded]),tin,200)).toThrow();
  });
  it('rejects calendar-invalid timestamps and impossible verification dates',()=>{
    expect(()=>parseGuardedOfficeLedger(page([
      {...recorded,eventDate:'2026-02-30T10:00:00Z'}
    ]),tin,0)).toThrow();
    expect(()=>parseGuardedOfficeLedger(page([
      {...verified,reconciliationProvenance:{
        officialSourceRecordId:'source-bank-1',verifiedAt:'2026-02-30T10:00:00Z'
      }}
    ]),tin,0)).toThrow();
  });
  it('filters only after the Office source validates taxpayer/year/date',()=>{
    const source=parseGuardedOfficeLedger(page([recorded,verified]),tin,0);
    expect(projectGuardedLedgerRows(source.items,'2025-26','en')).toHaveLength(0);
    expect(projectGuardedLedgerRows(source.items,'2026-27','en','2026-06-04')).toHaveLength(0);
    expect(projectGuardedLedgerRows(source.items,'2026-27','bn','2026-06-01','2026-06-03')).toHaveLength(2);
  });
  it('does not call privileged SQL without verified Office session',async()=>{
    mocks.user.mockResolvedValue({data:{user:null},error:null});
    await expect(getGuardedOfficeLedger(tin)).rejects.toThrow('Verified Office officer');
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue({data:{user:{id:'officer-1',is_anonymous:false}},error:null});
    mocks.session.mockResolvedValue({data:{session:{user:{id:'officer-2'},access_token:'valid'}},error:null});
    await expect(getGuardedOfficeLedger(tin)).rejects.toThrow('Office officer session changed');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('propagates only a generic error when Office SQL rejects role or is not installed',async()=>{
    mocks.user.mockResolvedValue({data:{user:{id:'officer-1',is_anonymous:false}},error:null});
    mocks.session.mockResolvedValue({data:{session:{user:{id:'officer-1'},access_token:'valid'}},error:null});
    mocks.rpc.mockResolvedValue({data:null,error:{message:'private diagnostic with TIN'}}); 
    await expect(getGuardedOfficeLedger(tin)).rejects.toThrow('Authorized external ledger source is unavailable');
    expect(mocks.rpc).toHaveBeenCalledWith('payment_v1_office_guarded_taxpayer_ledger',{
      p_taxpayer_tin:tin,p_limit:200,p_offset:0
    });
    mocks.rpc.mockResolvedValue({data:page([recorded]),error:null});
    await expect(getGuardedOfficeLedger(tin)).resolves.toMatchObject({items:[recorded]});
  });
});
