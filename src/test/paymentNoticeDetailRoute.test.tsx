import { Suspense } from "react";
import { render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import "../app/i18n/config";
import { PaymentRoute } from "../app/routes";
import { store } from "../app/store";

const { paymentId } = vi.hoisted(() => ({ paymentId: "4b94da20-7cce-4fd7-98bd-a1cbb86cb9d9" }));

vi.mock("../app/pages/payments/story1OfficeApi", () => ({
  getStoryPayments: async () => [{
    id: paymentId,
    service: "TAX_WITH_RETURN",
    amountMinor: 12500,
    status: "SIMULATED",
    createdAt: "2026-10-30T12:00:00.000Z",
  }],
  getStoryNotices: async () => [],
}));

describe("Office payment notice detail route", () => {
  it("opens the matching payment record at the exact notification URL", async () => {
    const path = `/payments/transactions/record/${paymentId}`;
    const router = createMemoryRouter(
      [{ path: "/payments/transactions/record/:paymentId", Component: PaymentRoute }],
      { initialEntries: [path] },
    );

    const rendered = render(
      <Provider store={store}>
        <Suspense fallback={<div>Loading payment record</div>}>
          <RouterProvider router={router} />
        </Suspense>
      </Provider>,
    );

    expect(await screen.findByTestId("payment-transactions")).toBeInTheDocument();
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText(paymentId)).toBeVisible();

    rendered.unmount();
    router.dispose();
  });
});
