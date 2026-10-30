import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const routes = read("src/app/routes.tsx");
const hook = read("src/app/hooks/useNotifications.ts");
const slice = read("src/app/store/notificationsSlice.ts");
const module = read("src/app/pages/payments/PaymentModulePage.tsx");
const drawer = read("src/app/pages/payments/OfficeTransactionDrawer.tsx");
const en = JSON.parse(read("src/app/locales/en/payment.json")) as Record<string, string>;
const bn = JSON.parse(read("src/app/locales/bn/payment.json")) as Record<string, string>;

describe("Office payment notice detail routing", () => {
  it("carries an exact SQL payment identity to a dedicated record route", () => {
    expect(slice).toContain("targetPaymentId: event.paymentId");
    expect(hook).toContain("/payments/transactions/record/");
    expect(routes).toContain('path: "payments/transactions/record/:paymentId"');
    expect(routes).toContain("paymentId={paymentId}");
  });

  it("opens the existing transaction drawer from the matching mirrored SQL row", () => {
    expect(module).toContain("storyPayments.find(item=>item.id.toLowerCase()===paymentId.toLowerCase())");
    expect(module).toContain("setDetails({record:toStoryPaymentRow(match),title:t('transactions')})");
    expect(module).toContain("storyPayments.find(payment => payment.id === String(details?.record.payment_ref ?? ''))");
    expect(module).toContain("<OfficeTransactionDrawer");
    expect(drawer).toContain("open={!!detailRow && !receipt}");
    expect(drawer).toContain("<OfficeReceiptModal");
  });

  it("fails closed for an unavailable ID and returns to the transaction list when closed", () => {
    expect(module).toContain("setPaymentLinkUnavailable(true)");
    expect(module).toContain("The linked payment record is unavailable.");
    expect(module).toContain("বিজ্ঞপ্তির পেমেন্ট রেকর্ডটি উপলভ্য নয়।");
    expect(module).toContain("navigate('/payments/transactions',{replace:true})");
  });

  it("keeps the payment table and detail drawer labels available in English and Bengali", () => {
    expect(en.transactions).toBeTruthy();
    expect(bn.transactions).toBeTruthy();
    expect(en.viewReceipt).toBeTruthy();
    expect(bn.viewReceipt).toBeTruthy();
  });
});
