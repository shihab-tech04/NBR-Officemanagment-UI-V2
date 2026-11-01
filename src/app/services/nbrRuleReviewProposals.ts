import type { RulesOfficerSession, LiveRuleVersion } from "./nbrRulesOfficerClient";
import { NBR_RULES_GATEWAY_BASE } from "./nbrRulesGatewayClient";

/**
 * Proposal-only review. SQL's 2026-27 rule registry is immutable, so the
 * authoritative server writes a DRAFT request + audit record rather than
 * changing a current rule version. No publish/execute option exists here.
 */
export interface VerifiedRuleReviewReceipt {
  requestId: string;
  ruleKey: string;
  assessmentYear: "2026-27";
  baseVersionId: string;
  status: "DRAFT";
  auditReadbackVerified: true;
}

function record(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function isAuthorized(session: RulesOfficerSession): boolean {
  return session.expiresAt > Date.now() &&
    !!session.sessionToken && !!session.bearer &&
    session.permissions.includes("tax_rule.propose_change");
}

export function validateOfficialLegalSource(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error("NBR_RULES_OFFICIAL_SOURCE_REQUIRED"); }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.search || url.hash || url.pathname === "/" ||
      input.trim().length > 600 ||
      !(url.hostname === "gov.bd" || url.hostname.endsWith(".gov.bd"))) {
    throw new Error("NBR_RULES_OFFICIAL_SOURCE_REQUIRED");
  }
  return url.href;
}

function detailUrl(ruleKey: string): string {
  if (!/^[\p{L}\p{N}_-]{1,100}$/u.test(ruleKey)) throw new Error("NBR_RULES_INVALID_RULE_ID");
  return NBR_RULES_GATEWAY_BASE + "/rules/" + encodeURIComponent(ruleKey) + "?year=2026-27";
}

function signedHeaders(session: RulesOfficerSession, contentType = false): Record<string,string> {
  return {
    authorization: "Bearer " + session.bearer,
    "x-nbr-rule-session": session.sessionToken,
    accept: "application/json",
    ...(contentType ? { "content-type":"application/json" } : {}),
  };
}

async function getDetail(session: RulesOfficerSession, url: string, fetcher: typeof fetch) {
  const response = await fetcher(url, {
    method: "GET", cache: "no-store", credentials: "omit",
    headers: signedHeaders(session),
  });
  if ([401,403].includes(response.status)) throw new Error("NBR_RULES_SESSION_EXPIRED");
  if (!response.ok) throw new Error("NBR_RULES_DETAIL_UNAVAILABLE");
  const body:unknown = await response.json();
  if (!record(body) || !record(body.year) || !record(body.version) ||
      !Array.isArray(body.changes) || !Array.isArray(body.audit)) {
    throw new Error("NBR_RULES_DETAIL_CONTRACT_MISMATCH");
  }
  return body;
}

export async function submitImmutableRuleReviewProposal(
  session: RulesOfficerSession,
  rule: LiveRuleVersion,
  legalSource: string,
  explanation: string,
  fetcher: typeof fetch = fetch
): Promise<VerifiedRuleReviewReceipt> {
  if (!isAuthorized(session)) throw new Error("NBR_RULES_PROPOSAL_PERMISSION_REQUIRED");
  const legalUrl = validateOfficialLegalSource(legalSource);
  const reason = explanation.trim();
  if (reason.length < 30 || reason.length > 700) throw new Error("NBR_RULES_REVIEW_REASON_REQUIRED");
  const url = detailUrl(rule.rule_id);
  const before = await getDetail(session, url, fetcher);
  const originalVersion = before.version as Record<string,unknown>;
  const year = before.year as Record<string,unknown>;
  if (year.assessment_year !== "2026-27" || year.is_immutable !== true ||
      originalVersion.id !== rule._backend.versionId ||
      originalVersion.rule_key !== rule.rule_id ||
      originalVersion.group_id !== rule._backend.groupId) {
    throw new Error("NBR_RULES_PROPOSAL_BASE_VERSION_CONFLICT");
  }

  const changeReason = "Independent legal review requested: " + reason + " | Official source: " + legalUrl;
  if ((before.changes as unknown[]).some(c=>record(c) && c.change_reason === changeReason &&
    (c.status === "DRAFT" || c.status === "UNDER_REVIEW"))) {
    throw new Error("NBR_RULES_DUPLICATE_REVIEW_REQUEST");
  }

  // SQL handles the immutable-year write as a DRAFT change request only.
  const response = await fetcher(url, {
    method: "PATCH", credentials: "omit", cache: "no-store",
    headers: signedHeaders(session,true),
    body: JSON.stringify({
      year: "2026-27",
      publish: false,
      groupId: rule._backend.groupId,
      yearApplicabilityStatus: "INHERITED_PENDING_REVIEW",
      executionStatus: "FAIL_CLOSED",
      patch: { legal_review_reference: legalUrl },
      changeReason,
    }),
  });
  if ([401,403].includes(response.status)) throw new Error("NBR_RULES_SESSION_EXPIRED");
  if (!response.ok) throw new Error("NBR_RULES_PROPOSAL_OUTCOME_UNVERIFIED");
  const payload: unknown = await response.json();
  if (!record(payload) || payload.ok !== true || payload.citizenEffective !== false ||
      !record(payload.result) || payload.result.mode !== "proposal" ||
      typeof payload.result.request_id !== "string" ||
      !/^[0-9a-f-]{36}$/.test(payload.result.request_id)) {
    throw new Error("NBR_RULES_PROPOSAL_OUTCOME_UNVERIFIED");
  }
  const id = payload.result.request_id;
  const after = await getDetail(session, url, fetcher);
  const matchesChange = (after.changes as unknown[]).some(c=>
    record(c) && c.id === id && c.status === "DRAFT" &&
    c.base_version_id === rule._backend.versionId && c.change_reason === changeReason);
  const matchesAudit = (after.audit as unknown[]).some(a=>
    record(a) && a.action === "CREATE_RULE_CHANGE_PROPOSAL" &&
    a.entity_key === rule.rule_id && record(a.metadata) &&
    a.metadata.request_id === id);
  if (!matchesChange || !matchesAudit || (after.version as Record<string,unknown>).id !== rule._backend.versionId) {
    throw new Error("NBR_RULES_PROPOSAL_OUTCOME_UNVERIFIED");
  }
  return {
    requestId:id, ruleKey:rule.rule_id, assessmentYear:"2026-27",
    baseVersionId:rule._backend.versionId, status:"DRAFT", auditReadbackVerified:true,
  };
}
