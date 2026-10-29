import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import i18n from "../app/i18n/config";
import { Pagination, getPaginationItems } from "../app/components/shared/Pagination";

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


describe("Office-wide bounded page navigation", () => {
  it("retains Audit-style compact navigation for large registers", () => {
    expect(getPaginationItems(63, 1)).toEqual([1, 2, 3, 4, 5, 6, "ellipsis", 63]);
    expect(getPaginationItems(63, 30)).toEqual([1, "ellipsis", 28, 29, 30, 31, 32, "ellipsis", 63]);
    expect(getPaginationItems(63, 63)).toEqual([1, "ellipsis", 58, 59, 60, 61, 62, 63]);
  });

  it("preserves every page on short tables and never displays out-of-range pages", () => {
    expect(getPaginationItems(4, 2)).toEqual([1, 2, 3, 4]);
    expect(getPaginationItems(0, 1)).toEqual([]);
    expect(getPaginationItems(63, 100)).toEqual(getPaginationItems(63, 63));
  });

  it("keeps the last page reachable instead of rendering 63 buttons", () => {
    const onPage = vi.fn();
    render(<Pagination total={628} page={1} perPage={10} onPage={onPage} />);
    const pagination = screen.getByRole("navigation");
    const allButtons = within(pagination).getAllByRole("button");
    expect(allButtons.length).toBeLessThanOrEqual(10);
    expect(within(pagination).getByRole("button", { name: /63/ })).toBeInTheDocument();
  });
});
