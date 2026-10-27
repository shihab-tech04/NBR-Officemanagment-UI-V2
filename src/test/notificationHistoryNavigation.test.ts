import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { NAVIGATION } from "../app/data/navigation";
import en from "../app/locales/en/notifications.json";
import bn from "../app/locales/bn/notifications.json";

describe("Office SQL-backed notification history navigation", () => {
  it("has an actual Payments / Transactions destination for the complete SQL history", () => {
    const payments = NAVIGATION.find(item => item.id === "payments");
    expect(payments?.children.some(item => item.id === "transactions")).toBe(true);
  });
  it("wires the bell history action in desktop and mobile rather than simply closing", () => {
    for (const path of ["src/app/components/navigation/Topbar.tsx", "src/app/components/navigation/MobileTopbar.tsx"]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain('onViewAllPayments={() => {');
      expect(source).toContain('navigate("/payments/transactions")');
    }
    const dropdown = readFileSync("src/app/components/dropdowns/NotificationDropdown.tsx", "utf8");
    expect(dropdown).toContain('onClick={onViewAllPayments}');
    expect(dropdown).toContain('notifications.some(n => n.type === "payment")');
    expect(dropdown).not.toContain('<button onClick={onClose} className="notification-dropdown__see-all">');
  });
  it("labels the full SQL payment history honestly in English and Bangla", () => {
    expect(en.viewAllPaymentRecords).toBe("View all payment records");
    expect(bn.viewAllPaymentRecords).toBe("সব পেমেন্ট রেকর্ড দেখুন");
  });
});
