import {describe,it,expect} from "vitest";
import {loadOfficeStoryCursorNotices,parseOfficeStoryCursorPage} from "../officeStoryNoticePages";

const paymentId="55555555-5555-4555-8555-555555555555";
function item(id:string){
 return {id,paymentId,type:"NEW_SIMULATED_PAYMENT",createdAt:"2026-11-13T12:00:00Z",
   payment:{id:paymentId,service:"ADVANCE_TAX",amountMinor:"125050",
     status:"SIMULATED_SUCCESS",createdAt:"2026-11-13T12:00:00Z"}};
}
function page(items:ReturnType<typeof item>[],hasMore:boolean,afterId="0"){
 return {items,hasMore,nextAfterId:items.at(-1)?.id??afterId};
}
describe("canonical #270 Office cursor consumer",()=>{
 it("retains exact BIGINT notice IDs and rejects unsafe Number or malformed amounts",()=>{
   const id="9007199254740993";
   expect(parseOfficeStoryCursorPage(page([item(id)],false),"0").items[0].id).toBe(id);
   expect(()=>parseOfficeStoryCursorPage(page([{...item(id),id:Number(id)}] as never,false),"0")).toThrow();
   expect(()=>parseOfficeStoryCursorPage(page([{...item(id),payment:{...item(id).payment,amountMinor:"9.25"}}],false),"0")).toThrow();
   expect(()=>parseOfficeStoryCursorPage(page([item("9223372036854775808")],false),"0")).toThrow();
 });
 it("walks 235 notices without the legacy 100-notice limit or rounding",async()=>{
   const ids=Array.from({length:235},(_,index)=>(9007199254740993n+BigInt(index)).toString());
   const calls:string[]=[];
   const rows=await loadOfficeStoryCursorNotices(async(after,limit)=>{
     calls.push(after);
     const selected=ids.filter(id=>BigInt(id)>BigInt(after)).slice(0,limit);
     return page(selected.map(item),BigInt(selected.at(-1)??after)<BigInt(ids.at(-1)!),after);
   });
   expect(rows.map(row=>row.id)).toEqual(ids);
   expect(calls).toEqual(["0",ids[99],ids[199]]);
 });
 it("supports an underfull page that still has a following cursor and refresh recovery",async()=>{
   const ids=Array.from({length:5},(_,i)=>String(i+1));
   const request=async(after:string)=>{
     const remaining=ids.filter(id=>BigInt(id)>BigInt(after)).slice(0,2);
     return page(remaining.map(item),BigInt(remaining.at(-1)??after)<5n,after);
   };
   expect((await loadOfficeStoryCursorNotices(request)).map(row=>row.id)).toEqual(ids);
 });
 it("fails closed on a repeated cursor, duplicate, malformed row or partial network failure",async()=>{
   await expect(loadOfficeStoryCursorNotices(async()=>page([item("1")],true))).rejects.toThrow();
   await expect(loadOfficeStoryCursorNotices(async(after)=>{
     if(after==="0")return page([item("1")],true);
     throw Error("offline");
   })).rejects.toThrow("offline");
   await expect(loadOfficeStoryCursorNotices(async(after)=>{
     return after==="0"?page([item("1")],true):page([item("1")],false);
   })).rejects.toThrow();
   expect(()=>parseOfficeStoryCursorPage(page([item("3"),item("2")],false),"0")).toThrow();
 });
});
