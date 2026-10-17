import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { useTheme } from "@mui/material/styles";
import { MuiProvider } from "../app/components/ui/MuiProvider";
import { FONTS, FONT_ORDER, resolveFontFamily } from "../app/data/fonts";

describe("Bangla typography", () => {
  it("preserves the selected font for English", () => {
    for (const id of FONT_ORDER) {
      expect(resolveFontFamily(id, "en")).toBe(FONTS[id].family);
    }
  });

  it("puts Noto Sans Bengali first for Bangla while preserving Latin fallbacks", () => {
    for (const id of FONT_ORDER) {
      expect(resolveFontFamily(id, "bn")).toBe(`'Noto Sans Bengali', ${FONTS[id].family}`);
      expect(resolveFontFamily(id, "bn-BD")).toBe(`'Noto Sans Bengali', ${FONTS[id].family}`);
    }
  });

  it("makes MUI typography inherit the chosen app font, including portal menus", () => {
    function ThemeProbe() {
      const theme = useTheme();
      return <span data-testid="font-family">{theme.typography.fontFamily}</span>;
    }
    render(<MuiProvider><ThemeProbe /></MuiProvider>);
    expect(screen.getByTestId("font-family")).toHaveTextContent("inherit");
  });
});
