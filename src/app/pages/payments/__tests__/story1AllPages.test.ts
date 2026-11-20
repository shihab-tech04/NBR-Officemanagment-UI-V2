import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const auth = vi.hoisted(()=>({getUser:vi.fn(),getSession:vi.fn()}));
vi.mock('../../audit/auditSharedSql',()=>({
  isSharedAuditMode:()=>false,
  getAuditSqlClient:()=>({auth}),
}));
vi.mock('../../../services/officeCmsBridge',()=>({
  getOfficeCmsAuthClient:()=>({auth}),
}));
import {getStoryPayments} from '../story1OfficeApi';

beforeEach(()=>{
  auth.getUser.mockResolvedValue({data:{user:{id:'officer-one',is_anonymous:false}},error:null});
  auth.getSession.mockResolvedValue({data:{session:{user:{id:'officer-one'},access_token:'office-officer-jwt'}},error:null});
});
afterEach(()=>{vi.unstubAllGlobals();auth.getUser.mockReset();auth.getSession.mockReset();});

describe('Office SQL historical/new payment pagination',()=>{
  it('requires the existing verified Office Auth account and sends its bearer on all payment pages',async()=>{
    auth.getUser.mockResolvedValueOnce({data:{user:null},error:null});
    const fetchMock=vi.fn();
    vi.stubGlobal('fetch',fetchMock);
    await expect(getStoryPayments()).rejects.toThrow('Verified Office officer sign-in');
    expect(fetchMock).not.toHaveBeenCalled();
    auth.getUser.mockResolvedValueOnce({data:{user:{id:'officer-one',is_anonymous:false}},error:null});
    auth.getSession.mockResolvedValueOnce({data:{session:{user:{id:'switched-officer'},access_token:'other-jwt'}},error:null});
    await expect(getStoryPayments()).rejects.toThrow('Office officer session changed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('continues beyond the old 10,000-row cap without duplicate IDs or lost end pages',async()=>{
    const total=10001;
    const fetchMock=vi.fn(async(url:string,request?:RequestInit)=>{
      expect((request?.headers as Record<string,string>)?.Authorization).toBe('Bearer office-officer-jwt');
      const query=new URL(url);
      const page=Number(query.searchParams.get('page'));
      const from=(page-1)*100;
      const count=Math.max(0,Math.min(100,total-from));
      const items=Array.from({length:count},(_,i)=>({
        id:'payment-'+String(from+i).padStart(6,'0'),
        service:'TAX_WITH_RETURN',
        status:'SIMULATED_SUCCESS',
        amountMinor:1000,
        createdAt:'2026-11-02T06:00:00Z'
      }));
      return {ok:true,json:async()=>({success:true,data:{items,total,page,perPage:100}})};
    });
    vi.stubGlobal('fetch',fetchMock);
    const rows=await getStoryPayments();
    expect(rows).toHaveLength(total);
    expect(rows[0].id).toBe('payment-000000');
    expect(rows[total-1].id).toBe('payment-010000');
    expect(fetchMock).toHaveBeenCalledTimes(101);
  });
  it('accepts an identical overlapping immutable Office payment during page refresh',async()=>{
    const payment=(id:number)=>({
      id:'payment-'+String(id),service:'OTHER_TAX_PAYMENT',
      status:'SIMULATED_SUCCESS',amountMinor:500,createdAt:'2026-11-05T06:00:00Z',
      details:{payerId:'payer-1',allocations:[{
        taxpayerTin:'001234567890',headId:68,assessmentYear:'2026-27',amountMinor:500
      }],lines:[{headId:68,headNameEn:'Advance Tax'}]},
    });
    const fetchMock=vi.fn(async(url:string)=>{
      const page=Number(new URL(url).searchParams.get('page'));
      const items=page===1
        ?Array.from({length:100},(_,i)=>payment(i))
        :page===2?[structuredClone(payment(0)),payment(100)]:[];
      return {ok:true,json:async()=>({success:true,data:{items,total:101,page,perPage:100}})};
    });
    vi.stubGlobal('fetch',fetchMock);
    const result=await getStoryPayments();
    expect(result).toHaveLength(101);
    expect(result[0].details?.allocations?.[0].taxpayerTin).toBe('001234567890');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects conflicting identical-parent IDs across Office SQL pages before any report',async()=>{
    const payment=(id:number)=>({
      id:'payment-'+String(id),service:'OTHER_TAX_PAYMENT',
      status:'SIMULATED_SUCCESS',amountMinor:500,createdAt:'2026-11-05T06:00:00Z',
      details:{payerId:'payer-1',allocations:[{
        taxpayerTin:'001234567890',headId:68,assessmentYear:'2026-27',amountMinor:500
      }],lines:[{headId:68,headNameEn:'Advance Tax'}]},
    });
    for(const conflict of [
      {...payment(0),amountMinor:999},
      {...payment(0),status:'FAILED'},
      {...payment(0),details:{...payment(0).details,payerId:'payer-other'}},
    ]){
      const fetchMock=vi.fn(async(url:string)=>{
        const page=Number(new URL(url).searchParams.get('page'));
        const items=page===1
          ?Array.from({length:100},(_,i)=>payment(i))
          :page===2?[conflict,payment(100)]:[];
        return {ok:true,json:async()=>({success:true,data:{items,total:101,page,perPage:100}})};
      });
      vi.stubGlobal('fetch',fetchMock);
      await expect(getStoryPayments()).rejects.toThrow('Payment history changed during pagination; retry');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  });

  it('rejects missing SQL pages instead of reporting an incomplete payment history as complete',async()=>{
    const fetchMock=vi.fn(async(url:string)=>{
      const page=Number(new URL(url).searchParams.get('page'));
      return {ok:true,json:async()=>({success:true,data:{items:page===1
        ?[{id:'first',service:'ADVANCE_TAX',status:'SIMULATED_SUCCESS',amountMinor:300,createdAt:'2026-11-02T06:00:00Z'}]
        :[],total:200,page,perPage:100}})};
    });
    vi.stubGlobal('fetch',fetchMock);
    await expect(getStoryPayments()).rejects.toThrow('Payment history changed during pagination');
  });
});
