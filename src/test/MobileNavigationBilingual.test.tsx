import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import i18n from "../app/i18n/config";
import { MobileNavigationDrawer } from "../app/components/navigation/MobileNavigationDrawer";

const noop = vi.fn();

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("Mobile navigation language switching", () => {
  it("shows Bengali primary and nested navigation when Bengali is selected", async () => {
    await i18n.changeLanguage("bn");
    render(
      <MemoryRouter initialEntries={["/dashboard/dashboard-main"]}>
        <MobileNavigationDrawer
          onLogoClick={noop}
          onMainNavClick={noop}
          onSubNavClick={noop}
          onThirdNavClick={noop}
          onClose={noop}
        />
      </MemoryRouter>,
    );

    const navigation = screen.getByRole("navigation", { name: "মোবাইল নেভিগেশন" });
    expect(within(navigation).getByRole("button", { name: "প্রতিবেদন" })).toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: "পিএসআর ড্যাশবোর্ড" })).toBeInTheDocument();
    expect(within(navigation).queryByRole("button", { name: "Report" })).not.toBeInTheDocument();
  });
});
