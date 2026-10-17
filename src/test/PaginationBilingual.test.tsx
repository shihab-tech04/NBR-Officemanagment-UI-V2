import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import i18n from "../app/i18n/config";
import { Pagination } from "../app/components/shared/Pagination";

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("Pagination language switching", () => {
  it("shows Bengali digits for ranges, page buttons, and page size", async () => {
    await i18n.changeLanguage("bn");
    render(
      <Pagination
        total={25}
        page={1}
        perPage={10}
        onPage={vi.fn()}
        perPageOptions={[10, 20]}
        onPerPageChange={vi.fn()}
      />,
    );

    const pagination = screen.getByRole("navigation", { name: "পৃষ্ঠানুক্রম" });
    expect(within(pagination).getByText(/১–১০/)).toHaveTextContent(/২৫/);
    expect(within(pagination).getByRole("button", { name: "পৃষ্ঠা ২" })).toHaveTextContent("২");
    expect(within(pagination).getByRole("option", { name: "২০" })).toHaveValue("20");
  });
});
