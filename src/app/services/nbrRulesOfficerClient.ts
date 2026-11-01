import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NBR_RULES_GATEWAY_BASE, NBR_RULES_PROJECT_URL } from "./nbrRulesGatewayClient";

/**
 * Rules administration is independent of prototype Office login and Office
 * Audit SQL auth. Only a real user in the canonical Rules SQL Auth project,
 * bound to a permitted principal, can open this protected gateway session.
 * Never persist bearer/session tokens in localStorage, a route, or Redux.
 */
let rulesAuth: SupabaseClient | null = null;

function getRulesAuth(): SupabaseClient {
  const publishable = import.meta.env.VITE_NBR_RULES_PUBLISHABLE_KEY;
  if (!publishable || !publishable.startsWith("sb_publishable_")) {
    throw new Error("NBR_RULES_AUTH_NOT_CONFIGURED");
  }
  if (!rulesAuth) {
    rulesAuth = createClient(NBR_RULES_PROJECT_URL, publishable, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return rulesAuth;
}

export interface RulesOfficerSession {
  readonly bearer: string;
  readonly sessionToken: string;
  readonly expiresAt: number;
  readonly permissions: readonly string[];
}

export interface LiveRuleVersion {
  rule_id: string;
  legal_source?: unknown;
  statutory_section?: unknown;
  canonical_source_ref?: unknown;
  _backend: {
    versionId: string;
    revisionNo: number;
    executionStatus: string;
    yearApplicabilityStatus: string;
    groupId: string;
    createdAt?: string;
  };
}

export interface LiveRulesPage {
  year: { assessmentYear: string; state: string; executable: boolean };
  total: number;
  page: number;
  perPage: number;
  rules: LiveRuleVersion[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function validSession(s: RulesOfficerSession): boolean {
  return !!s.bearer && !!s.sessionToken && Number.isFinite(s.expiresAt) &&
    s.expiresAt > Date.now() && s.permissions.includes("tax_rule.view");
}
function validateRulesPage(payload: unknown, expectedYear: string, page: number): LiveRulesPage {
  if (!isObject(payload) || !isObject(payload.year) || !Array.isArray(payload.rules) ||
    payload.year.assessmentYear !== expectedYear || typeof payload.year.state !== "string" ||
    typeof payload.year.executable !== "boolean" ||
    !Number.isSafeInteger(payload.total) || Number(payload.total) < 0 ||
    payload.page !== page || !Number.isSafeInteger(payload.perPage) ||
    Number(payload.perPage) < 1 || payload.rules.length > Number(payload.perPage)) {
    throw new Error("NBR_RULES_READBACK_CONTRACT_MISMATCH");
  }
  const seen = new Set<string>();
  for (const rule of payload.rules as unknown[]) {
    if (!isObject(rule) || typeof rule.rule_id !== "string" || !rule.rule_id ||
      !isObject(rule._backend) ||
      typeof rule._backend.versionId !== "string" || !rule._backend.versionId ||
      !Number.isSafeInteger(rule._backend.revisionNo) || Number(rule._backend.revisionNo) < 1 ||
      typeof rule._backend.executionStatus !== "string" ||
      typeof rule._backend.yearApplicabilityStatus !== "string" ||
      typeof rule._backend.groupId !== "string" || seen.has(rule.rule_id)) {
      throw new Error("NBR_RULES_READBACK_CONTRACT_MISMATCH");
    }
    seen.add(rule.rule_id);
  }
  return payload as unknown as LiveRulesPage;
}

/** Do not assume the prototype shell is an NBR Rules administrator identity. */
export async function signInRulesOfficer(
  email: string, password: string, fetcher: typeof fetch = fetch
): Promise<RulesOfficerSession> {
  if (!email.trim() || !password) throw new Error("RULES_OFFICER_CREDENTIALS_REQUIRED");
  const auth = getRulesAuth();
  const { data, error } = await auth.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.session?.access_token) throw new Error("RULES_OFFICER_SIGN_IN_FAILED");
  const bearer = data.session.access_token;
  try {
    const response = await fetcher(NBR_RULES_GATEWAY_BASE + "/session/auto", {
      method: "POST",
      headers: { authorization: "Bearer " + bearer, accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("NBR_RULES_OFFICER_NOT_AUTHORIZED");
    const body: unknown = await response.json();
    if (!isObject(body) || typeof body.token !== "string" ||
      typeof body.expiresAt !== "string" || !Array.isArray(body.permissions) ||
      !body.permissions.every(p => typeof p === "string")) {
      throw new Error("NBR_RULES_SESSION_CONTRACT_MISMATCH");
    }
    const session: RulesOfficerSession = {
      bearer,
      sessionToken: body.token,
      expiresAt: Date.parse(body.expiresAt),
      permissions: body.permissions as string[],
    };
    if (!validSession(session)) throw new Error("NBR_RULES_OFFICER_NOT_AUTHORIZED");
    return session;
  } catch (err) {
    await auth.auth.signOut({ scope: "local" });
    throw err;
  }
}

export async function readAuthorizedRules(
  session: RulesOfficerSession, assessmentYear: string, page = 1,
  fetcher: typeof fetch = fetch
): Promise<LiveRulesPage> {
  if (!validSession(session)) throw new Error("NBR_RULES_SESSION_EXPIRED");
  if (!/^\d{4}-\d{2}$/.test(assessmentYear) || !Number.isSafeInteger(page) || page < 1) {
    throw new Error("NBR_RULES_INVALID_READ_REQUEST");
  }
  const params = new URLSearchParams({ year: assessmentYear, page: String(page), perPage: "25" });
  const response = await fetcher(NBR_RULES_GATEWAY_BASE + "/rules?" + params.toString(), {
    method: "GET",
    credentials: "omit",
    headers: {
      authorization: "Bearer " + session.bearer,
      "x-nbr-rule-session": session.sessionToken,
      accept: "application/json",
    },
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) throw new Error("NBR_RULES_SESSION_EXPIRED");
  if (!response.ok) throw new Error("NBR_RULES_SQL_UNAVAILABLE");
  return validateRulesPage(await response.json() as unknown, assessmentYear, page);
}

export async function signOutRulesOfficer(
  session: RulesOfficerSession | null, fetcher: typeof fetch = fetch
): Promise<void> {
  try {
    if (session?.bearer && session.sessionToken) {
      await fetcher(NBR_RULES_GATEWAY_BASE + "/session/revoke", {
        method: "POST",
        credentials: "omit",
        headers: { authorization: "Bearer " + session.bearer,
          "x-nbr-rule-session": session.sessionToken, accept: "application/json" },
      });
    }
  } finally {
    if (rulesAuth) await rulesAuth.auth.signOut({ scope: "local" });
  }
}
