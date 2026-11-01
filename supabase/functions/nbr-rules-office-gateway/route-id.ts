/**
 * Accept canonical Bengali/Latin rule IDs without accepting path separators,
 * traversal, percent tricks or arbitrary route segments. The SQL registry has
 * six legitimate WH-R6-LAND-<Bengali letter> rule IDs.
 */
export function isRuleRouteId(raw: string | undefined): boolean {
  if (!raw || raw.length > 900) return false;
  try {
    const decoded = decodeURIComponent(raw);
    return decoded.length <= 100 && /^[\p{L}\p{N}_-]+$/u.test(decoded);
  } catch {
    return false;
  }
}

/** Prevent double encoding between gateway URL.pathname and Rules API. */
export function normalizeGatewaySegment(raw: string): string {
  const decoded = decodeURIComponent(raw);
  if (!isRuleRouteId(raw)) throw new Error("INVALID_RULES_GATEWAY_PATH");
  return encodeURIComponent(decoded);
}
