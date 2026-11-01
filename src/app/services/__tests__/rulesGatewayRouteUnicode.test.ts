import { describe, it, expect } from "vitest";
import {
  isRuleRouteId, normalizeGatewaySegment,
} from "../../../../supabase/functions/nbr-rules-office-gateway/route-id";

describe("canonical NBR Rules SQL Unicode path normalization", () => {
  it("accepts all six registered Bengali rule keys without double-encoding", () => {
    for (const suffix of ["ক","খ","গ","ঘ","ঙ","চ"]) {
      const id = "WH-R6-LAND-" + suffix;
      const encoded = encodeURIComponent(id);
      expect(isRuleRouteId(encoded)).toBe(true);
      expect(isRuleRouteId(id)).toBe(true);
      expect(normalizeGatewaySegment(encoded)).toBe(encoded);
      expect(decodeURIComponent(normalizeGatewaySegment(encoded))).toBe(id);
    }
  });
  it("preserves existing ASCII routes and rule IDs", () => {
    for (const id of ["public","years","session","auto","rules","groups","R-001","TDS_12"]) {
      expect(isRuleRouteId(id)).toBe(true);
      expect(normalizeGatewaySegment(id)).toBe(id);
    }
  });
  it("rejects traversal, separators, malformed escapes and invalid path metadata", () => {
    for (const id of ["..","%2F","A%2FB","A/B","%00","%ZZ","foo.bar","user%40name","%252F","","x".repeat(101)]) {
      expect(isRuleRouteId(id)).toBe(false);
      expect(() => normalizeGatewaySegment(id)).toThrow("INVALID_RULES_GATEWAY_PATH");
    }
  });
});
