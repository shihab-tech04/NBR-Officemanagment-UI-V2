import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

/** Isolated Office UX smoke; these synthetic strings are NOT legal source/Agent fixtures. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gov_ui_auth", JSON.stringify({ isAuthenticated: true, userId: "admin" }));
    localStorage.setItem("gov_ui_settings", JSON.stringify({
      assessmentYear: "2026-27", themeId: "indigo-blue", fontId: "inter",
      fontSizeId: "standard", languageId: "en",
    }));
  });
});

async function startWizard(page: import("@playwright/test").Page, language: "en" | "bn") {
  if (language === "bn") {
    await page.addInitScript(() => {
      localStorage.setItem("i18nextLng", "bn");
      localStorage.setItem("gov_ui_settings", JSON.stringify({
        assessmentYear: "2026-27", themeId: "indigo-blue", fontId: "inter",
        fontSizeId: "standard", languageId: "bn",
      }));
    });
  }
  await page.goto("/administration/rules-calculation/tax-years");
  await page.getByRole("button", { name: language === "bn" ? "করবর্ষের খসড়া" : "Prepare tax year" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function advance(page: import("@playwright/test").Page, language: "en" | "bn", steps: number) {
  for (let i=0;i<steps;i++)
    await page.getByRole("button", { name: language === "bn" ? "পরবর্তী" : "Next", exact: true }).click();
}

for (const language of ["en", "bn"] as const) {
  for (const width of [375, 768, 1280, 1920]) {
    test(`WS03 review wizard controls, scrolling and scope ${language} ${width}px`, async ({ page }) => {
      await page.setViewportSize({width, height:900});
      const dialog = await startWizard(page, language);
      await advance(page, language, 3);
      await expect(page.locator("#candidate-change-id")).toBeVisible();
      await expect(page.locator("#candidate-rule-id")).toBeVisible();
      await expect(page.locator("#candidate-parent-id")).toBeVisible();
      await expect(page.locator("#candidate-level")).toBeVisible();
      await expect(page.locator("#candidate-pdf")).toBeVisible();
      await expect(page.locator("#candidate-old-text")).toBeVisible();
      await expect(page.locator("#candidate-new-text")).toBeVisible();
      await expect(page.locator("#candidate-effective")).toBeVisible();
      await expect(page.locator(".rules-engine__comparison")).toBeVisible();
      await expect(dialog.getByText(/OPEN/).first()).toBeVisible();
      await page.screenshot({path:`test-results/ws03-review-${language}-${width}.png`,fullPage:true,animations:"disabled"});
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth-innerWidth);
      expect(overflow,"No Office viewport-level horizontal overflow").toBeLessThanOrEqual(2);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    });
  }
}

test("WS03 source-linked proposal is exported locally and never falsely persisted", async ({ page }) => {
  await page.setViewportSize({width:1280,height:900});
  const dialog = await startWizard(page, "en");
  await advance(page,"en",2);
  await page.locator("#intake-file").setInputFiles({
    name:"synthetic-test-only.pdf",
    mimeType:"application/pdf",
    buffer:Buffer.from("%PDF-ONLY-FOR-UI-TEST-NOT-A-LEGAL-ORIGINAL"),
  });
  await expect(dialog.getByText("synthetic-test-only.pdf")).toBeVisible();
  await advance(page,"en",1);
  await page.locator("#candidate-change-id").fill("TEST-PROVISION-001");
  await page.locator("#candidate-rule-id").fill("ACK-1695-001");
  await page.getByRole("option",{name:"ACK-1695-001"}).click();
  await page.locator("#candidate-source-id").fill("SYNTHETIC-TEST-NOT-LAW");
  await page.locator("#candidate-locator").fill("Synthetic test page 1");
  await page.locator("#candidate-old-text").fill("Not real old law");
  await page.locator("#candidate-new-text").fill("Not real new law");
  await page.locator("#candidate-pdf").click();
  await page.getByRole("option",{name:/synthetic-test-only.pdf/}).click();
  await dialog.getByRole("button",{name:"Add proposed provision (local only)"}).click();
  await expect(dialog.getByRole("heading",{name:/TEST-PROVISION-001/})).toBeVisible();
  await expect(dialog.getByText(/SQL NOT PERSISTED/)).toBeVisible();
  await advance(page,"en",2);
  await expect(dialog.getByText("Provision proposals (OPEN):")).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await dialog.getByRole("button",{name:"Export review-only DRAFT JSON"}).click();
  const download=await downloadEvent;
  const bytes=await readFile(await download.path() as string);
  const body=JSON.parse(bytes.toString("utf8"));
  expect(body.provisionCandidates).toHaveLength(1);
  expect(body.provisionCandidates[0].proposalId).toBe("TEST-PROVISION-001");
  expect(body.provisionCandidates[0].sourcePdfSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(body.provisionCandidates[0].legalVerified).toBe(false);
  expect(body.provisionCandidates[0].persistence).toBe("LOCAL_REVIEW_ONLY");
  expect(body.provisionCandidates[0].gapState).toBe("OPEN");
  expect(body.persistentSqlWritePerformed).toBe(false);
  expect(body.releaseGate.result).toBe("BLOCKED");
});
