import { test, expect } from "@playwright/test";
import { ALL_TAXPAYER_ROWS } from "../src/app/pages/audit/auditData";

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

test("candidate preview supports searched single and multi-select removal without touching existing audits", async ({ page }) => {
  await page.goto("/audit/audit-candidates");
  await page.getByRole("button", { name: "Initiate Audit" }).click();
  const modal = page.getByRole("dialog", { name: "Select Audit Candidates" });
  const next = () => modal.getByRole("button", { name: "Continue", exact: true }).click();

  await next(); // Setup -> Risk criteria
  await modal.getByRole("checkbox", { name: "Reconciliation gap" }).check();
  await next(); // Risk criteria -> Screening
  await modal.getByRole("button", { name: "Start screening" }).click();
  await modal.getByRole("button", { name: "Continue to Candidate preview" }).click();

  const search = modal.getByRole("searchbox", { name: "Search candidates" });
  await expect(search).toBeVisible();
  const selectable = modal.locator(".audit-preview-candidate-list .audit-preview-selectable-row")
    .filter({ has: page.locator('input[type="checkbox"]:not(:disabled)') }).first();
  await expect(selectable).toBeVisible();
  const removedName = await selectable.locator(".audit-preview-candidate__main > strong").innerText();
  await search.fill(removedName);
  await modal.getByRole("checkbox", { name: `Select ${removedName}` }).check();
  await expect(modal.getByRole("button", { name: "Remove from audit" })).toBeVisible();

  // Checkbox state must survive switching from the list to the comparison display.
  await modal.getByRole("tab", { name: "Comparison" }).click();
  await expect(modal.getByRole("checkbox", { name: `Select ${removedName}` })).toBeChecked();
  await modal.getByRole("button", { name: "Remove from audit" }).click();
  await expect(modal.getByRole("button", { name: "Remove from audit" })).toHaveCount(0);
  await search.fill("");
  await modal.getByRole("tab", { name: "List" }).click();
  await expect(modal.locator(".audit-preview-candidate-list")).not.toContainText(removedName);

  // The excluded taxpayer cannot be reintroduced by the funnel/final confirmation.
  await next(); // Preview -> Funnel
  await next(); // Funnel -> Final list
  await expect(modal.locator(".app-selection-stack")).not.toContainText(removedName);
  await modal.getByRole("button", { name: "Back" }).click(); // Final -> Funnel
  await modal.getByRole("button", { name: "Back" }).click(); // Funnel -> Preview

  // Bulk selection applies to available candidates on the visible page only.
  const selectPage = modal.getByRole("checkbox", { name: "Select available on this page" });
  await expect(selectPage).toBeEnabled();
  await selectPage.check();
  await expect(modal.getByText(/selected/, { exact: false }).first()).toBeVisible();
  await modal.getByRole("button", { name: "Remove from audit" }).click();
  await expect(modal.getByRole("button", { name: "Remove from audit" })).toHaveCount(0);
  // Already-in-audit records are retained and their checkboxes cannot remove them.
  const locked = modal.locator(".audit-preview-candidate--locked").first();
  if (await locked.count()) {
    await expect(locked.locator("..").getByRole("checkbox")).toBeDisabled();
  }
});

