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
  /** Present for newer authorized Office SQL audit projections; older rows remain readable. */
  officerUid?: string | null;
  reason?: string | null;
};

export type OfficeCorrectionInquiry = {
  requestId: string;
  sourceEventId: string;
  sourceEventType: "CORRECTION_SUBMITTED";
  sourcePaymentId: string | null;
  sourcePaymentKind: "TAXPAY_STORY_PAYMENT" | null;
  /** Immutable, verified Taxpayer source allocation ID; null on legacy cases. */
  targetAllocationId?: string | null;
  originalReference: string;
  /** Approved case category, including unsolicited-payment allegations. */
  caseKind?: "CORRECTION_REVIEW" | "UNSOLICITED_PAYMENT_REPORT";
  reason: string;
  requestedOutcome: string;
  /** Unverified taxpayer-supplied evidence, preserved from source SQL. */
  evidenceNote?: string | null;
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
    const rawAllocationId = row.targetAllocationId;
    const targetAllocationId = rawAllocationId === undefined || rawAllocationId === null
      ? null : rawAllocationId;
    if (targetAllocationId !== null &&
        (typeof targetAllocationId !== "string" || !targetAllocationId.trim() ||
         targetAllocationId.trim() !== targetAllocationId ||
         targetAllocationId.length > 128 || row.sourcePaymentId === undefined ||
         row.sourcePaymentId === null)) {
      throw new Error("Invalid correction target allocation");
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
    const caseKind = row.caseKind === undefined || row.caseKind === null
      ? "CORRECTION_REVIEW" : row.caseKind;
    if (caseKind !== "CORRECTION_REVIEW" && caseKind !== "UNSOLICITED_PAYMENT_REPORT") {
      throw new Error("Invalid correction case category");
    }
    const evidenceNote = row.evidenceNote;
    if (evidenceNote !== undefined && evidenceNote !== null &&
        (typeof evidenceNote !== 'string' || evidenceNote.length > 2000)) {
      throw new Error('Invalid correction supporting evidence');
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
      const actor = decision.officerUid;
      const reason = decision.reason;
      const validUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if ((actor !== undefined && actor !== null &&
           (typeof actor !== "string" || !validUuid.test(actor))) ||
          (reason !== undefined && reason !== null &&
           (typeof reason !== "string" || !reason.trim() || reason.length > 1000))) {
        throw new Error("Invalid correction decision audit provenance");
      }
      return {
        messageId: decision.messageId,
        action: decision.action as CorrectionReviewAction,
        role: decision.role as OfficeCorrectionDecisionEvent["role"],
        occurredAt: decision.occurredAt,
        deliveryState: "ACKNOWLEDGED" as const,
        officerUid: typeof actor === "string" ? actor : null,
        reason: typeof reason === "string" ? reason : null,
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
      targetAllocationId,
      originalReference: row.originalReference as string,
      caseKind,
      reason: row.reason as string,
      requestedOutcome: row.requestedOutcome as string,
      evidenceNote: typeof evidenceNote === 'string' ? evidenceNote : null,
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


/** P6: office initiation remains evidence-pending until the original source
 * validates the payment and its verified account owner claims the case. */
export type OfficeInitiatedCorrection = Readonly<{
  caseId:string; sourcePaymentId:string; originalReference:string; taxpayerTin:string;
  reason:string; requestedOutcome:string; evidenceNote:string; officerRole:string;
  createdAt:string; deliveryState:string; sourceConfirmed:boolean;
  sourceReviewState:string|null;
}>;

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitOfficeInitiatedCorrection(input:Readonly<{
  paymentId:string;taxpayerTin:string;originalReference:string;
  reason:string;requestedOutcome:string;evidenceNote:string;idempotencyKey:string;
}>):Promise<{caseId:string;queued:true;replayed:boolean}> {
  if(!isSharedAuditMode())throw Error('Office correction SQL is unavailable');
  const db=await authenticatedClient();
  if(!uuidPattern.test(input.paymentId)||!uuidPattern.test(input.idempotencyKey)||
      !/^\d{12,13}$/.test(input.taxpayerTin)||
      !/^[A-Za-z0-9][A-Za-z0-9._/-]{5,79}$/.test(input.originalReference)||
      input.reason.trim().length<10||input.reason.trim().length>1000||
      input.requestedOutcome.trim().length<10||input.requestedOutcome.trim().length>600||
      input.evidenceNote.trim().length<10||input.evidenceNote.length>2000)
    throw Error('Complete a verified payment reference, taxpayer, reason, outcome and evidence.');
  const {data,error}=await db.rpc('payment_v1_office_initiate_correction',{
    p_payment_id:input.paymentId,p_taxpayer_tin:input.taxpayerTin,
    p_original_reference:input.originalReference,p_reason:input.reason,
    p_requested_outcome:input.requestedOutcome,p_evidence_note:input.evidenceNote,
    p_idempotency_key:input.idempotencyKey,
  });
  if(error)throw Error(`Office correction initiation failed: ${error.message}`);
  if(!data||!uuidPattern.test(String(data.caseId??''))||data.queued!==true)
    throw Error('Office did not confirm durable correction submission');
  return {caseId:data.caseId,queued:true,replayed:data.replayed===true};
}

export async function listOfficeInitiatedCorrections():Promise<OfficeInitiatedCorrection[]> {
  if(!isSharedAuditMode())return [];
  const db=await authenticatedClient();
  const {data,error}=await db.rpc('payment_v1_office_initiated_correction_history',{p_limit:100});
  if(error)throw Error(`Office initiation history failed: ${error.message}`);
  if(!data||!Array.isArray(data.items))throw Error('Invalid Office initiation history');
  return data.items.map((item:Record<string,unknown>)=>{
    if(!item||typeof item!=='object'||!uuidPattern.test(String(item.caseId??''))||
       !uuidPattern.test(String(item.sourcePaymentId??''))||
       typeof item.originalReference!=='string'||!/^\d{12,13}$/.test(String(item.taxpayerTin??''))||
       typeof item.reason!=='string'||typeof item.requestedOutcome!=='string'||
       typeof item.evidenceNote!=='string'||typeof item.createdAt!=='string'||
       typeof item.deliveryState!=='string'||typeof item.sourceConfirmed!=='boolean')
      throw Error('Invalid Office initiated correction history item');
    return {caseId:item.caseId as string,sourcePaymentId:item.sourcePaymentId as string,
      originalReference:item.originalReference, taxpayerTin:item.taxpayerTin,
      reason:item.reason,requestedOutcome:item.requestedOutcome,evidenceNote:item.evidenceNote,
      officerRole:String(item.officerRole??''),createdAt:item.createdAt,
      deliveryState:item.deliveryState,sourceConfirmed:item.sourceConfirmed,
      sourceReviewState:typeof item.sourceReviewState==='string'?item.sourceReviewState:null,
    } as OfficeInitiatedCorrection;
  });
}
