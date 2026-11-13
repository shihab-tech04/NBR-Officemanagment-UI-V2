import { getAuditSqlClient, isSharedAuditMode } from "../audit/auditSharedSql";

export type CorrectionReviewAction =
  | "MAKER_ACKNOWLEDGE"
  | "REVIEWER_VERIFY"
  | "APPROVER_CLOSE"
  | "REJECT";

export type OfficeCorrectionDecisionEvent = {
  messageId: string;
  action: CorrectionReviewAction;
  role: "MAKER" | "REVIEWER" | "APPROVER";
  occurredAt: string;
  deliveryState: "ACKNOWLEDGED";
};

export type OfficeCorrectionInquiry = {
  requestId: string;
  sourceEventId: string;
  sourceEventType: "CORRECTION_SUBMITTED";
  sourcePaymentId: string | null;
  sourcePaymentKind: "TAXPAY_STORY_PAYMENT" | null;
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
  decisionHistory: OfficeCorrectionDecisionEvent[];
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

type CorrectionQueueCursor = { receivedAt: string; requestId: string };
type CorrectionQueuePage = {
  role: NonNullable<OfficeCorrectionQueue["role"]>;
  items: OfficeCorrectionInquiry[];
  nextCursor: CorrectionQueueCursor | null;
};

function asCorrectionQueuePage(value: unknown): CorrectionQueuePage {
  if (!value || typeof value !== "object") throw new Error("Invalid correction review response");
  const response = value as Record<string, unknown>;
  if (!Array.isArray(response.items) ||
      !["MAKER", "REVIEWER", "APPROVER"].includes(String(response.role)) ||
      !Object.prototype.hasOwnProperty.call(response, "nextCursor")) {
    throw new Error("Invalid correction review queue page");
  }
  let nextCursor: CorrectionQueueCursor | null = null;
  if (response.nextCursor !== null) {
    if (!response.nextCursor || typeof response.nextCursor !== "object" || Array.isArray(response.nextCursor)) {
      throw new Error("Invalid correction queue cursor");
    }
    const cursor = response.nextCursor as Record<string, unknown>;
    if (typeof cursor.receivedAt !== "string" || !Number.isFinite(Date.parse(cursor.receivedAt)) ||
        typeof cursor.requestId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.requestId)) {
      throw new Error("Invalid correction queue cursor");
    }
    nextCursor = { receivedAt: cursor.receivedAt, requestId: cursor.requestId };
  }
  const items = response.items.map((item): OfficeCorrectionInquiry => {
    if (!item || typeof item !== "object") throw new Error("Invalid correction review item");
    const row = item as Record<string, unknown>;
    const stringFields = ["requestId", "sourceEventId", "sourceEventType", "originalReference", "reason",
      "requestedOutcome", "createdAt", "reviewState", "reviewUpdatedAt"];
    if (stringFields.some((key) => typeof row[key] !== "string") ||
        row.evidenceState !== "PENDING_EVIDENCE" ||
        typeof row.reviewRevision !== "number" ||
        typeof row.pendingDelivery !== "boolean" ||
        !Array.isArray(row.availableActions)) {
      throw new Error("Incomplete correction review item");
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(row.sourceEventId)) ||
        row.sourceEventType !== "CORRECTION_SUBMITTED") {
      throw new Error("Invalid correction source event identity");
    }
    const rawParentId = row.sourcePaymentId;
    const rawParentKind = row.sourcePaymentKind;
    const parentIdMissing = rawParentId === undefined || rawParentId === null;
    const parentKindMissing = rawParentKind === undefined || rawParentKind === null;
    if (parentIdMissing !== parentKindMissing ||
        (!parentIdMissing && (typeof rawParentId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawParentId) ||
          rawParentKind !== "TAXPAY_STORY_PAYMENT"))) {
      throw new Error("Invalid correction source payment parent");
    }
    const sourcePaymentId = parentIdMissing ? null : rawParentId as string;
    const sourcePaymentKind = parentKindMissing ? null : "TAXPAY_STORY_PAYMENT" as const;
    const rawHistory = row.decisionHistory;
    if (rawHistory !== undefined && !Array.isArray(rawHistory)) {
      throw new Error("Invalid correction decision history");
    }
    const decisionHistory = (Array.isArray(rawHistory) ? rawHistory : []).map((event) => {
      if (!event || typeof event !== "object") throw new Error("Invalid correction decision event");
      const decision = event as Record<string, unknown>;
      if (typeof decision.messageId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decision.messageId) ||
          typeof decision.action !== "string" || !validActions.has(decision.action as CorrectionReviewAction) ||
          !["MAKER", "REVIEWER", "APPROVER"].includes(String(decision.role)) ||
          typeof decision.occurredAt !== "string" || !Number.isFinite(Date.parse(decision.occurredAt)) ||
          decision.deliveryState !== "ACKNOWLEDGED") {
        throw new Error("Invalid or unacknowledged correction decision event");
      }
      return {
        messageId: decision.messageId,
        action: decision.action as CorrectionReviewAction,
        role: decision.role as OfficeCorrectionDecisionEvent["role"],
        occurredAt: decision.occurredAt,
        deliveryState: "ACKNOWLEDGED" as const,
      };
    });
    const actions = row.availableActions.filter((action): action is CorrectionReviewAction =>
      typeof action === "string" && validActions.has(action as CorrectionReviewAction));
    if (actions.length !== row.availableActions.length) {
      throw new Error("Unsupported correction review action");
    }
    return {
      requestId: row.requestId as string,
      sourceEventId: row.sourceEventId as string,
      sourceEventType: "CORRECTION_SUBMITTED",
      sourcePaymentId,
      sourcePaymentKind,
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
      decisionHistory,
      pendingDelivery: row.pendingDelivery as boolean,
      deliveryState: typeof row.deliveryState === "string" ? row.deliveryState : null,
      lastDeliveryError: typeof row.lastDeliveryError === "string" ? row.lastDeliveryError : null,
      availableActions: actions,
    };
  });
  return { role: response.role as CorrectionQueuePage["role"], items, nextCursor };
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
  const pageSize = 200;
  const maxPages = 2000;
  const seenCursors = new Set<string>();
  const seenCases = new Set<string>();
  const items: OfficeCorrectionInquiry[] = [];
  let cursor: CorrectionQueueCursor | null = null;
  let role: OfficeCorrectionQueue["role"] = null;
  for (let pageNumber = 0; pageNumber < maxPages; pageNumber++) {
    const { data, error } = await db.rpc("payment_v1_correction_queue_page", {
      p_limit: pageSize,
      p_after_received_at: cursor?.receivedAt ?? null,
      p_after_request_id: cursor?.requestId ?? null,
    });
    if (error) throw new Error(`Office correction queue failed: ${error.message}`);
    const page = asCorrectionQueuePage(data);
    if (role !== null && role !== page.role) {
      throw new Error("Office correction role changed during history pagination; retry");
    }
    role = page.role;
    for (const item of page.items) {
      if (seenCases.has(item.requestId)) {
        throw new Error("Duplicate correction case across history pages; retry");
      }
      seenCases.add(item.requestId);
      items.push(item);
    }
    if (page.nextCursor === null) return { enabled: true, role, items };
    const cursorKey = page.nextCursor.receivedAt + "|" + page.nextCursor.requestId;
    if (seenCursors.has(cursorKey) || page.items.length === 0) {
      throw new Error("Correction history page did not advance; retry");
    }
    seenCursors.add(cursorKey);
    cursor = page.nextCursor;
  }
  throw new Error("Correction history exceeds the safe retrieval limit");
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
