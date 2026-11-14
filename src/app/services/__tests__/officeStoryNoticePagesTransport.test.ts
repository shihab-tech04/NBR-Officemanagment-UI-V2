import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";

const client=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("../officeStoryNoticeReadState",()=>({
  parseOfficeNoticeId:(value:unknown)=>{
    if(typeof value!=="string"||!/^[1-9][0-9]{0,18}$/.test(value))return null;
    return BigInt(value)<=9223372036854775807n?value:null;
  },
  getOfficeStoryNoticeReadState:client.read,
}));
import {getVerifiedOfficerStoryNotices} from "../officeStoryNoticePages";

const paymentId="77777777-7777-4777-8777-777777777777";
function event(id:string) {
  return {id,paymentId,type:"NEW_SIMULATED_PAYMENT",createdAt:"2026-11-14T04:00:00Z",
    payment:{id:paymentId,service:"ADVANCE_TAX",amountMinor:"125050",
      status:"SIMULATED_SUCCESS",createdAt:"2026-11-14T04:00:00Z"}};
}
const ids=Array.from({length:235},(_,i)=>(9007199254740993n+BigInt(i)).toString());
beforeEach(()=>{
 client.read.mockReset();
 client.read.mockImplementation(async(batch:string[])=>({
   officerUid:"officer-one",notices:batch.map(id=>({noticeId:id,isRead:id===ids[101]})),
 }));
 vi.stubGlobal("fetch",vi.fn(async(url:string)=>{
   const request=new URL(String(url));
   if(!request.pathname.endsWith("/notifications/page"))throw Error("Wrong API route");
   const after=request.searchParams.get("afterId")??"0";
   const limit=Number(request.searchParams.get("limit")??"100");
   const selected=ids.filter(id=>BigInt(id)>BigInt(after)).slice(0,limit);
   return {ok:true,json:async()=>({success:true,simulationOnly:true,data:{
     items:selected.map(event),nextAfterId:selected.at(-1)??after,hasMore:
       selected.length>0&&BigInt(selected.at(-1)!)<BigInt(ids.at(-1)!),
   }})};
 }));
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe("Office SQL notice page + officer read-state transport",()=>{
 it("reads all 235 exact bigint IDs, batches read-state in 100, and marks only officer-owned receipts",async()=>{
   const value=await getVerifiedOfficerStoryNotices();
   expect(value.officerUid).toBe("officer-one");
   expect(value.notices.map(x=>x.id)).toEqual(ids);
   expect(value.readIds).toEqual([ids[101]]);
   expect(client.read.mock.calls.map(([batch])=>batch.length)).toEqual([0,100,100,35,0]);
   expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(3);
 });
 it("fails closed on an officer change midway through a paginated read-state",async()=>{
   client.read.mockImplementation(async(batch:string[])=>({
     officerUid:batch.length===100&&batch[0]===ids[100]?"officer-two":"officer-one",
     notices:batch.map(id=>({noticeId:id,isRead:true})),
   }));
   await expect(getVerifiedOfficerStoryNotices()).rejects.toThrow("officer changed");
 });
 it("never publishes partial notifications after a later page fails offline",async()=>{
   const original=globalThis.fetch;
   let calls=0;
   vi.stubGlobal("fetch",vi.fn(async(input:string)=>{
     if(++calls===2)throw Error("network offline");
     return original(input);
   }));
   await expect(getVerifiedOfficerStoryNotices()).rejects.toThrow("network offline");
   expect(client.read.mock.calls).toHaveLength(1);
 });
 it("does not publish a partial list if an officer read-state RPC rejects the page",async()=>{
   client.read.mockImplementation(async(batch:string[])=>{
     if(batch.length===100)throw Error("officer role revoked");
     return {officerUid:"officer-one",notices:[]};
   });
   await expect(getVerifiedOfficerStoryNotices()).rejects.toThrow("officer role revoked");
 });
});
