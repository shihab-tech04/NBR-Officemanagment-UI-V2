import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuditSqlClient, isSharedAuditMode } from "../../audit/auditSharedSql";
import {
  listOfficeCorrectionInquiries,
  submitOfficeCorrectionDecision,
} from "../correctionReviewApi";

vi.mock("../../audit/auditSharedSql", () => ({
  getAuditSqlClient: vi.fn(),
  isSharedAuditMode: vi.fn(),
}));

const user = { id: "office-officer-1", is_anonymous: false };
const correction = {
  requestId: "80000000-0000-4000-8000-000000000001",
  originalReference: "SYN-REF-003",
  reason: "A synthetic correction request",
  requestedOutcome: "Review the payment attribution",
  evidenceState: "PENDING_EVIDENCE",
  changeKind: "CIRCLE",
  oldValue: "Circle A",
  newValue: "Circle B",
  createdAt: "2026-10-29T17:00:00.000Z",
  reviewState: "PENDING_OFFICER",
  reviewRevision: 1,
  reviewUpdatedAt: "2026-10-29T17:00:00.000Z",
  pendingDelivery: false,
  deliveryState: null,
  lastDeliveryError: null,
  availableActions: ["MAKER_ACKNOWLEDGE"],
};

function setupClient(rpcResult: { data?: unknown; error?: { message: string } | null } = { data: { role: "MAKER", items: [correction] }, error: null }) {
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    rpc: vi.fn().mockResolvedValue({ data: rpcResult.data, error: rpcResult.error ?? null }),
  };
  vi.mocked(getAuditSqlClient).mockReturnValue(client as never);
  vi.mocked(isSharedAuditMode).mockReturnValue(true);
  return client;
}

afterEach(() => vi.clearAllMocks());

describe("Office correction review SQL adapter", () => {
  it("stays disabled outside the existing shared SQL mode and makes no fallback request", async () => {
    vi.mocked(isSharedAuditMode).mockReturnValue(false);
    await expect(listOfficeCorrectionInquiries()).resolves.toEqual({
      enabled: false, role: null, items: [],
    });
    expect(getAuditSqlClient).not.toHaveBeenCalled();
  });

  it("requires the existing verified Office session and returns the server role and queue", async () => {
    const client = setupClient();
    await expect(listOfficeCorrectionInquiries()).resolves.toMatchObject({
      enabled: true, role: "MAKER", items: [{ requestId: correction.requestId }],
    });
    expect(client.auth.getUser).toHaveBeenCalledOnce();
    expect(client.rpc).toHaveBeenCalledWith("payment_v1_correction_queue", { p_limit: 200 });
  });

  it("does not call queue RPC when the current Office session is absent", async () => {
    const client = setupClient();
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null } as never);
    await expect(listOfficeCorrectionInquiries()).rejects.toThrow("Verified Office officer sign-in is required");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("submits the Office decision to the existing authenticated SQL RPC", async () => {
    const client = setupClient({
      data: { messageId: "90000000-0000-4000-8000-000000000001", queued: true, replayed: false },
      error: null,
    });
    const result = await submitOfficeCorrectionDecision(
      correction.requestId,
      "MAKER_ACKNOWLEDGE",
      "The submitted reference is ready for reviewer verification.",
      "90000000-0000-4000-8000-000000000002",
    );
    expect(result).toEqual({
      messageId: "90000000-0000-4000-8000-000000000001", queued: true, replayed: false,
    });
    expect(client.rpc).toHaveBeenCalledWith("payment_v1_correction_officer_action", {
      p_request_id: correction.requestId,
      p_action: "MAKER_ACKNOWLEDGE",
      p_reason: "The submitted reference is ready for reviewer verification.",
      p_idempotency_key: "90000000-0000-4000-8000-000000000002",
    });
  });

  it("surfaces SQL errors without substituting local correction rows", async () => {
    setupClient({ data: null, error: { message: "Active payment officer role required" } });
    await expect(listOfficeCorrectionInquiries()).rejects.toThrow("Active payment officer role required");
  });
});
