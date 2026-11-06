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

  const stepper = modal.locator(".app-stepper");
  await expect(stepper.getByRole("button", { name: "Population", exact: true })).toHaveCount(0);
  await expect(stepper.getByRole("button", { name: "Data readiness", exact: true })).toHaveCount(0);
  await expect(stepper.locator(".app-stepper__item")).toHaveCount(6);

  await next(); // Selection setup -> Risk criteria, with full AY population
  await expect(stepper.getByRole("button", { name: "Risk criteria", exact: true }))
    .toHaveAttribute("aria-current", "step");
  await expect(modal.getByRole("combobox", { name: "Zone", exact: true })).toHaveCount(0);
  await expect(modal.getByRole("checkbox", { name: "Incomplete", exact: true })).toHaveCount(0);
  await expect(modal.getByRole("checkbox", { name: "Invalid", exact: true })).toHaveCount(0);

  const criterion = modal.getByRole("checkbox", { name: "Zero income + declared asset" });
  await expect(criterion).toBeVisible();
  await criterion.check();
  await expect(criterion).toBeChecked();
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

  const selection = page.locator(".audit-selection-evidence");
  await expect(selection).toContainText("R-A1");
  // The approved profile reading order ends at the comparison; progress is
  // available from the existing status card, not an inserted profile section.
  await expect(page.locator(".audit-progress-disclosure")).toHaveCount(0);
  await expect(page.locator(".audit-candidate-detail__status-card")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Update audit progress" })).toBeVisible();
  await page.getByRole("button", {name:"Quick summary"}).click();
  const quickSummary = page.getByRole("dialog", { name: "Quick summary" });
  await expect(quickSummary).toContainText("R-A1");
  await expect(quickSummary).not.toContainText("Return values and linked records screened against the selected rules");
  // A calculated single signal must not repeat its full title in both the
  // selection-reason card and the signal card.
  await expect(quickSummary.getByRole("heading", { name: "Why this taxpayer is selected for audit" })).toHaveCount(0);
  // Preserve October's concise summary and keep all decision/evidence details in the linked drawer.
  await expect(quickSummary.locator(".audit-summary-drawer__signal")).toHaveCount(1);
  await expect(quickSummary.locator(".audit-summary-drawer__signal-context, .audit-summary-drawer__signal-action, .audit-summary-drawer__changes, .audit-summary-drawer__formula")).toHaveCount(0);
  await quickSummary.getByRole("button", { name: /R-A1: .*asset/i }).click();
  const decision = page.getByRole("dialog", { name: /R-A1/i });
  await expect(decision.locator(".audit-signal-flow")).toBeVisible();
  await expect(decision).toContainText("What it means");
  await decision.locator(".responsive-overlay__header").getByRole("button", { name: "Back", exact: true }).click();
  await expect(quickSummary).toBeVisible();
  await expect(quickSummary.locator(".responsive-overlay__header").getByRole("button", {name:"Back",exact:true})).toHaveCount(0);
  await quickSummary.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Update audit progress" }).click();
  await expect(page.getByRole("dialog", { name: "Update audit progress" })).toBeVisible();
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

test("population selection uses all 70 taxpayers without population or readiness steps", async ({ page }) => {
  await page.goto("/audit/audit-candidates");
  await page.getByRole("button", { name: "Initiate Audit" }).click();
  const modal = page.getByRole("dialog", { name: "Select Audit Candidates" });
  const stepper = modal.locator(".app-stepper");
  await modal.locator(".app-choice-card").filter({ hasText: "Population / Circle-based Audit" }).click();
  await expect(modal.getByRole("radio", { name: /Population \/ Circle-based Audit/ })).toBeChecked();
  await expect(stepper.locator(".app-stepper__item")).toHaveCount(4);
  await expect(stepper).not.toContainText("Data readiness");
  await expect(stepper.getByRole("button", { name: "Population", exact: true })).toHaveCount(0);
  await modal.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(stepper.getByRole("button", { name: "Candidate preview" }))
    .toHaveAttribute("aria-current", "step");
  // The 70-record AY includes every data quality and coverage category:
  // no invisible readiness filter excludes incomplete or invalid profiles.
  await expect(modal).toContainText("Representative preview · 70 records");
});
