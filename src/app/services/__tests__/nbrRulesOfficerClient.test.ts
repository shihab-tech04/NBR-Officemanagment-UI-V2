import { describe, expect, it, vi } from "vitest";
import { readAuthorizedRules, type RulesOfficerSession } from "../nbrRulesOfficerClient";

const session: RulesOfficerSession = {
  bearer: "test-only-access-token", sessionToken: "test-only-rule-session",
  expiresAt: Date.now() + 600_000, permissions: ["tax_rule.view"],
};
const sample = {
  year: { assessmentYear: "2026-27", state: "active", executable: true },
  total: 1, page: 1, perPage: 25,
  rules: [{
    rule_id: "R-001",
    legal_source: "Source retained as record",
    _backend: {
      versionId: "version-1", revisionNo: 1, executionStatus: "FAIL_CLOSED",
      yearApplicabilityStatus: "RECORDED", groupId: "individual-return",
    },
  }],
};
function mock(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("protected NBR Rules officer read-back", () => {
  it("queries canonical Rules SQL with both credentials, never the Office SQL project", async () => {
    const fetcher = mock(sample);
    const data = await readAuthorizedRules(session, "2026-27", 1, fetcher as unknown as typeof fetch);
    expect(data.rules[0]._backend.versionId).toBe("version-1");
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("gtorruuhvohafapctxym.supabase.co/functions/v1/nbr-rules-office-gateway/rules?");
    expect(url).toContain("year=2026-27");
    expect(options.method).toBe("GET");
    expect(options.cache).toBe("no-store");
    expect(options.credentials).toBe("omit");
    expect(options.headers).toMatchObject({
      authorization: "Bearer test-only-access-token",
      "x-nbr-rule-session": "test-only-rule-session",
    });
  });
  it("refuses expired, non-officer, and malformed year requests before fetch", async () => {
    const fetcher = mock(sample);
    await expect(readAuthorizedRules({...session,expiresAt:Date.now()-1},"2026-27",1,fetcher as unknown as typeof fetch))
      .rejects.toThrow("NBR_RULES_SESSION_EXPIRED");
    await expect(readAuthorizedRules({...session,permissions:[]},"2026-27",1,fetcher as unknown as typeof fetch))
      .rejects.toThrow("NBR_RULES_SESSION_EXPIRED");
    await expect(readAuthorizedRules(session,"2026-2027",1,fetcher as unknown as typeof fetch))
      .rejects.toThrow("NBR_RULES_INVALID_READ_REQUEST");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails closed on missing authorization, stale year, duplicate rules and absent version IDs", async () => {
    await expect(readAuthorizedRules(session,"2026-27",1,mock({},401) as unknown as typeof fetch))
      .rejects.toThrow("NBR_RULES_SESSION_EXPIRED");
    await expect(readAuthorizedRules(session,"2026-27",1,mock({
      ...sample, year:{...sample.year,assessmentYear:"2027-28"},
    }) as unknown as typeof fetch)).rejects.toThrow("NBR_RULES_READBACK_CONTRACT_MISMATCH");
    await expect(readAuthorizedRules(session,"2026-27",1,mock({
      ...sample, rules:[sample.rules[0],sample.rules[0]],
    }) as unknown as typeof fetch)).rejects.toThrow("NBR_RULES_READBACK_CONTRACT_MISMATCH");
    await expect(readAuthorizedRules(session,"2026-27",1,mock({
      ...sample, rules:[{...sample.rules[0],_backend:{...sample.rules[0]._backend,versionId:""}}],
    }) as unknown as typeof fetch)).rejects.toThrow("NBR_RULES_READBACK_CONTRACT_MISMATCH");
  });
});
