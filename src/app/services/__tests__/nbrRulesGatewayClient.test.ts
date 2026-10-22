import { describe, expect, it, vi } from "vitest";
import {
  NBR_RULES_GATEWAY_BASE,
  readPublicRuleYears,
  openRuleAdminSession,
} from "../nbrRulesGatewayClient";

describe("NBR replacement Rules SQL gateway", () => {
  it("loads the live public year catalogue with no administrative credentials", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      years: [{ assessmentYear: "2026-27", incomeYear: "2025-26", state: "active", executable: true }],
    }), { status: 200 }));
    const years = await readPublicRuleYears(fetcher as unknown as typeof fetch);
    expect(years).toHaveLength(1);
    expect(fetcher.mock.calls[0]).toBeDefined();
    expect(NBR_RULES_GATEWAY_BASE).toContain("gtorruuhvohafapctxym.supabase.co");
  });

  it("rejects failed or malformed SQL years responses", async () => {
    await expect(readPublicRuleYears((async () => new Response("down", {status: 503})) as typeof fetch))
      .rejects.toThrow("NBR_RULES_SQL_UNAVAILABLE");
    await expect(readPublicRuleYears((async () => new Response(JSON.stringify({
      years: [{assessmentYear:"2026-27",state:"active"}],
    }), {status:200})) as typeof fetch)).rejects.toThrow("NBR_RULES_SQL_CONTRACT_MISMATCH");
  });

  it("never opens an administrator session without a verified bearer identity", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({error:"Unauthorized"}), {status:401}));
    await expect(openRuleAdminSession("", request as unknown as typeof fetch)).rejects.toThrow(/identity/);
    expect(request).not.toHaveBeenCalled();
    await expect(openRuleAdminSession("signed-token-placeholder-12345678", request as unknown as typeof fetch))
      .rejects.toThrow(/401/);
  });

  it("only accepts a session token returned by the protected gateway", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      token: "a-verified-rule-session-token-1234567890",
    }), {status:200}));
    const session = await openRuleAdminSession("signed-token-placeholder-12345678", fetcher as unknown as typeof fetch);
    expect(session).toBe("a-verified-rule-session-token-1234567890");
    expect(fetcher.mock.calls[0]).toBeDefined();
  });
});
