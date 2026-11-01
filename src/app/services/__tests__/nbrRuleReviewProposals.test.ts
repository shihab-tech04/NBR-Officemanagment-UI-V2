import { describe, expect, it, vi } from "vitest";
import {
  submitImmutableRuleReviewProposal, validateOfficialLegalSource,
} from "../nbrRuleReviewProposals";
import type { RulesOfficerSession, LiveRuleVersion } from "../nbrRulesOfficerClient";

const source = "https://nbr.gov.bd/regulations/acts/finance-acts/eng";
const reason = "Review this statutory applicability before any future publication.";
const requestId = "12345678-1234-4123-8123-1234567890ab";
const current: LiveRuleVersion = {
  rule_id:"CUR-RET-170-001",
  _backend: { versionId:"version-v1", revisionNo:1,
    groupId:"individual-return", executionStatus:"EXECUTABLE_CURRENT",
    yearApplicabilityStatus:"CERTIFIED_CURRENT" }
};
const session: RulesOfficerSession = {
  bearer:"synthetic-test-only-bearer",sessionToken:"synthetic-test-only-session",
  expiresAt:Date.now()+600000,permissions:["tax_rule.view","tax_rule.propose_change"],
};
const before = {
  year:{assessment_year:"2026-27",is_immutable:true},
  version:{id:"version-v1",rule_key:current.rule_id,group_id:current._backend.groupId},
  changes:[],audit:[],
};
const changeReason = "Independent legal review requested: " + reason + " | Official source: " + source;
const after = {...before,
  changes:[{id:requestId,status:"DRAFT",base_version_id:"version-v1",change_reason:changeReason}],
  audit:[{action:"CREATE_RULE_CHANGE_PROPOSAL",entity_key:current.rule_id,metadata:{request_id:requestId}}],
};

describe("immutable NBR SQL protected legal review request",()=>{
  it("creates only a non-effective DRAFT request, verifies SQL version and audit",async()=>{
    let call = 0;
    const fetcher=vi.fn(async(_url:string,_options:RequestInit)=>{
      const response=call++===0?before:call===2?
        {ok:true,citizenEffective:false,result:{mode:"proposal",request_id:requestId}}:after;
      return new Response(JSON.stringify(response),{status:200});
    });
    const result=await submitImmutableRuleReviewProposal(session,current,source,reason,
      fetcher as typeof fetch);
    expect(result).toEqual({
      requestId,ruleKey:current.rule_id,assessmentYear:"2026-27",
      baseVersionId:"version-v1",status:"DRAFT",auditReadbackVerified:true,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    const [,writeOptions]=fetcher.mock.calls[1] as unknown as [string,RequestInit];
    expect(writeOptions.method).toBe("PATCH");
    expect(writeOptions.credentials).toBe("omit");
    expect(writeOptions.headers).toMatchObject({
      authorization:"Bearer synthetic-test-only-bearer",
      "x-nbr-rule-session":"synthetic-test-only-session",
    });
    const body=JSON.parse(String(writeOptions.body));
    expect(body.publish).toBe(false);
    expect(body.year).toBe("2026-27");
    expect(body.executionStatus).toBe("FAIL_CLOSED");
    expect(body.patch).toEqual({legal_review_reference:source});
    expect(body.changeReason).toContain(reason);
  });
  it("rejects nonofficial links, tokens and weak evidence before any network write",async()=>{
    for(const url of ["http://nbr.gov.bd/acts","https://evil.com/act",
      "https://nbr.gov.bd/","https://nbr.gov.bd/act?token=secret",
      "https://nbr.gov.bd/act#fragment","not a url"]){
      expect(()=>validateOfficialLegalSource(url)).toThrow("NBR_RULES_OFFICIAL_SOURCE_REQUIRED");
    }
    const fetcher=vi.fn();
    await expect(submitImmutableRuleReviewProposal({...session,permissions:["tax_rule.view"]},current,source,reason,
      fetcher as typeof fetch)).rejects.toThrow("NBR_RULES_PROPOSAL_PERMISSION_REQUIRED");
    await expect(submitImmutableRuleReviewProposal(session,current,source,"too short",
      fetcher as typeof fetch)).rejects.toThrow("NBR_RULES_REVIEW_REASON_REQUIRED");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refuses a changed base version and never sends PATCH",async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({
      ...before,version:{...before.version,id:"other-version"}
    }),{status:200}));
    await expect(submitImmutableRuleReviewProposal(session,current,source,reason,
      fetcher as typeof fetch)).rejects.toThrow("NBR_RULES_PROPOSAL_BASE_VERSION_CONFLICT");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects repeated requests and uncertain SQL readback, never claiming success",async()=>{
    const duplicates={...before,changes:[{status:"DRAFT",change_reason:changeReason}]};
    const dup=vi.fn(async()=>new Response(JSON.stringify(duplicates),{status:200}));
    await expect(submitImmutableRuleReviewProposal(session,current,source,reason,
      dup as typeof fetch)).rejects.toThrow("NBR_RULES_DUPLICATE_REVIEW_REQUEST");
    expect(dup).toHaveBeenCalledTimes(1);

    let n=0;
    const ambiguous=vi.fn(async()=>{
      const x=n++===0?before:n===2?
        {ok:true,citizenEffective:false,result:{mode:"proposal",request_id:requestId}}:before;
      return new Response(JSON.stringify(x),{status:200});
    });
    await expect(submitImmutableRuleReviewProposal(session,current,source,reason,
      ambiguous as typeof fetch)).rejects.toThrow("NBR_RULES_PROPOSAL_OUTCOME_UNVERIFIED");
    expect(ambiguous).toHaveBeenCalledTimes(3);
  });
});
