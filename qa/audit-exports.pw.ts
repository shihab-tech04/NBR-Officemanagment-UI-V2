import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem("gov_ui_settings",JSON.stringify({
      assessmentYear:"2025-26",themeId:"indigo-blue",fontId:"poppins",
      fontSizeId:"standard",languageId:"en"
    }));
    localStorage.setItem("i18nextLng","en");
  });
});

test("All Taxpayers Download exports the current search, not just the current page", async ({page}) => {
  await page.goto("/audit/all-taxpayers");
  const search=page.locator(".table-card__search-wrapper input");
  await expect(search).toBeVisible({timeout:18000});
  await search.fill("Rahman Enterprise");
  const rows=page.locator(".card-table__tbody tr");
  const downloadButton=page.locator(".table-card__toolbar-btn--download");
  await expect(downloadButton).toBeEnabled();
  const [file]=await Promise.all([page.waitForEvent("download"),downloadButton.click()]);
  expect(file.suggestedFilename()).toMatch(/^audit-.*\.csv$/);
  const csv=await readFile(await file.path(),"utf8");
  expect(csv).toContain("Rahman Enterprise");
  expect(csv).toContain('"TIN"');
  expect(csv).not.toContain("secret_metadata");
  expect(csv).not.toContain("Anika Engineering");
});

test("Empty assessment year gives accurate guidance and a working year switch",async({page})=>{
  await page.addInitScript(() => {
    localStorage.setItem("gov_ui_settings",JSON.stringify({
      assessmentYear:"2024-25",themeId:"indigo-blue",fontId:"poppins",
      fontSizeId:"standard",languageId:"en"
    }));
  });
  await page.goto("/audit/all-taxpayers");
  const notice=page.getByRole("status").filter({hasText:"No Audit records are loaded for AY 2024-25"});
  await expect(notice).toBeVisible({timeout:18000});
  await expect(page.locator(".table-card__toolbar-btn--download")).toBeDisabled();
  await expect(page.locator(".card-table__empty")).toHaveText("No Audit records are loaded for AY 2024-25.");
  await notice.getByRole("button",{name:"View AY 2025-26 records"}).click();
  await expect(page.locator(".table-card__count")).toHaveText(/^[1-9][0-9]* records$/);
  await expect(page.locator(".table-card__toolbar-btn--download")).toBeEnabled();
});
