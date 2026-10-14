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
  await dialog.getByRole("searchbox", { name: "Search TIN" }).fill("TIN-10000");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Taxpayer details" })).toContainText("Rahman Enterprise");
  await dialog.getByRole("button", { name: "Add local draft" }).click();
  await expect(table.locator("tbody tr")).toHaveCount(9);
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
    ["Tax Year", "center"], ["Assessment Date", "center"],
    ["Assessed Income", "right"], ["Arrear Tax Year", "right"],
    ["Current Tax Year", "right"], ["Remarks (if any)", "left"],
  ]) {
    const header = table.getByRole("button", { name: `Sort by ${name}`, exact: true }).locator("..");
    await expect(header).toHaveCSS("text-align", alignment);
  }
  await expect(table.locator("tbody tr").first().locator("td").nth(3)).toBeEmpty();

  await page.goto("/register-stock/stock-register");
  const stockTable = page.locator(".card-table__table");
  await expect(stockTable).toBeVisible();
  await expect(stockTable.locator(".card-table__th--align-left, .card-table__th--align-center, .card-table__th--align-right")).toHaveCount(0);
  await expect(stockTable.locator("tbody tr").first().locator("td.card-table__td").first()).toHaveCSS("text-align", "left");
});

test("Register-4 New Entry resolves TIN before showing the assessment form and uses modal footer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/register-stock/register-4");
  await page.getByRole("button", { name: /New Entry/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("searchbox", { name: "Search TIN" })).toBeVisible();
  await expect(dialog.locator(".entry-form__grid")).toHaveCount(0);
  await expect(dialog.locator(".app-modal-footer .app-btn")).toHaveCount(2);
  await expect(dialog.getByRole("button", { name: "Add local draft" })).toBeDisabled();

  await dialog.getByRole("searchbox", { name: "Search TIN" }).fill("NOT-A-TIN");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("No taxpayer found for this TIN.");
  await expect(dialog.locator(".entry-form__grid")).toHaveCount(0);

  await dialog.getByRole("searchbox", { name: "Search TIN" }).fill("tin-10000");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Taxpayer details" })).toContainText("Rahman Enterprise");
  await expect(dialog.getByRole("region", { name: "Taxpayer details" })).toContainText("TIN-10000");
  await expect(dialog.getByRole("region", { name: "Taxpayer details" })).toContainText("Circle-1");
  await expect(dialog.locator(".entry-form__grid")).toBeVisible();
  await expect(dialog.locator("#circle")).toHaveValue("Circle-1");
  await expect(dialog.locator("#assessment_year")).toContainText("2024-25");
  await expect(dialog.locator("#taxpayer_name")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Add local draft" })).toBeEnabled();
  await dialog.locator("#remarks").fill("Lookup flow test");
  await dialog.getByRole("button", { name: "Add local draft" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".card-table__table")).toContainText("Rahman Enterprise (TIN-10000)");
  await page.reload();
  await expect(page.locator(".card-table__table tbody tr")).toHaveCount(8);
});

