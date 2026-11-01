import { describe, expect, it, vi } from "vitest";
import {
  NBR_RUNTIME_STATUS_URL, readNbrRulesRuntimeStatus, classifyNbrRuntimeIdentity,
} from "../nbrRulesRuntimeStatus";

const valid = {
  ok: true, engineVersion: "NBR-TAX-ENGINE-1.5.0",
  activeYear: "2026-27", incomeYear: "2025-26",
  ruleCount: 366, runtimeBindingCount: 366,
  missingRuntimeBindingCount: 0, unhandledRuleCount: 0,
  allRuleNodesMapped: true, sourceRegistryVersion: "FINAL_2026_09_30",
  syncFingerprint: "a".repeat(64),
};
const mock = (data: unknown, code = 200) => vi.fn(async () =>
  new Response(JSON.stringify(data), { status: code }));

describe("Office-Citizen shared Rules SQL fingerprint", () => {
  it("uses the exact canonical NBR SQL runtime endpoint without credentials or cached snapshots", async () => {
    const fetcher = mock(valid);
    const record = await readNbrRulesRuntimeStatus(fetcher as typeof fetch);
    expect(NBR_RUNTIME_STATUS_URL).toBe(
      "https://gtorruuhvohafapctxym.supabase.co/functions/v1/nbr-tax-engine/status");
    expect(record.syncFingerprint).toBe("a".repeat(64));
    expect(classifyNbrRuntimeIdentity(record, "2026-27", "2025-26")).toBe("matched");
    const [,options] = fetcher.mock.calls[0] as unknown as [string,RequestInit];
    expect(options.method).toBe("GET");
    expect(options.cache).toBe("no-store");
    expect(options.headers).toEqual({accept:"application/json"});
  });
  it("rejects missing/invalid version identities, binding counts and fingerprints", async () => {
    const mismatches = [
      {...valid,syncFingerprint:"bad"}, {...valid,ruleCount:"366"},
      {...valid,missingRuntimeBindingCount:null},
      {...valid,incomeYear:"2023-24"}, {...valid,ok:false}
    ];
    for (const payload of mismatches) {
      await expect(readNbrRulesRuntimeStatus(mock(payload) as typeof fetch)).rejects.toThrow("NBR_RUNTIME_CONTRACT_MISMATCH");
    }
    await expect(readNbrRulesRuntimeStatus(mock({},503) as typeof fetch)).rejects.toThrow("NBR_RUNTIME_UNAVAILABLE");
  });
  it("detects drift instead of accepting a non-certified runtime as approved tax calculation", async () => {
    const record = await readNbrRulesRuntimeStatus(mock(valid) as typeof fetch);
    expect(classifyNbrRuntimeIdentity(record,"2027-28","2026-27")).toBe("mismatch");
    expect(classifyNbrRuntimeIdentity({...record,ruleCount:365},"2026-27","2025-26")).toBe("mismatch");
    expect(classifyNbrRuntimeIdentity({...record,missingRuntimeBindingCount:1},"2026-27","2025-26")).toBe("mismatch");
  });
});
