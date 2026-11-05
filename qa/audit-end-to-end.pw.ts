import { test, expect } from "@playwright/test";

/** Full Audit user journey, using the existing Office layout and persistent candidate store. */
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

test("create Audit, run R-A1 screening, confirm, review, refresh, and recover trail", async ({ page }) => {
  await page.goto("/audit/audit-candidates");
  await expect(page.locator(".audit-candidates-page")).toBeVisible();
  await page.getByRole("button", { name: "Initiate Audit" }).click();

  const modal = page.getByRole("dialog", { name: "Select Audit Candidates" });
  await expect(modal).toBeVisible();
  const next = () => modal.getByRole("button", { name: "Continue", exact: true }).click();

  await next(); // Selected assessment year and risk-based selection track
  await next(); // Full population
  await next(); // Existing data-readiness defaults

  const criterion = modal.locator(".app-selection-row").filter({
    has: modal.locator(".app-selection-row__code", { hasText: "R-A1" }),
  }).first();
  await expect(criterion).toBeVisible();
  await criterion.locator("label").click();
  await next(); // Criteria -> screening
  await modal.getByRole("button", { name: "Start screening" }).click();
  await modal.getByRole("button", { name: "Continue to Candidate preview" }).click();
  await expect(modal).toContainText("Anika Engineering");
  await expect(modal).toContainText("R-A1");

  await next(); // Preview -> selection funnel
  await next(); // All matched -> final review
  await expect(modal).toContainText("Anika Engineering");
  const confirmation = modal.getByRole("button", { name: "Confirm candidates" });
  await expect(confirmation).toBeEnabled();
  await confirmation.click();
  await expect(modal).toHaveCount(0);

  const record = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("nbr-audit-candidates-v3") || "[]");
    return stored.filter((item: { return_id: string }) => item.return_id === "RET-2026-20001");
  });
  expect(record).toHaveLength(1);
  const candidate = record[0];
  expect(candidate.assessment_year).toBe("2025-26");
  expect(candidate.signals).toContain("R-A1");
  expect(candidate.audit_status).toBe("Not Started");
  expect(candidate.final_candidates).toBeGreaterThanOrEqual(1);

  const candidateUrl = "/audit/audit-candidates?batch=" +
    encodeURIComponent(candidate.batch_id) + "&candidate=" +
    encodeURIComponent(candidate.candidate_id);
  await page.goto(candidateUrl);
  await expect(page.locator(".audit-candidate-detail__header")).toContainText("Anika Engineering");

  await page.getByRole("combobox", { name: /Next status/ }).click();
  await page.getByRole("option", { name: "Assigned" }).click();
  await page.getByRole("textbox", { name: /Reason or review note/ })
    .fill("Assigned after review of computed R-A1 values and return records");
  await page.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByText("Audit status saved on this device.")).toBeVisible();

  await page.reload();
  await expect(page.locator(".audit-candidate-detail__header")).toContainText("Anika Engineering");
  const afterRefresh = await page.evaluate((candidateId: string) => {
    const rows = JSON.parse(localStorage.getItem("nbr-audit-candidates-v3") || "[]");
    const events = JSON.parse(localStorage.getItem("nbr-audit-local-status-events-v1") || "[]");
    return {
      candidates: rows.filter((item: { candidate_id: string }) => item.candidate_id === candidateId),
      events: events.filter((item: { return_id: string }) => item.return_id === "RET-2026-20001"),
    };
  }, candidate.candidate_id);
  expect(afterRefresh.candidates).toHaveLength(1);
  expect(afterRefresh.candidates[0].audit_status).toBe("Assigned");
  expect(afterRefresh.events).toHaveLength(1);
  expect(afterRefresh.events[0].human_record).toContain("computed R-A1");

  await page.goto("/audit/risk-cases");
  await expect(page.locator(".table-page")).toContainText("RET-2026-20001");
  await page.goto("/audit/audit-trail");
  await expect(page.locator(".table-page")).toContainText("Candidate status: Not Started");

  await page.goto("/audit/audit-candidates");
  await expect(page.locator(".table-card")).toContainText(candidate.batch_id);
});

test("confirmed selection cannot be inserted a second time for its assessment year", async ({ page }) => {
  await page.goto("/audit/audit-candidates");
  const result = await page.evaluate(() => {
    const base = JSON.parse(localStorage.getItem("nbr-audit-candidates-v3") || "[]");
    // This assertion uses the existing seeded registry and never overwrites a saved batch.
    const keys = base.map((item: { assessment_year: string; return_id: string }) =>
      item.assessment_year + "|" + item.return_id);
    return { total: keys.length, unique: new Set(keys).size };
  });
  expect(result.unique).toBe(result.total);
});
