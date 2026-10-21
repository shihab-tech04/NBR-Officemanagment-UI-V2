import { describe, expect, it, vi } from "vitest";
import { createRulesAdminReadClient } from "../nbrRulesAdminReadClient";

const baseUrl = "https://example.supabase.co/functions/v1/nbr-rules-api";
const credentials = { baseUrl, bearerToken: "test-user-token", ruleSessionToken: "test-session-token" };

describe("Rules Admin authenticated SQL read contract", () => {
  it("rejects empty sessions, non-HTTPS endpoints and unrelated services", () => {
    expect(() => createRulesAdminReadClient({ ...credentials, ruleSessionToken: "" })).toThrow(/session/);
    expect(() => createRulesAdminReadClient({ ...credentials, baseUrl: "http://example.com/nbr-rules-api" })).toThrow(/HTTPS/);
    expect(() => createRulesAdminReadClient({ ...credentials, baseUrl: "https://example.com/not-rules" })).toThrow(/nbr-rules-api/);
  });

  it("uses exact authorized SQL years endpoint with no-store transport", async () => {
    const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      years: [{ id: "year-1", assessmentYear: "2026-27", incomeYear: "2025-26", ruleCount: 366 }],
    }), { status: 200 }));
    const api = createRulesAdminReadClient({ ...credentials, fetcher: fetcher as unknown as typeof fetch });
    const years = await api.getYears();
    expect(years[0].ruleCount).toBe(366);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe(baseUrl + "/years");
    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(init.cache).toBe("no-store");
    expect((init.headers as Record<string,string>).authorization).toBe("Bearer test-user-token");
    expect((init.headers as Record<string,string>)["x-nbr-rule-session"]).toBe("test-session-token");
  });

  it("rejects denied, mismatched and malformed SQL rule responses", async () => {
    const denied = vi.fn(async () => new Response(JSON.stringify({ error: "Unauthorized" }), {status:401})) as unknown as typeof fetch;
    await expect(createRulesAdminReadClient({...credentials,fetcher:denied}).getRules("2026-27")).rejects.toThrow(/401/);
    const invalid = vi.fn(async () => new Response(JSON.stringify({
      year: {assessmentYear:"2027-28"},total:1,rules:[{rule_id:"A",_backend:{versionId:"v1",revisionNo:1}}]
    }), {status:200})) as unknown as typeof fetch;
    await expect(createRulesAdminReadClient({...credentials,fetcher:invalid}).getRules("2026-27")).rejects.toThrow(/requested-year/);
    await expect(createRulesAdminReadClient(credentials).getRules("2026-2027")).rejects.toThrow(/Invalid assessment/);
  });
});
