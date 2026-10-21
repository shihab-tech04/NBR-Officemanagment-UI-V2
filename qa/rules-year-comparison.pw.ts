import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gov_ui_auth", JSON.stringify({ isAuthenticated: true, userId: "admin" }));
    localStorage.setItem("gov_ui_settings", JSON.stringify({
      assessmentYear: "2026-27", themeId: "indigo-blue", fontId: "inter",
      fontSizeId: "standard", languageId: "en",
    }));
  });
});

test("Office Rules year comparison is an actual routed, reusable desktop table", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/administration/rules-calculation/year-comparison");
  await expect(page.getByRole("heading", { name: "Assessment-year rule comparison" })).toBeVisible();
  await expect(page.locator(".card-table__table tbody tr")).toHaveCount(25);
  await expect(page.locator(".card-table__table tbody tr").first()).toContainText("ACK-1695-001");
  await expect(page.getByText("Inherited · review pending").first()).toBeVisible();
  await expect(page.getByText(/Identity only.*legal and calculation diff NOT VERIFIED/).first()).toHaveCount(0);
  await page.screenshot({
    path: "test-results/rules-year-comparison-desktop-en.png",
    fullPage: true, animations: "disabled",
  });
});

test("Rules year comparison refuses to invent missing historical-year rules", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/administration/rules-calculation/year-comparison");
  await page.getByRole("combobox", { name: "From assessment year" }).click();
  await page.getByRole("option", { name: "2025-26" }).click();
  await expect(page.getByText(/incomplete historical identities/)).toBeVisible();
  await expect(page.locator(".card-table__table tbody tr")).toHaveCount(0);
});

test("Rules year comparison preserves existing mobile card and drawer behavior", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/administration/rules-calculation/year-comparison");
  await expect(page.locator(".card-table")).toBeHidden();
  const cards = page.locator(".mobile-table-card-list .mobile-table-card");
  await expect(cards).toHaveCount(25);
  await cards.first().click();
  await expect(page.locator(".dynamic-drawer")).toBeVisible();
  await expect(page.getByText("Identity only — legal and calculation diff NOT VERIFIED")).toBeVisible();
  await page.screenshot({
    path: "test-results/rules-year-comparison-mobile-en.png",
    fullPage: true, animations: "disabled",
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow, "no horizontal viewport overflow").toBeLessThanOrEqual(2);
});

test("Rules year comparison retains EN/BN localization", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("i18nextLng", "bn");
    localStorage.setItem("gov_ui_settings", JSON.stringify({
      assessmentYear: "2026-27", themeId: "indigo-blue", fontId: "inter",
      fontSizeId: "standard", languageId: "bn",
    }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/administration/rules-calculation/year-comparison");
  await expect(page.getByRole("heading", { name: "করবর্ষভিত্তিক বিধি তুলনা" })).toBeVisible();
  await page.screenshot({
    path: "test-results/rules-year-comparison-mobile-bn.png",
    fullPage: true, animations: "disabled",
  });
});
