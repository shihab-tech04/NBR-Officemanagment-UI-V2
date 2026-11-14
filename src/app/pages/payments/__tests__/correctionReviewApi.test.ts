import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuditSqlClient, isSharedAuditMode } from "../../audit/auditSharedSql";
import { listOfficeCorrectionInquiries, submitOfficeCorrectionDecision } from "../correctionReviewApi";

vi.mock("../../audit/auditSharedSql", () => ({
  getAuditSqlClient: vi.fn(),
  isSharedAuditMode: vi.fn(),
}));

const user = { id: "office-officer-1", is_anonymous: false };
const correction = {
  requestId: "80000000-0000-4000-8000-000000000001",
  sourceEventId: "80000000-0000-4000-8000-000000000011",
  sourceEventType: "CORRECTION_SUBMITTED",
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
type RpcResult = { data?: unknown; error?: { message: string } | null };

function setupClient(rpcResults: RpcResult[] = [{
  data: { role: "MAKER", items: [correction], nextCursor: null }, error: null,
}]) {
  let call = 0;
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    rpc: vi.fn().mockImplementation(async () => {
      const result = rpcResults[Math.min(call, rpcResults.length - 1)];
      call++;
      return result;
    }),
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

  it("requires the existing verified Office session and returns the server role and complete queue", async () => {
    const client = setupClient();
    await expect(listOfficeCorrectionInquiries()).resolves.toMatchObject({
      enabled: true, role: "MAKER", items: [{ requestId: correction.requestId, decisionHistory: [] }],
    });
    expect(client.auth.getUser).toHaveBeenCalledOnce();
    expect(client.rpc).toHaveBeenCalledWith("payment_v1_correction_queue_page", {
      p_limit: 200, p_after_received_at: null, p_after_request_id: null,
    });
  });

  it("follows every correction page using the exact timestamp and UUID cursor", async () => {
    const nextCursor = { receivedAt: "2026-10-29T17:00:00.000Z", requestId: correction.requestId };
    const older = { ...correction, requestId: "80000000-0000-4000-8000-000000000002" };
    const client = setupClient([
      { data: { role: "MAKER", items: [correction], nextCursor }, error: null },
      { data: { role: "MAKER", items: [older], nextCursor: null }, error: null },
    ]);
    await expect(listOfficeCorrectionInquiries()).resolves.toMatchObject({
      enabled: true, role: "MAKER",
      items: [{ requestId: correction.requestId }, { requestId: older.requestId }],
    });
    expect(client.rpc).toHaveBeenCalledTimes(2);
    expect(client.rpc).toHaveBeenNthCalledWith(2, "payment_v1_correction_queue_page", {
      p_limit: 200, p_after_received_at: nextCursor.receivedAt,
      p_after_request_id: nextCursor.requestId,
    });
  });

  it("fails closed when a cursor repeats instead of returning a partial history", async () => {
    const nextCursor = { receivedAt: "2026-10-29T17:00:00.000Z", requestId: correction.requestId };
    setupClient([
      { data: { role: "MAKER", items: [correction], nextCursor }, error: null },
      { data: { role: "MAKER", items: [], nextCursor }, error: null },
    ]);
    await expect(listOfficeCorrectionInquiries()).rejects.toThrow(
      "Correction history page did not advance; retry",
    );
  });

  it("preserves only validated, TaxPay-acknowledged decision history", async () => {
    const decisionHistory = [
      { messageId: "90000000-0000-4000-8000-000000000011",
        action: "MAKER_ACKNOWLEDGE", role: "MAKER",
        officerUid: "80000000-0000-4000-8000-000000000011",
        reason: "Synthetic accepted maker event",
        occurredAt: "2026-10-29T17:05:00.000Z", deliveryState: "ACKNOWLEDGED" },
      { messageId: "90000000-0000-4000-8000-000000000012",
        action: "REVIEWER_VERIFY", role: "REVIEWER",
        officerUid: "80000000-0000-4000-8000-000000000012",
        reason: "Synthetic accepted reviewer event",
        occurredAt: "2026-10-29T17:06:00.000Z", deliveryState: "ACKNOWLEDGED" },
    ];
    setupClient([{ data: { role: "MAKER", items: [{ ...correction, decisionHistory }], nextCursor: null }, error: null }]);
    await expect(listOfficeCorrectionInquiries()).resolves.toMatchObject({ items: [{ decisionHistory }] });
  });

  it("rejects fabricated officer identity or malformed audit reasoning", async () => {
    for (const changed of [
      { officerUid: "not-an-officer-uuid", reason: "Valid recorded reason" },
      { officerUid: "80000000-0000-4000-8000-000000000011", reason: 42 },
    ]) {
      setupClient([{ data: { role: "MAKER", items: [{
        ...correction,
        decisionHistory: [{
          messageId: "90000000-0000-4000-8000-000000000011",
          action: "MAKER_ACKNOWLEDGE", role: "MAKER",
          occurredAt: "2026-10-29T17:05:00.000Z", deliveryState: "ACKNOWLEDGED",
          ...changed,
        }],
      }], nextCursor: null }, error: null }]);
      await expect(listOfficeCorrectionInquiries()).rejects.toThrow(
        "Invalid correction decision audit provenance",
      );
    }
  });

  it("preserves the older authorized SQL history without new audit fields", async () => {
    const history = [{
      messageId: "90000000-0000-4000-8000-000000000011",
      action: "MAKER_ACKNOWLEDGE", role: "MAKER",
      occurredAt: "2026-10-29T17:05:00.000Z", deliveryState: "ACKNOWLEDGED",
    }];
    setupClient([{ data: { role: "MAKER", items: [{
      ...correction, decisionHistory: history,
    }], nextCursor: null }, error: null }]);
    await expect(listOfficeCorrectionInquiries()).resolves.toMatchObject({
      items: [{decisionHistory: [{officerUid: null, reason: null}]}],
    });
  });

  it("rejects unacknowledged or malformed correction decision history", async () => {
    setupClient([{ data: { role: "MAKER", items: [{
      ...correction,
      decisionHistory: [{
        messageId: "90000000-0000-4000-8000-000000000013",
        action: "APPROVER_CLOSE", role: "APPROVER",
        occurredAt: "2026-10-29T17:07:00.000Z", deliveryState: "PENDING",
      }],
    }], nextCursor: null }, error: null }]);
    await expect(listOfficeCorrectionInquiries()).rejects.toThrow(
      "Invalid or unacknowledged correction decision event",
    );
  });

  it("does not call queue RPC when the current Office session is absent", async () => {
    const client = setupClient();
    client.auth.getUser.mockResolvedValue({ data: { user: null }, error: null } as never);
    await expect(listOfficeCorrectionInquiries()).rejects.toThrow("Verified Office officer sign-in is required");
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("submits the Office decision to the existing authenticated SQL RPC", async () => {
    const client = setupClient([{
      data: { messageId: "90000000-0000-4000-8000-000000000001", queued: true, replayed: false },
      error: null,
    }]);
    const result = await submitOfficeCorrectionDecision(
      correction.requestId, "MAKER_ACKNOWLEDGE",
      "The submitted reference is ready for reviewer verification.",
      "90000000-0000-4000-8000-000000000002",
    );
    expect(result).toEqual({
      messageId: "90000000-0000-4000-8000-000000000001", queued: true, replayed: false,
    });
    expect(client.rpc).toHaveBeenCalledWith("payment_v1_correction_officer_action", {
      p_request_id: correction.requestId, p_action: "MAKER_ACKNOWLEDGE",
      p_reason: "The submitted reference is ready for reviewer verification.",
      p_idempotency_key: "90000000-0000-4000-8000-000000000002",
    });
  });

  it("surfaces SQL errors without substituting local correction rows", async () => {
    setupClient([{ data: null, error: { message: "Active payment officer role required" } }]);
    await expect(listOfficeCorrectionInquiries()).rejects.toThrow("Active payment officer role required");
  });
});
