// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = (name: string) => readFileSync(resolve(process.cwd(), "src/styles", name), "utf8");

describe("spacing tokens preserve deployed values and have one numeric owner", () => {
  const current = {
    "--space-1": "4px",
    "--space-2": "8px",
    "--space-3": "12px",
    "--space-4": "16px",
    "--space-5": "20px",
    "--space-6": "24px",
    "--space-8": "32px",
    "--space-10": "40px",
  };

  it("keeps the existing exact numeric values in tokens.css", () => {
    for (const [name, value] of Object.entries(current)) {
      expect(styles("tokens.css")).toContain(`${name}: ${value};`);
    }
  });

  it("does not reintroduce duplicate numeric declarations into typography", () => {
    const typography = styles("typography.css");
    for (const name of Object.keys(current)) {
      expect(typography).not.toMatch(new RegExp(`\\s${name}\\s*:`));
    }
  });

  it("loads both token authorities without changing import order", () => {
    const index = styles("index.css");
    expect(index.indexOf("@import './tokens.css'")).toBeLessThan(index.indexOf("@import './typography.css'"));
  });
});
