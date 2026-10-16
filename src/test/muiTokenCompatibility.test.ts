// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");
const compatibilityTokens = {
  "--mui-menu-item-font-size": "13px",
  "--mui-input-font-size": "14px",
  "--mui-label-font-size": "14px",
  "--mui-helper-font-size": "12px",
  "--mui-filter-label-font-size": "13px",
  "--mui-filter-helper-font-size": "11px",
} as const;

describe("MUI compatible font values remain visually identical", () => {
  it("keeps all six pre-refactor font sizes at their exact original values", () => {
    const css = source("src/styles/tokens.css");
    for (const [variable, value] of Object.entries(compatibilityTokens)) {
      expect(css).toContain(`${variable}: ${value};`);
    }
  });

  it("connects theme and field overrides to the canonical matching tokens", () => {
    const muiTheme = source("src/app/components/ui/MuiProvider.tsx");
    const field = source("src/app/components/forms/muiFieldSx.ts");
    for (const key of Object.keys(compatibilityTokens).slice(0, 4)) {
      expect(muiTheme).toContain(`var(${key})`);
    }
    for (const key of Object.keys(compatibilityTokens).slice(4)) {
      expect(field).toContain(`var(${key})`);
    }
  });

  it("loads tokens before application form and field rules", () => {
    const cssImports = source("src/styles/index.css");
    expect(cssImports.indexOf("./tokens.css")).toBeLessThan(cssImports.indexOf("./forms.css"));
  });
});
