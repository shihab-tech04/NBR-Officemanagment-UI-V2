import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuditSqlClient, isSharedAuditMode } from "../../audit/auditSharedSql";
import { getOfficeCmsAuthClient, isVerifiedOfficeCmsPublisher } from "../../../services/officeCmsBridge";

vi.mock("../../../services/officeCmsBridge", () => ({
  getOfficeCmsAuthClient: vi.fn(),
  isVerifiedOfficeCmsPublisher: vi.fn().mockResolvedValue(false),
}));
import { listOfficeCorrectionInquiries, submitOfficeCorrectionDecision, submitOfficeInitiatedCorrection, listOfficeInitiatedCorrections } from "../correctionReviewApi";

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

afterEach(() => {
  vi.clearAllMocks();
  vi.mocked(isVerifiedOfficeCmsPublisher).mockResolvedValue(false);
});

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

  it("keeps unsolicited-payment allegations distinct without changing Office decisions", async () => {
    setupClient([{ data: { role: "MAKER", items: [{
      ...correction, caseKind: "UNSOLICITED_PAYMENT_REPORT",
    }], nextCursor: null }, error: null }]);
    await expect(listOfficeCorrectionInquiries()).resolves.toMatchObject({
      items: [{ requestId: correction.requestId, caseKind: "UNSOLICITED_PAYMENT_REPORT" }],
    });
    setupClient([{ data: { role: "MAKER", items: [{
      ...correction, caseKind: "FORGED_CASE_KIND",
    }], nextCursor: null }, error: null }]);
    await expect(listOfficeCorrectionInquiries()).rejects.toThrow(
      "Invalid correction case category",
    );
    // The existing case rows remain readable without a newly supplied category.
    setupClient([{ data: { role: "MAKER", items: [correction], nextCursor: null }, error: null }]);
    await expect(listOfficeCorrectionInquiries()).resolves.toMatchObject({
      items: [{ caseKind: "CORRECTION_REVIEW" }],
    });
  });

  it("preserves the verified source allocation and rejects an orphan allocation", async () => {
    const parent = {
      ...correction,
      sourcePaymentId: "80000000-0000-4000-8000-000000000041",
      sourcePaymentKind: "TAXPAY_STORY_PAYMENT",
      targetAllocationId: "ws3-verified-other-recipient",
    };
    setupClient([{ data: { role: "MAKER", items: [parent], nextCursor: null }, error: null }]);
    await expect(listOfficeCorrectionInquiries()).resolves.toMatchObject({
      items: [{ requestId: correction.requestId,
        targetAllocationId: "ws3-verified-other-recipient" }],
    });
    setupClient([{ data: { role: "MAKER", items: [{
      ...correction, targetAllocationId: "ws3-unverified-allocation",
    }], nextCursor: null }, error: null }]);
    await expect(listOfficeCorrectionInquiries()).rejects.toThrow(
      "Invalid correction target allocation",
    );
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

  it("preserves bounded Unicode evidence from Taxpayer SQL without changing officer action", async () => {
    const evidence="বাংলা নথি ও ব্যাখ্যা\\nSupporting details for Office review";
    setupClient([{ data: { role: "MAKER", items: [{
      ...correction, evidenceNote: evidence,
    }], nextCursor: null }, error: null }]);
    await expect(listOfficeCorrectionInquiries()).resolves.toMatchObject({
      items: [{ evidenceNote: evidence, availableActions: ["MAKER_ACKNOWLEDGE"] }],
    });
    setupClient([{ data: { role: "MAKER", items: [{
      ...correction, evidenceNote: "অ".repeat(2001),
    }], nextCursor: null }, error: null }]);
    await expect(listOfficeCorrectionInquiries()).rejects.toThrow(
      "Invalid correction supporting evidence",
    );
    setupClient([{ data: { role: "MAKER", items: [correction], nextCursor: null }, error: null }]);
    await expect(listOfficeCorrectionInquiries()).resolves.toMatchObject({
      items: [{ evidenceNote: null }],
    });
  });

  it("surfaces SQL errors without substituting local correction rows", async () => {
    setupClient([{ data: null, error: { message: "Active payment officer role required" } }]);
    await expect(listOfficeCorrectionInquiries()).rejects.toThrow("Active payment officer role required");
  });
});

