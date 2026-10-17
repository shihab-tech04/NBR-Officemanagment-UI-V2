import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function css(file: string): string {
  return readFileSync(resolve(process.cwd(), "src/styles", file), "utf8");
}

function weightFor(source: string, selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  return rule?.[1].match(/font-weight:\s*([^;\n}]+)/)?.[1].replace(/\s*!important$/, "").trim();
}

describe("office typography weight hierarchy", () => {
  it("defines the four supported weights and maps each semantic role to one", () => {
    const source = css("typography.css");
    expect(source).toMatch(/--weight-regular:\s*400;/);
    expect(source).toMatch(/--weight-medium:\s*500;/);
    expect(source).toMatch(/--weight-semibold:\s*600;/);
    expect(source).toMatch(/--weight-bold:\s*700;/);

    const roles = {
      "h1": "bold", "h2": "semibold", "h3": "semibold",
      "body-md": "regular", "label-md": "medium", "label-sm": "medium",
      "button": "semibold", "input": "regular", "table-header": "semibold",
      "table-body": "regular", "badge": "semibold", "nav-label": "regular",
    } as const;
    for (const [role, weight] of Object.entries(roles)) {
      expect(source).toContain(`--typ-${role}-weight:`);
      expect(source).toMatch(new RegExp(`--typ-${role}-weight:\\s*var\\(--weight-${weight}\\)`));
    }
  });

  it("uses the same table heading weight for English and Bangla", () => {
    const source = css("tables.css");
    for (const selector of [
      ".table th", ".card-table__th", ".dash-table__th", ".rct__th",
      ".double-entry-table .card-table__th",
    ]) {
      expect(weightFor(source, selector)).toBe("var(--typ-table-header-weight)");
    }
    expect(css("bangla-typography.css")).not.toMatch(/font-weight\s*:/);
  });

  it("uses 700 for page titles, 600 for sections and 500 for field labels", () => {
    for (const [file, selector, token] of [
      ["globals.css", ".table-page__title", "h1"],
      ["cards.css", ".dashboard-page__title", "h1"],
      ["cards.css", ".dash-page__title", "h1"],
      ["users.css", ".user-management__title", "h1"],
      ["payment.css", ".payment-module__card h2", "h2"],
      ["modals.css", ".modal-form-header__title", "h3"],
      ["rules-engine.css", ".rules-engine__heading", "h2"],
      ["forms.css", ".filter-label", "label-sm"],
      ["globals.css", ".MuiInputLabel-root", "label-md"],
    ]) {
      expect(weightFor(css(file), selector)).toBe(`var(--typ-${token}-weight)`);
    }
  });

  it("does not declare intermediate or unsupported numeric weights", () => {
    const files = readdirSync(resolve(process.cwd(), "src/styles")).filter((file) => file.endsWith(".css"));
    for (const file of files) {
      const numericWeights = [...css(file).matchAll(/font-weight:\s*(\d{3})\b/g)].map((match) => Number(match[1]));
      expect(numericWeights.every((weight) => [400, 500, 600, 700].includes(weight)), file).toBe(true);
    }
  });

  it("caps browser-default strong and bold emphasis at 700", () => {
    expect(css("theme.css")).toMatch(/strong,\s*b\s*\{\s*font-weight:\s*var\(--weight-bold\);\s*\}/);
  });
});
