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
  await expect(cards.first()).toContainText("Forms, Evidence & Administration");
  await expect(cards.first()).toContainText("Legal comparison pending");
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

test("Rule Library uses Office pagination and shows useful mobile rule metadata", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/administration/rules-calculation/rule-library");
  const cards = page.locator(".mobile-table-card-list .mobile-table-card");
  await expect(cards).toHaveCount(25);
  await expect(cards.first()).toContainText("ACK-1695-001");
  await expect(cards.first()).toContainText("Forms, Evidence & Administration");
  await expect(page.getByRole("navigation", { name: "Pagination" })).toBeVisible();
  await cards.first().click();
  await expect(page.locator(".dynamic-drawer")).toBeVisible();
});

test("Tax Years opens selected-year Rules then source-backed Rule Details", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/administration/rules-calculation/tax-years");
  await expect(page.getByRole("heading", { name: "Tax Years" })).toBeVisible();
  const row = page.locator(".card-table__table tbody tr").filter({ hasText: "2026-27" }).first();
  await row.click();
  await expect(page).toHaveURL(/\/administration\/rules-calculation\/rule-library\?year=2026-27/);
  await expect(page.getByRole("heading", { name: /Rules.*2026-27/ })).toBeVisible();
  const back = page.locator(".rules-engine__list-actions").getByRole("button", { name: "Tax Years" });
  await expect(back).toHaveClass(/app-btn--sm/);
  const backWidth = await back.evaluate((element) => element.getBoundingClientRect().width);
  expect(backWidth, "back action must not be a full-width banner").toBeLessThan(300);
  await expect(page.locator(".card-table__table tbody tr")).toHaveCount(25);
  await page.locator(".card-table__table tbody tr").first().click();
  await expect(page).toHaveURL(/year=2026-27&rule=ACK-1695-001/);
  const drawer = page.locator(".rules-engine__details-dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("Rule Details");
  await expect(drawer).toContainText("Identity & applicability");
  await expect(drawer).toContainText("Legal sources & provenance");
  await expect(drawer).toContainText("Calculation & eReturn mapping");
  await expect(drawer).toContainText("Income Tax Act s169(5)");
  await expect(drawer).toContainText("CERTIFIED_CURRENT");
  await page.screenshot({ path: "test-results/rules-year-rule-details-desktop.png", fullPage: true, animations: "disabled" });
});

test("Tax Years does not populate unknown historical rules and allows return navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/administration/rules-calculation/tax-years");
  await page.locator(".card-table__table tbody tr").first().click();
  await expect(page).toHaveURL(/rule-library\?year=2024-25/);
  await expect(page.getByText(/Historical rules have not been reconstructed/)).toBeVisible();
  await expect(page.locator(".card-table__empty")).toBeVisible();
  await expect(page.locator(".card-table__table tbody tr").filter({ hasText: "ACK-1695-001" })).toHaveCount(0);
  await page.locator(".rules-engine__list-actions").getByRole("button", { name: "Tax Years" }).click();
  await expect(page).toHaveURL(/rules-calculation\/tax-years$/);
  await expect(page.locator(".card-table__table tbody tr")).toHaveCount(4);
});

test("Year to Rules to Details works with Office mobile cards and direct links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/administration/rules-calculation/tax-years");
  const yearCards = page.locator(".mobile-table-card-list .mobile-table-card");
  await expect(yearCards).toHaveCount(4);
  await yearCards.nth(2).click();
  await expect(page).toHaveURL(/rule-library\?year=2026-27/);
  const rules = page.locator(".mobile-table-card-list .mobile-table-card");
  await expect(rules).toHaveCount(25);
  await rules.first().click();
  await expect(page.locator(".rules-engine__details-dialog")).toBeVisible();
  await expect(page.locator(".rules-engine__details-dialog")).toContainText("ACK-1695-001");
  await page.screenshot({ path: "test-results/rules-year-rule-details-mobile.png", fullPage: true, animations: "disabled" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);

  await page.goto("/administration/rules-calculation/rule-library?year=2026-27&rule=ACK-1695-001");
  await expect(page.locator(".rules-engine__details-dialog")).toBeVisible();
  await expect(page.locator(".rules-engine__details-dialog")).toContainText("Income Tax Act s169(5)");
});

test("Bangla year-to-rule navigation reuses existing Office labels and layout", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("i18nextLng", "bn");
    localStorage.setItem("gov_ui_settings", JSON.stringify({
      assessmentYear: "2026-27", themeId: "indigo-blue", fontId: "inter",
      fontSizeId: "standard", languageId: "bn",
    }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/administration/rules-calculation/tax-years");
  await page.locator(".mobile-table-card-list .mobile-table-card").nth(2).click();
  await expect(page.locator(".rules-engine__list-actions").getByRole("button", { name: "করবর্ষ" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /বিধিসমূহ.*2026-27/ })).toBeVisible();
  await page.screenshot({ path: "test-results/rules-year-rule-list-mobile-bn.png", fullPage: true, animations: "disabled" });
});
