import { describe, expect, it } from "vitest";
import { validateSecondReviewInput } from "./auditSharedSecondReview";

describe("Independent Range Officer second-review contract", () => {
  it("accepts a specific reason for signed-off verified evidence", () => {
    expect(validateSecondReviewInput(3,"sign_off",
      "Signal R-C1 verified against source-of-funds reference 2026/104, finding reconciled."))
      .toEqual({
        action:"sign_off",
        reason:"Signal R-C1 verified against source-of-funds reference 2026/104, finding reconciled.",
      });
  });
  it("supports a specific rework request without changing risk level", () => {
    expect(validateSecondReviewInput(2,"request_rework",
      "Please obtain the source registry document for signal R-E2 before closing the case.").action)
      .toBe("request_rework");
  });
  it("rejects an invalid action, missing SQL version and generic approval note", () => {
    expect(() => validateSecondReviewInput(0,"sign_off",
      "The evidence verification is complete and accepted.")).toThrow();
    expect(() => validateSecondReviewInput(1,"approve",
      "The evidence verification is complete and accepted.")).toThrow();
    expect(() => validateSecondReviewInput(1,"sign_off","reviewed and approved")).toThrow();
    expect(() => validateSecondReviewInput(1,"sign_off","short")).toThrow();
    expect(() => validateSecondReviewInput(1,"request_rework","x".repeat(2001))).toThrow();
  });
});
