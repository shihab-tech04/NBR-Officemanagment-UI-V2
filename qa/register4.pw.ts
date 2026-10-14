import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gov_ui_auth", JSON.stringify({ isAuthenticated: true, userId: "admin" }));
    if (!localStorage.getItem("gov_ui_settings")) localStorage.setItem("gov_ui_settings", JSON.stringify({
      assessmentYear: "2024-25", themeId: "indigo-blue", fontId: "inter",
      fontSizeId: "standard", languageId: "en",
    }));
  });
});

test("Register-4 desktop preserves shared table and scopes sample rows to selected AY", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/register-stock/register-4");
  await expect(page.locator(".app-shell")).toBeVisible();
  const table = page.locator(".card-table__table");
  await expect(table).toBeVisible();
  await expect(table.locator("tbody tr")).toHaveCount(8);
  await expect(page.locator(".register4-workspace")).toHaveCount(0);
  await expect(table.locator("tbody tr").first()).toContainText("DEMO-001");
  await expect(table.locator("tbody tr").first()).toContainText("8,40,000");
  await expect(table.locator("tbody tr").first().locator("td").nth(3)).toBeEmpty();

  await expect(table.getByRole("columnheader", { name: "Created Demand / Allocation" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Arrear Tax Year" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Current Tax Year" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Book No." })).toHaveCount(0);
  await expect(page.locator(".table-page__header .table-page__desc")).toHaveText("Monthly tax assessment register.");
  await expect(page.getByText("Illustrative sample records; not verified tax assessments.", { exact: false })).toHaveCount(0);
  await expect(page.locator(".table-page > [role=note]")).toHaveCount(0);
  await expect(page.getByText("Issued", { exact: true })).toHaveCount(0);
  const sorter = table.getByRole("button", { name: "Sort by Taxpayer Name & TIN" });
  await sorter.click();
  await expect(sorter).toHaveClass(/card-table__sort-button--active/);
  await page.screenshot({ path: "test-results/register4-verified-desktop.png", fullPage: true, animations: "disabled" });
});

test("Register-4 date filters actually change results, and local draft is session-only", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/register-stock/register-4");
  const table = page.locator(".card-table__table");
  await expect(table.locator("tbody tr")).toHaveCount(8);
  await page.locator(".table-card__toolbar").getByRole("button", { name: "Filter" }).click();
  await page.locator("#filter-from").fill("2027-01-01");
  await page.getByRole("button", { name: "Apply Filters" }).click();
  await expect(table.locator(".card-table__empty")).toBeVisible();
  // Clear the applied date range using the established chips control.
  await page.locator(".applied-chips__clear").click();
  await expect(table.locator("tbody tr")).toHaveCount(8);

  await page.getByRole("button", { name: /New Entry/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Taxpayer Name" }).fill("E2E Synthetic Test");
  await dialog.getByRole("textbox", { name: "TIN" }).fill("DEMO-123456");
  await dialog.getByRole("button", { name: "Add local draft" }).click();
  await expect(table.locator("tbody tr")).toHaveCount(9);
  await expect(table.getByText("E2E Synthetic Test (DEMO-123456)")).toBeVisible();
  await page.reload();
  await expect(table.locator("tbody tr")).toHaveCount(8);
});

test("Register-4 mobile uses the existing readable card pattern", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register-stock/register-4");
  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.locator(".card-table")).toBeHidden();
  const cards = page.locator(".mobile-table-card-list .mobile-table-card");
  await expect(cards).toHaveCount(8);
  await expect(cards.first()).toContainText("Circle-1");
  await cards.first().click();
  await expect(page.locator(".dynamic-drawer")).toBeVisible();
  await page.screenshot({ path: "test-results/register4-verified-mobile.png", fullPage: true, animations: "disabled" });
});

test("Register-4 Bangla uses concise approved description with no added disclaimer section", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/register-stock/register-4");
  await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem("gov_ui_settings") || "{}");
    localStorage.setItem("gov_ui_settings", JSON.stringify({ ...settings, languageId: "bn" }));
    localStorage.setItem("i18nextLng", "bn");
  });
  await page.reload();
  await expect(page.locator(".table-page__header .table-page__desc")).toHaveText("মাসিক কর নির্ধারণ বিবরণী");
  await expect(page.getByText(/শুধুমাত্র নমুনা তথ্য|এগুলো কেবল উদাহরণমূলক/)).toHaveCount(0);
  await expect(page.locator(".table-page > [role=note]")).toHaveCount(0);
  const table = page.locator(".card-table__table");
  await expect(table).toBeVisible();
  await expect(table.locator("thead th").filter({ hasText: "করদাতার নাম" })).toHaveText("করদাতার নাম\nও টিআইএন");
  await expect(table.locator("thead th").filter({ hasText: "ক্রমিক" })).toHaveText("ক্রমিক");
  await expect(table.locator("thead th").filter({ hasText: "সৃষ্ট দাবি/বিভক্তি" })).toHaveText("সৃষ্ট দাবি/বিভক্তি");
  await expect(table.locator("thead th").filter({ hasText: "বকেয়া কর বর্ষের" })).toHaveText("বকেয়া কর বর্ষের");
  await expect(table.locator("thead th").filter({ hasText: "চলতি কর বর্ষের" })).toHaveText("চলতি কর বর্ষের");
  await expect(table.locator("thead .card-table__th-text--multiline")).toHaveCount(1);
  await page.screenshot({ path: "test-results/register4-bn-exact-heading.png", fullPage: true, animations: "disabled" });
});

