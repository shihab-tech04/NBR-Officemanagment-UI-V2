import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GeneratedTablePage } from "../app/components/pages/GeneratedTablePage";
import { onlineRetRows, BASE_FILTERS, type PageCfg, type TableRow } from "../app/pages/modulePageUtils";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../app/hooks/useUI", () => ({ useUIState: () => ({ isDesktop: true }) }));
vi.mock("../app/components/forms/AppSearchField", () => ({
  AppSearchField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
    <input aria-label="search records" value={value} onChange={event => onChange(event.target.value)} />,
}));
vi.mock("../app/components/shared/MobileSearchFilter", () => ({ MobileSearchFilter: () => null }));
vi.mock("../app/components/filters/MobileFilterOverlay", () => ({ MobileFilterOverlay: () => null }));
vi.mock("../app/components/filters/FilterPanel", () => ({
  FilterPanel: ({ filters, onChange, onApply, onReset }: {
    filters: { key: string }[];
    onChange: (k: string, v: string) => void;
    onApply: () => void; onReset: () => void;
  }) => <div data-testid="filter-panel">
    <p>Fields: {filters.map(f => f.key).join(", ")}</p>
    <button onClick={() => onChange("ay", "2024-25")}>Choose year</button>
    <button onClick={() => onChange("from", "2026-01-01")}>Choose start</button>
    <button onClick={() => onChange("to", "2026-01-31")}>Choose end</button>
    <button onClick={onApply}>Apply test filters</button>
    <button onClick={onReset}>Reset test filters</button>
  </div>,
}));
vi.mock("../app/components/tables/ResponsiveTable", () => ({
  ResponsiveTable: ({ rows }: { rows: TableRow[] }) =>
    <output data-testid="visible-rows">{rows.map(row => String(row.id)).join(",")}</output>,
}));
vi.mock("../app/components/shared/Pagination", () => ({
  Pagination: ({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) =>
    <div><output data-testid="total">{total}</output><output data-testid="page">{page}</output>
      <button onClick={() => onPage(2)}>Go page 2</button></div>,
}));
vi.mock("../app/components/drawers/DynamicDetailsDrawer", () => ({ DynamicDetailsDrawer: () => null }));

const cfg: PageCfg = {
  title: "Online Return Register", desc: "", rows: onlineRetRows,
  cols: [{ type: "col", col: { key: "submission_date", label: "Submission Date" } }],
  mobileCardMapping: { date: "submission_date" },
  filters: BASE_FILTERS, actions: [],
};

describe("shared table user flow", () => {
  it("applies real filters, synchronizes chips/fields on clear, and returns to page one", () => {
    render(<GeneratedTablePage cfg={cfg} />);
    expect(screen.getByTestId("total")).toHaveTextContent("38");
    fireEvent.click(screen.getByRole("button", { name: "Go page 2" }));
    expect(screen.getByTestId("page")).toHaveTextContent("2");

    fireEvent.click(screen.getByRole("button", { name: "actions.filter" }));
    expect(screen.getByTestId("filter-panel")).toHaveTextContent("circle, ay, from, to");
    fireEvent.click(screen.getByRole("button", { name: "Choose year" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose start" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose end" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply test filters" }));
    expect(screen.getByTestId("total")).toHaveTextContent("2");
    expect(screen.getByTestId("page")).toHaveTextContent("1");
    expect(screen.getByText("2024-25")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "buttons.reset" }));
    expect(screen.getByTestId("total")).toHaveTextContent("38");
    fireEvent.click(screen.getByRole("button", { name: "actions.filter" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply test filters" }));
    expect(screen.getByTestId("total")).toHaveTextContent("38");
  });
});