test("create Audit, run R-A1 screening, confirm, review, refresh, and recover trail", async ({ page }) => {
  await page.goto("/audit/audit-candidates");
  await expect(page.locator(".audit-candidates-page")).toBeVisible();
  await page.getByRole("button", { name: "Initiate Audit" }).click();

  const modal = page.getByRole("dialog", { name: "Select Audit Candidates" });
  await expect(modal).toBeVisible();
  const next = () => modal.getByRole("button", { name: "Continue", exact: true }).click();

  const stepper = modal.locator(".app-stepper");
  await expect(stepper).toHaveCount(0); // Assessment Year is outside the progress indicator.

  await next(); // Assessment Year -> Risk criteria, with full AY population
  await expect(stepper.getByRole("button", { name: "Population", exact: true })).toHaveCount(0);
  await expect(stepper.getByRole("button", { name: "Data readiness", exact: true })).toHaveCount(0);
  await expect(stepper.locator(".app-stepper__item")).toHaveCount(5);
  await expect(stepper.locator(".app-stepper__label")).toHaveText([
    "Risk criteria", "Screening run", "Candidate preview", "Funnel", "Final list & confirm",
  ]);
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

  // Circle compilation is independent contextual evidence; it must not
  // replace the selected taxpayer list or disable final confirmation.
  const circle = modal.getByTestId("audit-circle-review");
  await expect(circle).toBeVisible();
  await expect(circle).toContainText("1,057");
  await expect(circle).toContainText("13,501,536");
  await expect(circle).toContainText("4,984,983");
  await expect(circle).toContainText("36.9%");
  const circleTable = circle.getByRole("table", { name: "Circle filing and TIN overview" });
  await expect(circleTable).toContainText("Circle-331 (Company)");
  await expect(circleTable).toContainText("Provisional 4/10");
  await circle.getByRole("searchbox", { name: "Search tax zone or Circle" }).fill("Circle-331");
  await expect(circle).toContainText("1 of 1,057 Circles match");
  await expect(circleTable).toContainText("809,661,593");
  await circle.getByRole("searchbox", { name: "Search tax zone or Circle" }).fill("no such circle");
  await expect(circle).toContainText("No Circles match this search.");
  await circle.getByRole("searchbox", { name: "Search tax zone or Circle" }).fill("");
  await expect(modal).toContainText("Anika Engineering");

  // Capture the actual addition in both viewports, using existing approved
  // modal + shared table/mobile-card patterns; this does not change selection.
  await circle.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/audit-circle-final-review-desktop.png" });
  const previousViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(circle.locator(".mobile-table-card-list")).toBeVisible();
  await expect(circle.locator(".mobile-table-card-list")).toContainText("Circle-331");
  const firstCircleCard = circle.locator(".mobile-table-card").first();
  await expect(firstCircleCard).toContainText("Provisional 4/10");
  await expect(firstCircleCard).toContainText("809,661,593");
  const mobileFooterFits = await firstCircleCard.evaluate(card => {
    const cardBox = card.getBoundingClientRect();
    const footer = card.querySelector(".mobile-table-card__footer");
    if (!footer) return false;
    const pieces = [
      footer.querySelector(".mobile-table-card__status"),
      footer.querySelector(".mobile-table-card__date"),
    ].filter(Boolean);
    return pieces.every(piece => {
      const box = piece!.getBoundingClientRect();
      return box.left >= cardBox.left - 1 && box.right <= cardBox.right + 1
        && piece!.scrollWidth <= piece!.clientWidth + 1;
    });
  });
  expect(mobileFooterFits).toBe(true);
  await page.screenshot({ path: "test-results/audit-circle-final-review-mobile.png" });
  if (previousViewport) await page.setViewportSize(previousViewport);

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

test("setup starts directly in the risk-based audit flow without a track selector", async ({ page }) => {
  await page.goto("/audit/audit-candidates");
  await page.getByRole("button", { name: "Initiate Audit" }).click();
  const modal = page.getByRole("dialog", { name: "Select Audit Candidates" });
  const stepper = modal.locator(".app-stepper");
  await expect(modal.getByText("Selection track", { exact: true })).toHaveCount(0);
  await expect(modal.locator('input[name="audit-track"]')).toHaveCount(0);
  await expect(modal.getByRole("combobox", { name: /Assessment Year/ })).toBeVisible();
  await expect(stepper).toHaveCount(0);
  await expect(modal.locator(".app-wizard-aside")).toHaveCount(0);
  await expect(modal.locator(".app-wizard-layout")).toHaveCount(0);
  const yearSection = modal.locator(".audit-year-setup");
  await expect(yearSection).toBeVisible();
  // The Assessment Year card spans the available modal body; it must not
  // reserve the previous 300px summary column or produce an empty panel.
  const initialGeometry = await modal.evaluate((dialog) => {
    const body = dialog.querySelector(".app-modal-body")!.getBoundingClientRect();
    const section = dialog.querySelector(".audit-year-setup")!.getBoundingClientRect();
    return { widthGap: body.width - section.width, height: dialog.getBoundingClientRect().height };
  });
  expect(initialGeometry.widthGap).toBeLessThanOrEqual(42);
  expect(initialGeometry.height).toBeLessThan(450);
  await modal.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(modal.locator(".app-wizard-aside")).toBeVisible();
  await expect(modal.locator(".app-wizard-layout")).toBeVisible();
  await expect(stepper.locator(".app-stepper__item")).toHaveCount(5);
  await expect(stepper).not.toContainText("Selection setup");
  await expect(stepper).not.toContainText("Data readiness");
  await expect(stepper.getByRole("button", { name: "Population", exact: true })).toHaveCount(0);
  await expect(stepper.getByRole("button", { name: "Risk criteria", exact: true }))
    .toHaveAttribute("aria-current", "step");
  await expect(modal.getByRole("checkbox", { name: "Zero income + declared asset" })).toBeVisible();
  await modal.getByRole("button", { name: "Back", exact: true }).click();
  await expect(stepper).toHaveCount(0);
  await expect(modal.locator(".app-wizard-aside")).toHaveCount(0);
  await expect(modal.locator(".audit-year-setup")).toBeVisible();
  await expect(modal.getByRole("combobox", { name: /Assessment Year/ })).toBeVisible();
  await modal.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(modal.locator(".app-wizard-aside")).toBeVisible();
  await expect(stepper.locator(".app-stepper__item")).toHaveCount(5);
});

test("exhausted risk preview recovers to remaining taxpayers without duplicating existing audits", async ({ page }) => {
  await page.goto("/audit/audit-candidates");
  // Wait for the existing candidate registry to hydrate and restore seed batches
  // before adding the saved-state scenario. Otherwise a later seed reconciliation
  // would duplicate test-injected identities by candidate ID.
  await expect(page.locator(".table-card")).toContainText("AUD-2026-RISK-01");
  await expect.poll(async () => page.evaluate(() =>
    JSON.parse(localStorage.getItem("nbr-audit-candidates-v3") || "[]").length)).toBeGreaterThan(0);
  // Reproduce the owner's saved browser state: all 55 signal-positive returns
  // have been selected in earlier Audit batches. Preserve existing seeded rows,
  // then add only the previous selections missing from the local registry.
  const previouslySelected = ALL_TAXPAYER_ROWS
    .filter((row) => /R-[A-E]\d/.test(String(row.signals)))
    .map((row) => ({
      return_id: String(row.return_id),
      assessment_year: String(row.assessment_year),
      taxpayer_name: String(row.taxpayer_name),
      tin: String(row.tin),
    }));
  await page.evaluate((previous) => {
    const key = "nbr-audit-candidates-v3";
    const current = JSON.parse(localStorage.getItem(key) || "[]");
    const selected = new Set(current.map((item: { assessment_year: string; return_id: string }) =>
      item.assessment_year + "|" + item.return_id));
    const missing = previous.filter((row) => !selected.has(row.assessment_year + "|" + row.return_id));
    const restored = missing.map((row) => ({
      ...row,
      candidate_id: "RESTORED-" + row.return_id,
      batch_id: "AUD-2026-EXISTING-TEST",
      audit_status: "Assigned",
      candidate_status: "Selected",
      selection_track: "Risk-based Audit",
    }));
    localStorage.setItem(key, JSON.stringify([...current, ...restored]));
  }, previouslySelected);
  await page.reload();

  await page.getByRole("button", { name: "Initiate Audit" }).click();
  const modal = page.getByRole("dialog", { name: "Select Audit Candidates" });
  const next = () => modal.getByRole("button", { name: "Continue", exact: true }).click();

  await next(); // Selection setup -> Risk criteria
  // Selecting all R-A1–R-E3 signals matches records already selected in Audit.
  // No existing record may be reinserted, overwritten, or silently reselected.
  await modal.getByRole("button", { name: "Select all", exact: true }).last().click();
  await next(); // Risk criteria -> Screening run
  await modal.getByRole("button", { name: "Start screening" }).click();
  await modal.getByRole("button", { name: "Continue to Candidate preview" }).click();
  await expect(modal.locator(".audit-preview-eligibility-summary"))
    .toContainText("0 available for this audit");
  await expect(modal).toContainText(/matching taxpayers are already in audit/);
  await expect(modal.getByRole("button", { name: "Change risk criteria" })).toBeEnabled();

  const recover = modal.getByRole("button", { name: /Review [1-9][0-9]* available taxpayers/ });
  await expect(recover).toBeEnabled();
  await recover.click(); // Explicit change to Population selection, not a silent override

  const stepper = modal.locator(".app-stepper");
  await expect(stepper.locator(".app-stepper__item")).toHaveCount(3);
  await expect(stepper.getByRole("button", { name: "Candidate preview" }))
    .toHaveAttribute("aria-current", "step");
  await expect(modal.locator(".audit-preview-eligibility-summary"))
    .toContainText("14 available for this audit");
  await expect(modal.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();

  await next(); // Population preview -> Funnel
  await next(); // Funnel -> Final list
  await expect(modal.getByRole("button", { name: "Confirm candidates" })).toBeEnabled();
  await modal.getByRole("button", { name: "Confirm candidates" }).click();
  await expect(modal).toHaveCount(0);

  const state = await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem("nbr-audit-candidates-v3") || "[]") as
      { return_id: string; assessment_year: string; batch_id: string }[];
    const identities = rows.map((item) => item.assessment_year + "|" + item.return_id);
    return {
      duplicateCount: identities.length - new Set(identities).size,
      newlyCreated: rows.filter((item) => item.batch_id.startsWith("AUD-202526-")).length,
    };
  });
  expect(state.duplicateCount).toBe(0);
  expect(state.newlyCreated).toBe(14);
});