test("Register-4 New Entry stays usable in mobile bottom sheet with one-column form and footer buttons", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register-stock/register-4");
  await page.getByRole("button", { name: /New Entry/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("searchbox", { name: "Search TIN" }).fill("TIN-10001");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Taxpayer details" })).toContainText("Karim & Sons");
  await expect(dialog.locator(".entry-form__grid")).toHaveCSS("grid-template-columns", /^(3[0-9][0-9]|[2-9][0-9][0-9])px$/);
  const footer = dialog.locator(".app-modal-footer");
  await expect(footer).toBeVisible();
  await expect(footer.locator(".app-btn")).toHaveCount(2);
  const buttons = await footer.locator(".app-btn").evaluateAll(els => els.map(el => {
    const r = el.getBoundingClientRect(); return { top:r.top, bottom:r.bottom, width:r.width };
  }));
  expect(buttons[0].top).toBeCloseTo(buttons[1].top, 0);
  expect(buttons[0].width).toBeGreaterThan(80);
  await page.screenshot({ path: "test-results/register4-entry-mobile.png", animations: "disabled" });
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
});

test("Register-4 TIN lookup and footer labels resolve in Bangla without adding a stepper", async ({ page }) => {
  await page.goto("/register-stock/register-4");
  await page.evaluate(() => {
    const current = JSON.parse(localStorage.getItem("gov_ui_settings") || "{}");
    localStorage.setItem("gov_ui_settings", JSON.stringify({ ...current, languageId: "bn" }));
    localStorage.setItem("i18nextLng", "bn");
  });
  await page.reload();
  await page.getByRole("button", { name: /নতুন এন্ট্রি/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("searchbox", { name: "টিআইএন অনুসন্ধান" })).toBeVisible();
  await expect(dialog.locator(".stepper, .app-stepper")).toHaveCount(0);
  await dialog.getByRole("searchbox", { name: "টিআইএন অনুসন্ধান" }).fill("TIN-10000");
  await dialog.getByRole("button", { name: "অনুসন্ধান", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "করদাতার তথ্য" })).toContainText("Rahman Enterprise");
  await expect(dialog.getByRole("button", { name: "স্থানীয় খসড়া যোগ করুন" })).toBeVisible();
});

test("Register-4 TIN suggestions sit below the search row and select a taxpayer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/register-stock/register-4");
  await page.getByRole("button", { name: /New Entry/i }).click();
  const dialog = page.getByRole("dialog");
  const search = dialog.getByRole("searchbox", { name: "Search TIN" });
  const suggestions = dialog.getByRole("group", { name: "TIN suggestions" });
  await expect(suggestions.getByRole("button")).toHaveCount(4);
  await expect(suggestions.getByRole("button", { name: "TIN-10000" })).toBeVisible();
  const rects = await dialog.evaluate((root) => {
    const input = root.querySelector('input[type="search"]');
    const button = [...root.querySelectorAll("button")].find(el => el.textContent?.trim() === "Search");
    const chips = root.querySelector(".register4-entry__suggestions");
    const inputR = input!.getBoundingClientRect();
    const buttonR = button!.getBoundingClientRect();
    const chipsR = chips!.getBoundingClientRect();
    return { inputHeight: inputR.height, buttonHeight: buttonR.height,
      inputRight: inputR.right, buttonLeft: buttonR.left,
      inputBottom: inputR.bottom, suggestionTop: chipsR.top };
  });
  expect(Math.abs(rects.inputHeight - rects.buttonHeight)).toBeLessThanOrEqual(1);
  expect(rects.buttonLeft).toBeGreaterThan(rects.inputRight);
  expect(rects.suggestionTop).toBeGreaterThan(rects.inputBottom);

  await search.fill("TIN-10002");
  await expect(suggestions.getByRole("button")).toHaveCount(1);
  await suggestions.getByRole("button", { name: "TIN-10002" }).click();
  await expect(search).toHaveValue("TIN-10002");
  await expect(dialog.getByRole("region", { name: "Taxpayer details" })).toContainText("TIN-10002");
  await expect(suggestions).toHaveCount(0);

  await search.fill("NO-MATCH");
  await expect(suggestions).toHaveCount(0);
  await expect(dialog.getByRole("region", { name: "Taxpayer details" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Add local draft" })).toBeDisabled();
});

test("Register-4 mobile TIN search and button are equal-height touch targets with suggestions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register-stock/register-4");
  await page.getByRole("button", { name: /New Entry/i }).click();
  const dialog = page.getByRole("dialog");
  const sizes = await dialog.evaluate((root) => {
    const searchInput = root.querySelector('input[type="search"]')!;
    const searchButton = [...root.querySelectorAll("button")].find(el => el.textContent?.trim() === "Search")!;
    const field = searchInput.closest(".MuiInputBase-root")!;
    const suggestion = root.querySelector(".register4-entry__suggestion")!;
    return {
      fieldHeight: field.getBoundingClientRect().height,
      buttonHeight: searchButton.getBoundingClientRect().height,
      suggestionHeight: suggestion.getBoundingClientRect().height,
      buttonRight: searchButton.getBoundingClientRect().right,
      dialogRight: root.getBoundingClientRect().right,
    };
  });
  expect(sizes.fieldHeight).toBeGreaterThanOrEqual(44);
  expect(Math.abs(sizes.fieldHeight - sizes.buttonHeight)).toBeLessThanOrEqual(1);
  expect(sizes.suggestionHeight).toBeGreaterThanOrEqual(44);
  expect(sizes.buttonRight).toBeLessThanOrEqual(sizes.dialogRight + 1);
  await dialog.getByRole("group", { name: "TIN suggestions" }).getByRole("button", { name: "TIN-10000" }).click();
  await expect(dialog.getByRole("region", { name: "Taxpayer details" })).toContainText("Rahman Enterprise");
});

test("Register-4 Bangla TIN suggestions use translation and preserve direct search", async ({ page }) => {
  await page.goto("/register-stock/register-4");
  await page.evaluate(() => {
    const settings = JSON.parse(localStorage.getItem("gov_ui_settings") || "{}");
    localStorage.setItem("gov_ui_settings", JSON.stringify({ ...settings, languageId: "bn" }));
    localStorage.setItem("i18nextLng", "bn");
  });
  await page.reload();
  await page.getByRole("button", { name: /নতুন এন্ট্রি/ }).click();
  const dialog = page.getByRole("dialog");
  const suggestions = dialog.getByRole("group", { name: "টিআইএন পরামর্শ" });
  await expect(suggestions.getByRole("button")).toHaveCount(4);
  await suggestions.getByRole("button", { name: "TIN-10000" }).click();
  await expect(dialog.getByRole("region", { name: "করদাতার তথ্য" })).toContainText("Rahman Enterprise");
});
