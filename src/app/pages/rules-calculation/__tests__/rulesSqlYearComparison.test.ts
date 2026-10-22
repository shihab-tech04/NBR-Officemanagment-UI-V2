import { describe, expect, it } from "vitest";
import { compareObservedSqlYears } from "../RulesAuthenticatedYearComparison";
import type { SqlRuleRecord } from "../../../services/nbrRulesAdminReadClient";

function sample(id:string, status="FACT_GATED", execution="FACT_GATED"):SqlRuleRecord {
  return {rule_id:id,legal_source:["Synthetic fixture—not law"],logic:"Synthetic rule, not executable",
    _backend:{versionId:"fixture-"+id,revisionNo:1,groupId:"other",yearApplicabilityStatus:status,
      executionStatus:execution}};
}
describe("WS03 authenticated tax-year metadata comparison",()=>{
  it("compares both rule-year identity sets without cloning missing historical rules",()=>{
    const result=compareObservedSqlYears([sample("A")],[sample("B")]);
    expect(result).toHaveLength(2);
    expect(result.find(x=>x.ruleId==="A")?.identityState).toBe("BASE_ONLY");
    expect(result.find(x=>x.ruleId==="B")?.identityState).toBe("TARGET_ONLY");
    expect(result.every(x=>x.recordedDifference==="NO_SECOND_YEAR_RECORD")).toBe(true);
  });
  it("does not call identical stored source metadata a legal change",()=>{
    const result=compareObservedSqlYears([sample("A")],[sample("A")]);
    expect(result[0].recordedDifference).toBe("NONE");
  });
  it("flags inherited pending-review status as recorded metadata difference, not law",()=>{
    const result=compareObservedSqlYears([sample("A","CERTIFIED_CURRENT","EXECUTABLE_CURRENT")],
      [sample("A","INHERITED_PENDING_REVIEW","INHERITED_PENDING_REVIEW")]);
    expect(result[0].recordedDifference).toBe("RECORDED_METADATA_DIFFERENCE");
    expect(result[0].identityState).toBe("BOTH");
  });
  it("detects changed nested source evidence even if keys arrive in another order",()=>{
    const base=sample("A"), same=sample("A");
    base.audit_metadata={a:1,b:{x:true,y:2}};
    same.audit_metadata={b:{y:2,x:true},a:1};
    expect(compareObservedSqlYears([base],[same])[0].recordedDifference).toBe("NONE");
    same.audit_metadata={a:1,b:{x:true,y:3}};
    expect(compareObservedSqlYears([base],[same])[0].recordedDifference).toBe("RECORDED_METADATA_DIFFERENCE");
  });
});
