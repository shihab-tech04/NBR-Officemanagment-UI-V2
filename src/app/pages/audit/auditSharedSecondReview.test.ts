import { beforeEach, describe, expect, it, vi } from "vitest";
import { decideSharedSecondReview, validateSecondReviewInput } from "./auditSharedSecondReview";

const sharedMocks = vi.hoisted(() => ({
  access: vi.fn(),
  client: vi.fn(),
}));
vi.mock("./auditSharedSql", () => ({
  checkAuditSqlAccess: sharedMocks.access,
  getAuditSqlClient: sharedMocks.client,
  isSharedAuditMode: () => true,
  listSharedAuditCandidates: vi.fn(),
}));

describe("Independent Range Officer second-review contract", () => {
  it("accepts a specific reason for signed-off verified evidence", () => {
    expect(validateSecondReviewInput(3,"sign_off",
      "Signal R-C1 verified against source-of-funds reference 2026/104, finding reconciled."))
      .toEqual({
        action:"sign_off",
        reason:"Signal R-C1 verified against source-of-funds reference 2026/104, finding reconciled.",
      });
  });
  it("supports a specific rework request without changing risk level", () => {
    expect(validateSecondReviewInput(2,"request_rework",
      "Please obtain the source registry document for signal R-E2 before closing the case.").action)
      .toBe("request_rework");
  });
  it("rejects an invalid action, missing SQL version and generic approval note", () => {
    expect(() => validateSecondReviewInput(0,"sign_off",
      "The evidence verification is complete and accepted.")).toThrow();
    expect(() => validateSecondReviewInput(1,"approve",
      "The evidence verification is complete and accepted.")).toThrow();
    expect(() => validateSecondReviewInput(1,"sign_off","reviewed and approved")).toThrow();
    expect(() => validateSecondReviewInput(1,"sign_off","short")).toThrow();
    expect(() => validateSecondReviewInput(1,"request_rework","x".repeat(2001))).toThrow();
  });
});

describe("Range Officer SQL write and persisted read-back", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sharedMocks.access.mockResolvedValue({ role: "range_user" });
  });

  function sqlClient(overrides: {
    rpcError?: string;
    readVersion?: number;
    readStatus?: string;
    eventAction?: string;
  } = {}) {
    const version = overrides.readVersion ?? 4;
    const status = overrides.readStatus ?? "Closed";
    const db = {
      rpc: vi.fn().mockResolvedValue(overrides.rpcError
        ? { data: null, error: { message: overrides.rpcError } }
        : { data: [{ candidate_id: "case-1", version: 4, audit_status: "Closed" }], error: null }),
      from: vi.fn((table: string) => ({
        select: () => ({
          eq: () => table === "office_audit_candidates"
            ? { single: async () => ({ data: { version, audit_status: status }, error: null }) }
            : { order: () => ({ limit: async () => ({
                data: [{ action: overrides.eventAction ?? "sign_off",
                  review_note: "Verified evidence R-C1 reconciles with the submitted finding.",
                  next_version: 4 }],
                error: null,
              }) }) },
        }),
      })),
    };
    sharedMocks.client.mockReturnValue(db);
    return db;
  }

  const note = "Verified evidence R-C1 reconciles with the submitted finding.";

  it("requires committed RPC state and independent read-back before success", async () => {
    const db = sqlClient();
    await expect(decideSharedSecondReview("case-1", 3, "sign_off", note)).resolves.toBeUndefined();
    expect(db.rpc).toHaveBeenCalledWith("office_audit_second_review", {
      p_candidate_id: "case-1", p_expected_version: 3,
      p_action: "sign_off", p_note: note,
    });
    expect(db.from).toHaveBeenCalledTimes(2);
  });

  it("denies non-Range reviewer without submitting any SQL write", async () => {
    const db = sqlClient();
    sharedMocks.access.mockResolvedValue({ role: "circle_user" });
    await expect(decideSharedSecondReview("case-1", 3, "sign_off", note))
      .rejects.toThrow("Independent Range Officer");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("surfaces rejected SQL writes without claiming successful persistence", async () => {
    const db = sqlClient({ rpcError: "Audit case version conflict" });
    await expect(decideSharedSecondReview("case-1", 3, "sign_off", note))
      .rejects.toThrow("Audit case version conflict");
    expect(db.from).not.toHaveBeenCalled();
  });

  it("fails closed when refreshed SQL version differs from the RPC return", async () => {
    sqlClient({ readVersion: 3 });
    await expect(decideSharedSecondReview("case-1", 3, "sign_off", note))
      .rejects.toThrow("could not be confirmed after refresh");
  });

  it("fails closed on a mismatched immutable review event", async () => {
    sqlClient({ eventAction: "request_rework" });
    await expect(decideSharedSecondReview("case-1", 3, "sign_off", note))
      .rejects.toThrow("could not be confirmed after refresh");
  });
});
