import { getAuditSqlClient, isSharedAuditMode } from "../pages/audit/auditSharedSql";

export type OfficeStoryNoticeReadState = {
  noticeId: number;
  isRead: boolean;
};
export type OfficeStoryNoticeReadSnapshot = {
  officerUid: string;
  notices: OfficeStoryNoticeReadState[];
};

function noticeId(value: unknown): number | null {
  const parsed = typeof value === "number" ? value
    : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Validate the authenticated RPC response against the exact requested notice IDs. */
export function parseOfficeStoryNoticeReadState(
  data: unknown,
  expectedIds: number[],
): OfficeStoryNoticeReadState[] {
  if (!Array.isArray(data)) throw new Error("Invalid Office notice read-state response");
  const expected = new Set(expectedIds);
  const parsed = new Map<number, OfficeStoryNoticeReadState>();
  for (const item of data) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Invalid Office notice read-state row");
    }
    const row = item as Record<string, unknown>;
    const id = noticeId(row.noticeId);
    if (id === null || typeof row.isRead !== "boolean" || !expected.has(id) || parsed.has(id)) {
      throw new Error("Office notice read-state identity did not match the request");
    }
    parsed.set(id, { noticeId: id, isRead: row.isRead });
  }
  if (parsed.size !== expected.size) throw new Error("Office notice read-state response was incomplete");
  return expectedIds.map(id => parsed.get(id)!);
}

async function authenticatedClient() {
  if (!isSharedAuditMode()) throw new Error("Shared Office mode is not enabled");
  const db = getAuditSqlClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user || data.user.is_anonymous) {
    throw new Error("Verified Office officer sign-in is required");
  }
  return { db, officerUid: data.user.id };
}

async function verifyCurrentOfficer(db: Awaited<ReturnType<typeof authenticatedClient>>["db"], officerUid: string) {
  const { data, error } = await db.auth.getUser();
  if (error || !data.user || data.user.is_anonymous || data.user.id !== officerUid) {
    throw new Error("Office officer changed during the read-state request");
  }
}

/** The SQL RPC derives the actor from auth.uid() and checks an active payment role. */
export async function getOfficeStoryNoticeReadState(
  noticeIds: number[],
): Promise<OfficeStoryNoticeReadSnapshot> {
  if (noticeIds.length > 100 || noticeIds.some(id => noticeId(id) === null)) {
    throw new Error("Invalid Office notice read-state request");
  }
  const uniqueIds = Array.from(new Set(noticeIds));
  const { db, officerUid } = await authenticatedClient();
  if (!uniqueIds.length) return { officerUid, notices: [] };
  const { data, error } = await db.rpc("payment_v1_office_story_notice_read_state", {
    p_notice_ids: uniqueIds,
  });
  if (error) throw new Error("Office notice read-state is unavailable");
  await verifyCurrentOfficer(db, officerUid);
  return { officerUid, notices: parseOfficeStoryNoticeReadState(data, uniqueIds) };
}

/** Retries are safe: the SQL receipt key is (notice_id, officer_uid). */
export async function setOfficeStoryNoticeRead(noticeIdValue: number, isRead: boolean): Promise<string> {
  const id = noticeId(noticeIdValue);
  if (id === null || typeof isRead !== "boolean") {
    throw new Error("Invalid Office notice read-state update");
  }
  const { db, officerUid } = await authenticatedClient();
  const { data, error } = await db.rpc("payment_v1_office_set_story_notice_read", {
    p_notice_id: id,
    p_is_read: isRead,
  });
  if (error || !data || typeof data !== "object" ||
      (data as Record<string, unknown>).noticeId !== id ||
      (data as Record<string, unknown>).isRead !== isRead) {
    throw new Error("Office notice read-state update could not be verified");
  }
  await verifyCurrentOfficer(db, officerUid);
  return officerUid;
}
