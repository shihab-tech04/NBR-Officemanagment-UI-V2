import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "./client";

describe("Office prototype transport never forwards old login credentials", () => {
  afterEach(() => {
    localStorage.removeItem("auth_token");
    vi.unstubAllGlobals();
  });

  it("ignores stale legacy bearer tokens from localStorage", async () => {
    localStorage.setItem("auth_token", "a-stale-officer-token");
    const request = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    const result = await apiRequest<{ ok: boolean }>("/health");
    expect(result.ok).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    const init = request.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(headers.authorization).toBeUndefined();
    expect(headers.Accept).toBe("application/json");
  });

  it("reports downstream errors rather than falling back to a fake authenticated response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "Unavailable" }), { status: 503 })));
    await expect(apiRequest("/private")).rejects.toThrow("Unavailable");
  });
});