test("Register-4 and Stock Register retain identical page shell and four-column KPI fit", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/register-stock/register-4");
  const firstShell = await page.locator(".table-page").evaluate(el => {
    const rect = el.getBoundingClientRect();
    const parent = el.parentElement?.getBoundingClientRect();
    return { width: rect.width, parentWidth: parent?.width ?? 0 };
  });
  expect(firstShell.width).toBeLessThanOrEqual(firstShell.parentWidth + 2);
  await expect(page.locator(".table-page > .kpi-section__panel .stat-card")).toHaveCount(4);
  const cards = await page.locator(".table-page > .kpi-section__panel .stat-card").evaluateAll(cards => cards.map(el => {
    const rect=el.getBoundingClientRect();
    return { left:rect.left, right:rect.right };
  }));
  const viewportWidth=page.viewportSize()!.width;
  for(const card of cards){expect(card.left).toBeGreaterThanOrEqual(0);expect(card.right).toBeLessThanOrEqual(viewportWidth+2);}
  await page.goto("/register-stock/stock-register");
  await expect(page.locator(".table-page")).toBeVisible();
  await expect(page.locator(".register4-workspace")).toHaveCount(0);
});

test("Register-4 headers and cells use content alignment while Stock Register keeps locked defaults", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/register-stock/register-4");
  const table = page.locator(".card-table__table");
  await expect(table.locator("tbody tr")).toHaveCount(8);
  const expected = [
    "center", "left", "left", "left", "left", "center", "center",
    "right", "right", "right", "right", "right", "left",
  ];
  const actual = await table.locator("tbody tr").first().locator("td.card-table__td").evaluateAll(cells =>
    cells.map(cell => window.getComputedStyle(cell).textAlign)
  );
  expect(actual).toEqual(expected);

  for (const [name, alignment] of [
    ["S/N", "center"], ["Circle", "left"], ["Taxpayer Name & TIN", "left"],
    ["Assessment Year", "center"], ["Assessment Date", "center"],
    ["Assessed Income", "right"], ["Arrear Tax Year", "right"],
    ["Current Tax Year", "right"], ["Remarks (if any)", "left"],
  ]) {
    const header = table.getByRole("columnheader", { name, exact: true });
    await expect(header).toHaveCSS("text-align", alignment);
  }
  await expect(table.locator("tbody tr").first().locator("td").nth(3)).toBeEmpty();

  await page.goto("/register-stock/stock-register");
  const stockTable = page.locator(".card-table__table");
  await expect(stockTable).toBeVisible();
  await expect(stockTable.locator(".card-table__th--align-left, .card-table__th--align-center, .card-table__th--align-right")).toHaveCount(0);
  await expect(stockTable.locator("tbody tr").first().locator("td.card-table__td").first()).toHaveCSS("text-align", "left");
});
