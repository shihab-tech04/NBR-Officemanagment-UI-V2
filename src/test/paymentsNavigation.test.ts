import { describe, expect, it } from "vitest";
import { NAVIGATION } from "../app/data/navigation";
import en from "../app/locales/en/navigation.json";
import bn from "../app/locales/bn/navigation.json";

describe("Office Management Payments navigation", () => {
  it("is a separate first-level item immediately after Audit", () => {
    const ids = NAVIGATION.map((item) => item.id);
    expect(ids.indexOf("payments")).toBe(ids.indexOf("audit") + 1);
    expect(NAVIGATION.find((item) => item.id === "payments")?.children.map((item) => item.id))
      .toEqual(["overview"]);
    expect(NAVIGATION.find((item) => item.id === "audit")?.children.some((item) => item.id === "payments"))
      .toBe(false);
  });

  it("has English and Bengali labels", () => {
    expect(en.payments.main).toBe("Payments");
    expect(en.payments.overview).toBeTruthy();
    expect(bn.payments.main).toBe("পেমেন্ট");
    expect(bn.payments.overview).toBeTruthy();
  });
});
