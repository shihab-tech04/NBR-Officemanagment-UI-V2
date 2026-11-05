import { describe, expect, it } from "vitest";
import { ALL_TAXPAYER_ROWS } from "./auditData";
import { AUDIT_SIGNAL_IDS, evaluateAuditReturn, type ReturnInputs } from "./auditReturnScreening";

const codes=(value:unknown)=>String(value??"").match(/R-[A-E][1-4]/g)??[];
describe("Audit return-driven screening population",()=>{
  it("preserves the 36 original profiles and has 64 unique taxpayers",()=>{
    expect(ALL_TAXPAYER_ROWS).toHaveLength(64);
    const ids=ALL_TAXPAYER_ROWS.map(row=>String(row.id));
    expect(new Set(ids).size).toBe(64);
    expect(ids.slice(0,36)).toEqual(Array.from({length:36},(_,i)=>"P"+(i+1)));
    expect(new Set(ALL_TAXPAYER_ROWS.map(row=>String(row.return_id))).size).toBe(64);
  });
  it("fires all 15 official framework signal identities from financial facts",()=>{
    const covered=new Set(ALL_TAXPAYER_ROWS.flatMap(row=>codes(row.signals)));
    expect(AUDIT_SIGNAL_IDS.every(code=>covered.has(code))).toBe(true);
  });
  it("includes at least 10 complete returns with zero triggered risk signals",()=>{
    const unaffected=ALL_TAXPAYER_ROWS.filter(row=>row.data_quality==="Complete"&&codes(row.signals).length===0);
    expect(unaffected.length).toBeGreaterThanOrEqual(10);
    expect(unaffected.every(row=>row.risk_level==="Low")).toBe(true);
  });
  it("all displayed screening signals are reproduced from underlying return values",()=>{
    for(const row of ALL_TAXPAYER_ROWS) {
      const actual=evaluateAuditReturn(row.audit_input as ReturnInputs,
        String(row.coverage_tier),String(row.data_quality));
      expect(codes(row.signals).sort(),String(row.id)).toEqual(actual.hits.map(h=>h.id).sort());
      expect(row.risk_level,String(row.id)).toBe(actual.riskLevel);
    }
  });
  it("C1 evaluates funds-flow difference; incomplete data cannot be scored Low",()=>{
    const row=ALL_TAXPAYER_ROWS.find(row=>codes(row.signals).includes("R-C1"))!;
    const x=row.audit_input as ReturnInputs;
    expect(Math.abs((x.outflow??0)-(x.funds??0))).toBeGreaterThan(200000);
    expect(row.mismatch_amount).toBe(Math.abs((x.outflow??0)-(x.funds??0)));
    const unknown=ALL_TAXPAYER_ROWS.find(row=>row.data_quality!=="Complete")!;
    expect(unknown.risk_level).toBe("Not determined");
    expect(codes(unknown.signals)).toEqual([]);
  });
});
