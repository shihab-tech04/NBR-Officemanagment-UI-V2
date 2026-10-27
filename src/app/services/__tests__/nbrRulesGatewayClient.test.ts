import { describe, expect, it, vi } from "vitest";
import * as gateway from "../nbrRulesGatewayClient";

describe("public-only Office Rules gateway", () => {
  it("loads public year identities without an administrator session", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      years: [{assessmentYear:"2026-27",incomeYear:"2025-26",state:"active",executable:true}],
    }),{status:200}));
    const years = await gateway.readPublicRuleYears(fetcher as unknown as typeof fetch);
    expect(years).toHaveLength(1);
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(gateway.NBR_RULES_GATEWAY_BASE).toContain("gtorruuhvohafapctxym.supabase.co");
  });
  it("rejects failure and malformed public year data",async()=>{
    await expect(gateway.readPublicRuleYears((async()=>new Response("down",{status:503})) as typeof fetch))
      .rejects.toThrow("NBR_RULES_SQL_UNAVAILABLE");
    await expect(gateway.readPublicRuleYears((async()=>new Response(JSON.stringify({
      years:[{assessmentYear:"2026-27",state:"active"}],
    }),{status:200})) as typeof fetch)).rejects.toThrow("NBR_RULES_SQL_CONTRACT_MISMATCH");
  });
  it("does not expose Office-side session issuance or administrative identity clients",()=>{
    expect("openRuleAdminSession" in gateway).toBe(false);
    expect("nbrRulesAuth" in gateway).toBe(false);
  });
});
