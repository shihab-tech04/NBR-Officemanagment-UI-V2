import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.removeItem("office_ui_entered");
    localStorage.setItem("gov_ui_settings", JSON.stringify({
      assessmentYear: "2025-26", themeId: "indigo-blue",
      fontId: "poppins", fontSizeId: "standard", languageId: "en",
    }));
    localStorage.setItem("i18nextLng", "en");
  });
});

test("Audit prototype opens directly while private CMS still uses Office entry", async ({ page }) => {
  await page.goto("/audit/audit-candidates");
  await expect(page.locator(".audit-candidates-page")).toBeVisible({ timeout: 18000 });
  await expect(page.locator("#login-user-id")).toHaveCount(0);
  await expect(page.locator(".table-card")).toContainText("AUD-2026-RISK-01");
  await page.goto("/administration/content-management");
  await expect(page.locator("#login-user-id")).toBeVisible();
});

test("Audit draft status, case queue and trail survive a reload without fake login", async ({ page }) => {
  await page.goto("/audit/audit-candidates?batch=AUD-2026-RISK-01&candidate=AC-2026-RISK-01-01");
  await expect(page.locator(".audit-candidate-detail__header")).toBeVisible({ timeout: 18000 });
  await expect(page.locator(".audit-selection-evidence")).toBeVisible();
  await expect(page.locator(".audit-progress-disclosure")).toHaveCount(0);
  await page.getByRole("button", { name: "Update audit progress" }).click();
  await expect(page.getByRole("dialog", { name: "Update audit progress" })).toBeVisible();
  await page.getByRole("combobox", { name: /Next status/ }).click();
  await page.getByRole("option", { name: "Assigned" }).click();
  await page.getByRole("textbox", { name: /Reason or review note/ }).fill("Assigned for review of the synthetic candidate data");
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByText("Audit status saved on this device.")).toBeVisible();
  await page.reload();
  await expect(page.locator(".audit-candidate-detail__header")).toBeVisible({ timeout: 18000 });
  await expect(page.getByRole("button", { name: "Update audit progress" })).toHaveCount(1);
  await page.goto("/audit/risk-cases");
  await expect(page.locator(".table-page")).toContainText("RET-2026-10482");
  await expect(page.locator(".table-page")).toContainText("Assigned");
  await page.goto("/audit/audit-trail");
  await expect(page.locator(".table-page")).toContainText("Candidate status: Not Started");
});
