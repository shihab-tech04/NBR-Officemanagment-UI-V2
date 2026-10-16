// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FONTS, FONT_ORDER, FONT_SIZES, FONT_SIZE_ORDER } from "../../../data/fonts";
import { THEMES, THEME_ORDER } from "../../../data/themes";
import { FontOptionCard } from "../FontOptionCard";
import { FontSizeOptionCard } from "../FontSizeOptionCard";
import { ThemeOptionCard } from "../ThemeOptionCard";

afterEach(cleanup);

describe("appearance settings use the canonical existing registries", () => {
  it("keeps the current six themes, four fonts and three text sizes", () => {
    expect(THEME_ORDER).toHaveLength(6);
    expect(FONT_ORDER).toHaveLength(4);
    expect(FONT_SIZE_ORDER).toHaveLength(3);
    expect(FONT_ORDER).toContain("inter");
  });

  it.each(FONT_ORDER)("renders and selects the existing %s font", (id) => {
    const select = vi.fn();
    const { container } = render(
      <FontOptionCard font={FONTS[id]} selected={true} onSelect={select} />,
    );
    const button = screen.getByRole("button", { name: `Font: ${FONTS[id].name}` });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll("button")).toHaveLength(1);
    fireEvent.click(button);
    expect(select).toHaveBeenCalledExactlyOnceWith(id);
  });

  it.each(THEME_ORDER)("renders and selects the existing %s theme", (id) => {
    const select = vi.fn();
    const { container } = render(
      <ThemeOptionCard theme={THEMES[id]} selected={true} onSelect={select} />,
    );
    const button = screen.getByRole("button", { name: `Color theme: ${THEMES[id].name}` });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll("button")).toHaveLength(1);
    fireEvent.click(button);
    expect(select).toHaveBeenCalledExactlyOnceWith(id);
  });

  it.each(FONT_SIZE_ORDER)("renders and selects the existing %s font-size mode", (id) => {
    const select = vi.fn();
    const { container } = render(
      <FontSizeOptionCard config={FONT_SIZES[id]} selected={true} onSelect={select} />,
    );
    const button = screen.getByRole("button", {
      name: `Font size: ${FONT_SIZES[id].name}. ${FONT_SIZES[id].description}`,
    });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll("button")).toHaveLength(1);
    fireEvent.click(button);
    expect(select).toHaveBeenCalledExactlyOnceWith(id);
  });
});
