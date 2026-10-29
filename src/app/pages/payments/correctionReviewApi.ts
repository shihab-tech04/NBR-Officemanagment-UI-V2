import { getAuditSqlClient, isSharedAuditMode } from "../audit/auditSharedSql";

export type CorrectionReviewAction =
  | "MAKER_ACKNOWLEDGE"
  | "REVIEWER_VERIFY"
  | "APPROVER_CLOSE"
  | "REJECT";

export type OfficeCorrectionInquiry = {
  requestId: string;
  originalReference: string;
  reason: string;
  requestedOutcome: string;
  evidenceState: "PENDING_EVIDENCE";
  changeKind: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  reviewState: string;
  reviewRevision: number;
  reviewUpdatedAt: string;
  pendingDelivery: boolean;
  deliveryState: string | null;
  lastDeliveryError: string | null;
  availableActions: CorrectionReviewAction[];
};

export type OfficeCorrectionQueue = {
  enabled: boolean;
  role: "MAKER" | "REVIEWER" | "APPROVER" | null;
  items: OfficeCorrectionInquiry[];
};

const validActions = new Set<CorrectionReviewAction>([
  "MAKER_ACKNOWLEDGE", "REVIEWER_VERIFY", "APPROVER_CLOSE", "REJECT",
]);

function asCorrectionQueue(value: unknown): OfficeCorrectionQueue {
  if (!value || typeof value !== "object") throw new Error("Invalid correction review response");
  const response = value as Record<string, unknown>;
  if (!Array.isArray(response.items) ||
      !["MAKER", "REVIEWER", "APPROVER"].includes(String(response.role))) {
    throw new Error("Invalid correction review queue");
  }
  const items = response.items.map((item): OfficeCorrectionInquiry => {
    if (!item || typeof item !== "object") throw new Error("Invalid correction review item");
    const row = item as Record<string, unknown>;
    const stringFields = ["requestId", "originalReference", "reason", "requestedOutcome",
      "createdAt", "reviewState", "reviewUpdatedAt"];
    if (stringFields.some((key) => typeof row[key] !== "string") ||
        row.evidenceState !== "PENDING_EVIDENCE" ||
        typeof row.reviewRevision !== "number" ||
        typeof row.pendingDelivery !== "boolean" ||
        !Array.isArray(row.availableActions)) {
      throw new Error("Incomplete correction review item");
    }
    const actions = row.availableActions.filter((action): action is CorrectionReviewAction =>
      typeof action === "string" && validActions.has(action as CorrectionReviewAction));
    if (actions.length !== row.availableActions.length) {
      throw new Error("Unsupported correction review action");
    }
    return {
      requestId: row.requestId as string,
      originalReference: row.originalReference as string,
      reason: row.reason as string,
      requestedOutcome: row.requestedOutcome as string,
      evidenceState: "PENDING_EVIDENCE",
      changeKind: typeof row.changeKind === "string" ? row.changeKind : null,
      oldValue: typeof row.oldValue === "string" ? row.oldValue : null,
      newValue: typeof row.newValue === "string" ? row.newValue : null,
      createdAt: row.createdAt as string,
      reviewState: row.reviewState as string,
      reviewRevision: row.reviewRevision as number,
      reviewUpdatedAt: row.reviewUpdatedAt as string,
      pendingDelivery: row.pendingDelivery as boolean,
      deliveryState: typeof row.deliveryState === "string" ? row.deliveryState : null,
      lastDeliveryError: typeof row.lastDeliveryError === "string" ? row.lastDeliveryError : null,
      availableActions: actions,
    };
  });
  return { enabled: true, role: response.role as OfficeCorrectionQueue["role"], items };
}

async function authenticatedClient() {
  const db = getAuditSqlClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user || data.user.is_anonymous) {
    throw new Error("Verified Office officer sign-in is required");
  }
  return db;
}

export async function listOfficeCorrectionInquiries(): Promise<OfficeCorrectionQueue> {
  if (!isSharedAuditMode()) return { enabled: false, role: null, items: [] };
  const db = await authenticatedClient();
  const { data, error } = await db.rpc("payment_v1_correction_queue", { p_limit: 200 });
  if (error) throw new Error(`Office correction queue failed: ${error.message}`);
  return asCorrectionQueue(data);
}

export async function submitOfficeCorrectionDecision(
  requestId: string,
  action: CorrectionReviewAction,
  reason: string,
  idempotencyKey: string,
): Promise<{ messageId: string; queued: boolean; replayed: boolean }> {
  if (!isSharedAuditMode()) throw new Error("Shared Office correction review is not enabled");
  const db = await authenticatedClient();
  const { data, error } = await db.rpc("payment_v1_correction_officer_action", {
    p_request_id: requestId,
    p_action: action,
    p_reason: reason,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throw new Error(`Office correction decision failed: ${error.message}`);
  if (!data || typeof data !== "object" || typeof data.messageId !== "string" || data.queued !== true) {
    throw new Error("Office did not confirm the correction decision");
  }
  return {
    messageId: data.messageId,
    queued: true,
    replayed: data.replayed === true,
  };
}
