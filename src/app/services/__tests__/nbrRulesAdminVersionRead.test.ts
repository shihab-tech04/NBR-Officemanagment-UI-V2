import { describe, expect, it, vi } from "vitest";
import { createRulesAdminReadClient } from "../nbrRulesAdminReadClient";

const baseUrl="https://example.supabase.co/functions/v1/nbr-rules-api";
const auth={baseUrl,bearerToken:"verified-fixture-token",ruleSessionToken:"fixture-session"};

function row(id: string, versionId="v-"+id) {
  return {rule_id:id,_backend:{
    versionId, revisionNo:1, groupId:"forms-evidence-admin",
    yearApplicabilityStatus:"INHERITED_PENDING_REVIEW",
    executionStatus:"INHERITED_PENDING_REVIEW",
  }};
}
function pager(pages: ReturnType<typeof row>[][], expectedTotal: number) {
  return vi.fn(async (url:string,init?:RequestInit)=>{
    const u=new URL(url);
    if(!init||init.method!=="GET"||init.cache!=="no-store") throw Error("Read-only GET required");
    const page=Number(u.searchParams.get("page")||1);
    return new Response(JSON.stringify({
      year:{assessmentYear:"2027-28",state:"draft",coverage:"cloned_pending_review",executable:false},
      page,perPage:100,total:expectedTotal,rules:pages[page-1]||[],
    }),{status:200});
  });
}

describe("WS03 protected v15 SQL version readback, no write capability",()=>{
  it("reads all 366 identities over four pages and preserves exact version IDs",async()=>{
    const all=Array.from({length:366},(_,i)=>row("TEST-ID-"+String(i+1).padStart(3,"0")));
    const fetcher=pager([all.slice(0,100),all.slice(100,200),all.slice(200,300),all.slice(300)],366);
    const client=createRulesAdminReadClient({...auth,fetcher:fetcher as unknown as typeof fetch});
    const result=await client.getAllRules("2027-28");
    expect(result).toHaveLength(366);
    expect(new Set(result.map(x=>x._backend.versionId)).size).toBe(366);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls.every(call=>call[0].startsWith(baseUrl+"/rules?"))).toBe(true);
  });
  it("fails when the paginated API repeats an identity, even if count remains 366",async()=>{
    const all=Array.from({length:366},(_,i)=>row("TEST-ID-"+String(i+1).padStart(3,"0")));
    all[365]=row("TEST-ID-001","UNIQUE-BUT-REPEATED-RULE");
    const fetcher=pager([all.slice(0,100),all.slice(100,200),all.slice(200,300),all.slice(300)],366);
    await expect(createRulesAdminReadClient({...auth,fetcher:fetcher as unknown as typeof fetch})
      .getAllRules("2027-28")).rejects.toThrow("duplicate/missing");
  });
  it("fails on incomplete pages, changing totals and missing groups",async()=>{
    const onlyOne=[row("TEST-ID-001")];
    await expect(createRulesAdminReadClient({...auth,fetcher:pager([onlyOne,[]],11) as unknown as typeof fetch})
      .getAllRules("2027-28")).rejects.toThrow("incomplete paged");
    const changing=vi.fn(async(url:string)=>{
      const page=Number(new URL(url).searchParams.get("page")||1);
      return new Response(JSON.stringify({
        year:{assessmentYear:"2027-28"},page,perPage:100,total:page===1?101:102,
        rules:Array.from({length:100},(_,i)=>row("ID-"+i)),
      }),{status:200});
    }) as unknown as typeof fetch;
    await expect(createRulesAdminReadClient({...auth,fetcher:changing})
      .getAllRules("2027-28")).rejects.toThrow("changed during");
  });
  it("validates protected groups, gates and summary against requested year",async()=>{
    const fetcher=vi.fn(async(url:string)=>{
      const p=new URL(url).pathname;
      const data=p.endsWith("/groups")?{year:"2027-28",groups:[{
        id:"other",nameEn:"Other",nameBn:"অন্যান্য",isLegalClassification:false,
        total:1,review:1,blocked:0,executable:0,
      }]}:p.endsWith("/gates")?{year:"2027-28",gates:[{
        id:"gate-1",gate_code:"source",gate_name:"Source",status:"REQUIRED",
      }]}:{year:"2027-28",total:366,executionCounts:{INHERITED_PENDING_REVIEW:366},
        yearStatusCounts:{INHERITED_PENDING_REVIEW:366},openChangeRequests:0};
      return new Response(JSON.stringify(data),{status:200});
    }) as unknown as typeof fetch;
    const api=createRulesAdminReadClient({...auth,fetcher});
    expect((await api.getGroups("2027-28"))[0].isLegalClassification).toBe(false);
    expect((await api.getGates("2027-28"))[0].status).toBe("REQUIRED");
    expect((await api.getSummary("2027-28")).total).toBe(366);
  });
  it("requires exact server year, rule ID, revision and immutable version body in detail",async()=>{
    const good={year:{assessment_year:"2027-28",income_year:"2026-27"},
      version:{id:"v1",rule_key:"ACK-1695-001",revision_no:1,year_applicability_status:"INHERITED_PENDING_REVIEW",
        rule_data:{rule_id:"ACK-1695-001"}},identity:{grouping_basis:"ADMIN_UX_CLASSIFICATION_V1"},
      changes:[],audit:[]};
    const api=createRulesAdminReadClient({...auth,fetcher:vi.fn(async()=>new Response(JSON.stringify(good),{status:200})) as unknown as typeof fetch});
    const detail=await api.getRule("2027-28","ACK-1695-001");
    expect(detail.version.id).toBe("v1");
    expect(detail.version.rule_data.rule_id).toBe("ACK-1695-001");
    const malicious={...good,version:{...good.version,rule_key:"OTHER-RULE"}};
    const bad=createRulesAdminReadClient({...auth,fetcher:vi.fn(async()=>new Response(JSON.stringify(malicious),{status:200})) as unknown as typeof fetch});
    await expect(bad.getRule("2027-28","ACK-1695-001")).rejects.toThrow("identity/version/year");
  });
  it("requires bearer and rule session; denied reads never fall back to snapshots",async()=>{
    expect(()=>createRulesAdminReadClient({...auth,bearerToken:""})).toThrow("verified bearer");
    const denied=vi.fn(async()=>new Response(JSON.stringify({error:"Denied"}),{status:403})) as unknown as typeof fetch;
    await expect(createRulesAdminReadClient({...auth,fetcher:denied}).getAllRules("2027-28")).rejects.toThrow("403");
  });
});
