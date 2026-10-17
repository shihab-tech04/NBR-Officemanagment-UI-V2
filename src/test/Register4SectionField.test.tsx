import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Register4SectionField } from "../app/pages/register-stock/Register4SectionField";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

describe("Register-4 disposal section picker", () => {
  it("offers the custom-code action at the bottom of the dropdown, not beside it", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Register4SectionField id="disposal_code" label="Disposal Code (Section)" value="" onChange={onChange} editor="inline" />,
    );

    expect(container.querySelector(".register4-section-field__addition")).toBeNull();
    expect(screen.queryByRole("button", { name: /sectionAddNew/ })).toBeNull();
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Disposal Code (Section)" }));
    const options = await screen.findAllByRole("option");
    const add = options.at(-1)!;
    expect(add).toHaveTextContent("register4.sectionAddNew");
    expect(add).toHaveClass("register4-section-field__add-option");
    fireEvent.click(add);

    const editor = screen.getByRole("group", { name: "register4.sectionAddNew" });
    expect(editor).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(within(editor).getByRole("textbox"), { target: { value: "180" } });
    fireEvent.click(within(editor).getByRole("button", { name: "register4.sectionAdd" }));
    expect(onChange).toHaveBeenCalledWith("180");
  });

  it("still selects listed sections directly without opening the custom editor", async () => {
    const onChange = vi.fn();
    render(<Register4SectionField id="disposal_code" label="Disposal Code (Section)" value="" onChange={onChange} editor="inline" />);
    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Disposal Code (Section)" }));
    fireEvent.click(await screen.findByRole("option", { name: /180.*Self-assessment return/i }));
    expect(onChange).toHaveBeenCalledWith("180");
    expect(screen.queryByRole("group", { name: "register4.sectionAddNew" })).toBeNull();
  });
});