describe("P6 Office initiated correction is durable, bounded and identity scoped",()=>{
  const input={
    paymentId:"80000000-0000-4000-8000-000000000041",
    taxpayerTin:"111111111111",originalReference:"SYN-PARENT-0001",
    reason:"The payer selected the wrong assessment year for this original payment",
    requestedOutcome:"Please review the original allocation and its assessment year",
    evidenceNote:"বাংলা বিবরণ: পুরোনো চালান এবং প্রাসঙ্গিক নথির তথ্য।",
    idempotencyKey:"80000000-0000-4000-8000-000000000071",
  };
  it("uses the current authorized Office session, stable idempotency and exact SQL RPC",async()=>{
    const client=setupClient([{
      data:{caseId:"80000000-0000-4000-8000-000000000081",queued:true,replayed:false},
      error:null,
    }]);
    const result=await submitOfficeInitiatedCorrection(input);
    expect(result.queued).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("payment_v1_office_initiate_correction",{
      p_payment_id:input.paymentId,p_taxpayer_tin:input.taxpayerTin,
      p_original_reference:input.originalReference,p_reason:input.reason,
      p_requested_outcome:input.requestedOutcome,p_evidence_note:input.evidenceNote,
      p_idempotency_key:input.idempotencyKey,
    });
  });
  it("rejects forged or oversized input before any writable RPC",async()=>{
    const client=setupClient();
    await expect(submitOfficeInitiatedCorrection({...input,taxpayerTin:"000"})).rejects.toThrow();
    await expect(submitOfficeInitiatedCorrection({...input,evidenceNote:"x".repeat(2001)})).rejects.toThrow();
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("reads pending Office origin status without inventing a taxpayer confirmation",async()=>{
    setupClient([{data:{role:"MAKER",items:[{
      caseId:"80000000-0000-4000-8000-000000000081",
      sourcePaymentId:input.paymentId,originalReference:input.originalReference,
      taxpayerTin:input.taxpayerTin,reason:input.reason,
      requestedOutcome:input.requestedOutcome,evidenceNote:input.evidenceNote,
      officerRole:"MAKER",createdAt:"2026-11-16T04:10:00Z",
      deliveryState:"ACKNOWLEDGED",sourceConfirmed:false,sourceReviewState:null,
    }]},error:null}]);
    await expect(listOfficeInitiatedCorrections()).resolves.toMatchObject([
      {sourceConfirmed:false,deliveryState:"ACKNOWLEDGED"},
    ]);
  });
});


describe("Existing Super Admin correction session — direct decisions", () => {
  const direct = {...correction, reviewState: "PENDING", availableActions: ["APPROVE", "REJECT"]};
  function setupAdmin(results: RpcResult[]) {
    const client = setupClient(results);
    vi.mocked(isSharedAuditMode).mockReturnValue(false);
    vi.mocked(isVerifiedOfficeCmsPublisher).mockResolvedValue(true);
    vi.mocked(getOfficeCmsAuthClient).mockReturnValue(client as never);
    return client;
  }
  it("reuses the existing verified Office session and shows only server-returned direct decisions", async () => {
    const client = setupAdmin([{data: {role: "SUPER_ADMIN", items: [direct], nextCursor: null}, error: null}]);
    await expect(listOfficeCorrectionInquiries()).resolves.toMatchObject({enabled: true, role: "SUPER_ADMIN", items: [{availableActions: ["APPROVE", "REJECT"]}]});
    expect(getAuditSqlClient).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith("payment_v1_correction_queue_page", {p_limit: 200, p_after_received_at: null, p_after_request_id: null});
  });
  it("does not infer Super Admin access from a legacy role returned by SQL", async () => {
    setupAdmin([{data: {role: "REVIEWER", items: [], nextCursor: null}, error: null}]);
    await expect(listOfficeCorrectionInquiries()).rejects.toThrow("has not confirmed Super Admin access");
  });
  it("rejects a legacy stage advertised in the direct queue", async () => {
    setupAdmin([{data: {role: "SUPER_ADMIN", items: [correction], nextCursor: null}, error: null}]);
    await expect(listOfficeCorrectionInquiries()).rejects.toThrow("Unexpected legacy action");
  });
  it("keeps legacy history readable and supports an acknowledged direct decision", async () => {
    const history = [{messageId:"90000000-0000-4000-8000-000000000012",action:"APPROVE",role:"SUPER_ADMIN",occurredAt:"2026-11-26T02:00:00Z",deliveryState:"ACKNOWLEDGED"}];
    setupAdmin([{data: {role:"SUPER_ADMIN",items:[{...direct,reviewState:"APPROVED",availableActions:[],decisionHistory:history}],nextCursor:null},error:null}]);
    await expect(listOfficeCorrectionInquiries()).resolves.toMatchObject({items:[{reviewState:"APPROVED",decisionHistory:history}]});
  });
  it.each(["APPROVE","REJECT"] as const)("submits direct %s to the same server-enforced RPC", async action => {
    const client=setupAdmin([{data:{messageId:"90000000-0000-4000-8000-000000000013",queued:true,replayed:false},error:null}]);
    const key="90000000-0000-4000-8000-000000000014";
    await expect(submitOfficeCorrectionDecision(correction.requestId,action,"Verified correction request",key)).resolves.toMatchObject({queued:true});
    expect(client.rpc).toHaveBeenCalledWith("payment_v1_correction_officer_action",{p_request_id:correction.requestId,p_action:action,p_reason:"Verified correction request",p_idempotency_key:key});
  });
  it("never submits a legacy stage using the existing admin session", async () => {
    const client=setupAdmin([]);
    await expect(submitOfficeCorrectionDecision(correction.requestId,"MAKER_ACKNOWLEDGE","Verified request","90000000-0000-4000-8000-000000000014")).rejects.toThrow("must be Approve or Reject");
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("rejects preview access before a direct decision RPC", async () => {
    const client=setupAdmin([]);
    vi.mocked(isVerifiedOfficeCmsPublisher).mockResolvedValue(false);
    await expect(submitOfficeCorrectionDecision(correction.requestId,"APPROVE","Verified request","90000000-0000-4000-8000-000000000014")).rejects.toThrow("Verified Office Super Admin sign-in is required");
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("uses the verified admin session for an Office-originated correction, leaving final authorization to SQL", async () => {
    const client=setupAdmin([{data:{caseId:"80000000-0000-4000-8000-000000000081",queued:true,replayed:false},error:null}]);
    await expect(submitOfficeInitiatedCorrection({paymentId:"80000000-0000-4000-8000-000000000041",taxpayerTin:"111111111111",originalReference:"SYN-PARENT-0001",reason:"Incorrect assessment year",requestedOutcome:"Correct the assessment year",evidenceNote:"Verified supporting evidence",idempotencyKey:"80000000-0000-4000-8000-000000000071"})).resolves.toMatchObject({queued:true});
    expect(client.rpc).toHaveBeenCalledWith("payment_v1_office_initiate_correction",expect.objectContaining({p_taxpayer_tin:"111111111111"}));
  });
});
