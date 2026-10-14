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
  await expect(table.locator("tbody tr").first()).toContainText("180/182(2)/182(4)/183(7)/289");
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
  await dialog.locator("#disposal_code").click();
  await page.getByRole("option", { name: /180.*Self-assessment return/ }).click();
  await dialog.getByRole("button", { name: "Create new Entry" }).click();
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
  await expect(dialog.getByRole("button", { name: "Create new Entry" })).toBeDisabled();
  await expect(dialog.getByText("Matches the selected assessment year.")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Add local draft" })).toHaveCount(0);

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
  await expect(dialog.getByRole("button", { name: "Create new Entry" })).toBeEnabled();
  await dialog.locator("#remarks").fill("Lookup flow test");
  await dialog.locator("#disposal_code").click();
  await page.getByRole("option", { name: /180.*Self-assessment return/ }).click();
  await dialog.getByRole("button", { name: "Create new Entry" }).click();
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
  await expect(dialog.getByRole("button", { name: "নতুন এন্ট্রি তৈরি করুন" })).toBeVisible();
  await expect(dialog.getByText("নির্বাচিত করবর্ষের সঙ্গে মিল থাকতে হবে।")).toHaveCount(0);
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
    const inputR = input!.closest(".MuiInputBase-root")!.getBoundingClientRect();
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
  await expect(dialog.getByRole("button", { name: "Create new Entry" })).toBeDisabled();
});

test("Register-4 mobile TIN search and button are equal-height touch targets with suggestions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register-stock/register-4");
  await page.getByRole("button", { name: /New Entry/i }).click();
  const dialog = page.getByRole("dialog");
  // Wait for the modal-enter scale animation to finish before measuring
  // the required 44px touch targets (intermediate transforms shrink bounds).
  await expect.poll(async () => dialog.locator(".register4-entry__search .MuiInputBase-root")
    .evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
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

test("Register-4 Section dropdown appends chronological selections and supports custom section", async ({ page }) => {
  await page.goto("/register-stock/register-4");
  await page.getByRole("button", { name: /New Entry/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("searchbox", { name: "Search TIN" }).fill("TIN-10000");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await dialog.locator("#disposal_code").click();
  await page.getByRole("option", { name: /180.*Self-assessment return/ }).click();
  await expect(dialog.locator("#disposal_code")).toHaveText("180");
  await dialog.locator("#disposal_code").click();
  await page.getByRole("option", { name: /182.*Audit selection/ }).click();
  await expect(dialog.locator("#disposal_code")).toHaveText("180/182");
  await dialog.getByRole("button", { name: "Add a section" }).click();
  await page.locator("#disposal_code-custom").fill("১৮৩(৭)");
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  await expect(dialog.locator("#disposal_code")).toHaveText("180/182/183(7)");
  await dialog.locator("#disposal_code").click();
  await expect(page.getByRole("option", {name:"Remove last"})).toHaveCount(0);
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Create new Entry" }).click();
  await expect(page.locator(".card-table__table")).toContainText("180/182");
});

test("Register-4 custom section rejects invalid code and English/Bangla form keeps its footer", async ({ page }) => {
  await page.goto("/register-stock/register-4");
  await page.getByRole("button", { name: /New Entry/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("searchbox", { name: "Search TIN" }).fill("TIN-10000");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  await dialog.getByRole("button", { name: "Add a section" }).click();
  await page.locator("#disposal_code-custom").fill("180/182");
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  await expect(page.getByText("Use a section number such as 182 or 183(7).")).toBeVisible();
  // The custom editor owns focus while open; inspect the underlying modal by DOM,
  // then close the editor before asserting the parent dialog's accessibility.
  await expect(page.locator(".app-modal-panel #disposal_code")).toContainText("Choose a section");
  await page.locator(".register4-section-field__popover").getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Create new Entry" }).click();
  await expect(dialog.locator(".entry-form__grid")).toBeVisible();
  await expect(dialog.locator(".app-modal-footer .app-btn")).toHaveCount(2);
});

test("Register-4 custom section popover never stretches New Entry form grid", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/register-stock/register-4");
  await page.getByRole("button", { name: /New Entry/i }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("searchbox", { name: "Search TIN" }).fill("TIN-10000");
  await dialog.getByRole("button", { name: "Search", exact: true }).click();
  // Use a DOM-stable locator: while MUI Popover owns focus, its Modal
  // accessibility layer temporarily hides the underlying dialog by design.
  const date = page.locator(".app-modal-panel #assessment_date");
  const previousTop = await date.evaluate(e => e.getBoundingClientRect().top);
  await dialog.getByRole("button", { name: "Add a section" }).click();
  await expect(page.locator(".register4-section-field__popover")).toBeVisible();
  const nextTop = await date.evaluate(e => e.getBoundingClientRect().top);
  expect(Math.abs(previousTop-nextTop)).toBeLessThanOrEqual(2);
  await expect(dialog.locator(".register4-section-field__custom")).toHaveCount(0);
  // The underlying form remains laid out, but is aria-hidden while MUI Popover owns focus.
  await expect(page.locator(".app-modal-panel .entry-form__grid")).toBeVisible();
  await page.locator("#disposal_code-custom").fill("183(7)");
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  await expect(dialog.locator("#disposal_code")).toContainText("183(7)");
  await expect(page.locator(".register4-section-field__popover")).toHaveCount(0);
  await page.screenshot({ path:"test-results/register4-section-form-clean.png", animations:"disabled" });
});

test("Register-4 mobile custom section overlay is contained on screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register-stock/register-4");
  await page.getByRole("button", { name: /New Entry/i }).click();
  const dialog=page.getByRole("dialog");
  await dialog.getByRole("searchbox", { name:"Search TIN" }).fill("TIN-10000");
  await dialog.getByRole("button", { name:"Search", exact:true }).click();
  await dialog.getByRole("button", { name: "Add a section" }).click();
  const popup=page.locator(".register4-section-field__popover");
  await expect(popup).toBeVisible();
  const r=await popup.evaluate(e=>{const r=e.getBoundingClientRect(); return {left:r.left,right:r.right,width:r.width};});
  expect(r.left).toBeGreaterThanOrEqual(0);
  expect(r.right).toBeLessThanOrEqual(390);
  await page.locator("#disposal_code-custom").fill("१८२"); // unsupported script
  await page.getByRole("button", {name:"Add section",exact:true}).click();
  await expect(page.getByText("Use a section number such as 182 or 183(7).")).toBeVisible();
  await page.screenshot({ path:"test-results/register4-section-mobile.png", animations:"disabled" });
});

test("Register-4 has no View Details buttons or Actions column, rows remain inspectable", async ({page}) => {
  await page.goto("/register-stock/register-4");
  const table=page.locator(".card-table__table");
  await expect(table.getByRole("columnheader",{name:"Actions"})).toHaveCount(0);
  await expect(table.getByRole("button",{name:/View Details/i})).toHaveCount(0);
  await table.locator("tbody tr").first().click();
  await expect(page.locator(".dynamic-drawer")).toBeVisible();
});
test("Register-4 shortcuts prefill section codes except first fresh entry", async ({page}) => {
  await page.goto("/register-stock/register-4");
  await page.getByRole("button",{name:/New Entry/i}).click();
  let dialog=page.getByRole("dialog");
  const chips=dialog.getByRole("group",{name:"TIN suggestions"});
  await expect(chips.getByRole("button")).toHaveCount(4);
  await expect(chips.getByRole("button",{name:"TIN-10000"})).toContainText("Fresh entry");
  await expect(chips.getByRole("button",{name:"TIN-10001"})).toContainText("180");
  await expect(chips.getByRole("button",{name:"TIN-10002"})).toContainText("180/180(2)");
  await expect(chips.getByRole("button",{name:"TIN-10003"})).toContainText("180/182/183(7)");
  await chips.getByRole("button",{name:"TIN-10000"}).click();
  await expect(dialog.locator("#disposal_code")).toContainText("Choose a section");
  await expect(dialog.locator(".entry-form__group-title")).toHaveCount(5);
  await expect(dialog.locator("#folio_no")).toHaveAttribute("readonly");
  await dialog.getByRole("button",{name:"Cancel"}).click();
  await page.getByRole("button",{name:/New Entry/i}).click();
  dialog=page.getByRole("dialog");
  await dialog.getByRole("group",{name:"TIN suggestions"}).getByRole("button",{name:"TIN-10003"}).click();
  await expect(dialog.locator("#disposal_code")).toContainText("180/182/183(7)");
  await dialog.locator("#disposal_code").click();
  await page.getByRole("option",{name:/289.*Appellate authority/}).click();
  await expect(dialog.locator("#disposal_code")).toContainText("180/182/183(7)/289");
});
test("Register-4 custom section Add is visible outside dropdown, balanced popover has no warning paragraph", async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto("/register-stock/register-4");
  await page.getByRole("button",{name:/New Entry/i}).click();
  const dialog=page.getByRole("dialog");
  await dialog.getByRole("group",{name:"TIN suggestions"}).getByRole("button",{name:"TIN-10000"}).click();
  const add=dialog.getByRole("button",{name:"Add a section"});
  await expect(add).toBeVisible();
  await add.click();
  const pop=page.locator(".register4-section-field__popover");
  await expect(pop).toBeVisible();
  await expect(pop).not.toContainText("draft-only");
  await expect(pop.getByRole("textbox",{name:"Section number"})).toBeVisible();
  const buttons=pop.locator(".register4-section-field__actions .app-btn");
  await expect(buttons).toHaveCount(2);
  const heights=await buttons.evaluateAll(els=>els.map(x=>x.getBoundingClientRect().height));
  expect(Math.abs(heights[0]-heights[1])).toBeLessThanOrEqual(1);
  await pop.getByRole("textbox",{name:"Section number"}).fill("১৮৩(৭)");
  await pop.getByRole("button",{name:"Add section",exact:true}).click();
  await expect(dialog.locator("#disposal_code")).toContainText("183(7)");
});

test("Register-4 blocks an unsupported transition and preserves the existing trail",async({page})=>{
  await page.goto("/register-stock/register-4");
  await page.getByRole("button",{name:/New Entry/i}).click();
  const d=page.getByRole("dialog");
  await d.getByRole("group",{name:"TIN suggestions"}).getByRole("button",{name:"TIN-10001"}).click();
  await expect(d.locator("#disposal_code")).toContainText("180");
  await d.locator("#disposal_code").click();
  await expect(page.getByRole("option",{name:/^292 — Tribunal/})).toBeDisabled();
  await page.keyboard.press("Escape");
  await d.getByRole("button",{name:"Add a section"}).click();
  await page.locator("#disposal_code-custom").fill("292");
  await page.getByRole("button",{name:"Add section",exact:true}).click();
  await expect(page.getByText("This section cannot follow the recorded sequence.",{exact:false})).toBeVisible();
  await page.locator(".register4-section-field__popover").getByRole("button",{name:"Cancel"}).click();
  await expect(d.locator("#disposal_code")).toContainText("180");
});
test("Register-4 available next stages follow the selected path; no Remove last",async({page})=>{
  await page.goto("/register-stock/register-4");
  await page.getByRole("button",{name:/New Entry/i}).click();
  const d=page.getByRole("dialog");
  await d.getByRole("group",{name:"TIN suggestions"}).getByRole("button",{name:"TIN-10003"}).click();
  await d.locator("#disposal_code").click();
  await expect(page.getByRole("option",{name:/289.*Appellate/})).toHaveCount(1);
  await expect(page.getByRole("option",{name:/180\(2\)/})).toHaveCount(0);
  await expect(page.getByRole("option",{name:"Remove last"})).toHaveCount(0);
});

// Each documented MoM preset remains in this existing select, even if not
// currently applicable. No extra controls or fabricated law permissions.
test("Register-4 displays ALL ten documented MoM combinations and disables unsupported paths",async({page})=>{
  await page.goto("/register-stock/register-4");
  await page.getByRole("button",{name:/New Entry/i}).click();
  const dialog=page.getByRole("dialog");
  await dialog.getByRole("group",{name:"TIN suggestions"})
    .getByRole("button",{name:"TIN-10000"}).click();
  await dialog.locator("#disposal_code").click();
  const all=["182/183(7)","183(7)","184","289/183(7)","289/184","292","292/183(7)","292/184","285","213"];
  for(const code of all){
    const item=page.getByRole("option",{name:new RegExp("^"+code.replaceAll("(", "\\(").replaceAll(")", "\\)")+" — ")});
    await expect(item).toHaveCount(1);
  }
  await expect(page.getByRole("option",{name:/^182\/183\(7\) — /})).toBeDisabled();
  await expect(page.getByRole("option",{name:/^289\/184 — /})).toBeDisabled();
  await expect(page.getByRole("option",{name:/^292 — /})).toBeDisabled();
  await page.keyboard.press("Escape");
  await dialog.locator("#disposal_code").click();
  await page.getByRole("option",{name:/^180 — /}).click();
  await dialog.locator("#disposal_code").click();
  await expect(page.getByRole("option",{name:/^182\/183\(7\) — /})).toBeEnabled();
  await page.getByRole("option",{name:/^182\/183\(7\) — /}).click();
  await expect(dialog.locator("#disposal_code")).toContainText("180/182/183(7)");
  await dialog.locator("#disposal_code").click();
  await page.getByRole("option",{name:/^289\/183\(7\) — /}).click();
  await expect(dialog.locator("#disposal_code")).toContainText("180/182/183(7)/289/183(7)");
});
test("Register-4 can add Tribunal outcome and subsequent assessment without losing original trail",async({page})=>{
  await page.goto("/register-stock/register-4");
  await page.getByRole("button",{name:/New Entry/i}).click();
  const d=page.getByRole("dialog");
  await d.getByRole("group",{name:"TIN suggestions"}).getByRole("button",{name:"TIN-10003"}).click();
  await d.locator("#disposal_code").click();
  await page.getByRole("option",{name:/^289 — /}).click();
  await d.locator("#disposal_code").click();
  await page.getByRole("option",{name:/^292\/184 — /}).click();
  await expect(d.locator("#disposal_code")).toContainText("180/182/183(7)/289/292/184");
  await d.locator("#disposal_code").click();
  await expect(page.getByRole("option",{name:/Remove last/})).toHaveCount(0);
});


test("Register-4 Add row inserts a single blank editable row and X discards without changing records", async({page})=>{
  await page.goto("/register-stock/register-4");
  const table=page.locator(".card-table__table");
  await expect(table.locator("tbody tr")).toHaveCount(8);
  await page.getByRole("button",{name:"Add row"}).click();
  const draft=table.getByTestId("register4-inline-row");
  await expect(draft).toBeVisible();
  await expect(draft.locator("td")).toHaveCount(14);
  await expect(draft.locator("#register4-inline-table-tin")).toHaveValue("");
  await expect(draft.locator("#register4-inline-table-assessed_income")).toHaveValue("");
  await expect(draft.getByRole("button",{name:"Save row"})).toBeVisible();
  await expect(draft.getByRole("button",{name:"Discard row"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Add row"})).toBeDisabled();
  await draft.getByRole("button",{name:"Discard row"}).click();
  await expect(draft).toHaveCount(0);
  await expect(table.locator("tbody tr")).toHaveCount(8);
  await expect(page.getByRole("button",{name:"Add row"})).toBeEnabled();
  await page.getByRole("button",{name:"New Entry"}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
test("Register-4 inline TIN lookup and section guard require valid values before tick save",async({page})=>{
  await page.goto("/register-stock/register-4");
  await page.getByRole("button",{name:"Add row"}).click();
  const draft=page.getByTestId("register4-inline-row");
  await draft.getByRole("button",{name:"Save row"}).click();
  await expect(draft.getByText("Enter a matching TIN")).toBeVisible();
  await draft.locator("#register4-inline-table-tin").fill("NO-MATCH");
  await expect(draft).toContainText("TIN not found in demo records");
  await draft.getByRole("button",{name:"Save row"}).click();
  await expect(draft).toBeVisible();
  await draft.locator("#register4-inline-table-tin").fill("TIN-10000");
  await expect(draft).toContainText("Rahman Enterprise");
  await expect(draft.locator("#register4-inline-table-circle")).toHaveValue("Circle-1");
  await expect(draft.locator("#register4-inline-table-assessment_year")).toContainText("2024-25");
  await draft.getByRole("button",{name:"Save row"}).click();
  await expect(draft).toContainText("Select an eligible section");
  await draft.locator("#register4-inline-table-disposal_code").click();
  await page.getByRole("option",{name:/^180 — /}).click();
  await draft.locator("#register4-inline-table-assessed_income").fill("12345");
  await draft.locator("#register4-inline-table-assessment_date").fill("2026-10-14");
  await draft.locator("#register4-inline-table-remarks").fill("Inline draft test");
  await draft.getByRole("button",{name:"Save row"}).click();
  await expect(draft).toHaveCount(0);
  await expect(page.locator(".card-table__table")).toContainText("Inline draft test");
  await expect(page.locator(".table-card__count")).toHaveText("9 records");
  await page.reload();
  await expect(page.locator(".card-table__table tbody tr")).toHaveCount(8);
});
test("Register-4 inline row keyboard Escape cancels and Enter saves a valid draft",async({page})=>{
  await page.goto("/register-stock/register-4");
  await page.getByRole("button",{name:"Add row"}).click();
  const row=page.getByTestId("register4-inline-row");
  await row.locator("#register4-inline-table-tin").fill("TIN-10003");
  await expect(row.locator("#register4-inline-table-disposal_code")).toContainText("180/182/183(7)");
  await row.locator("#register4-inline-table-remarks").fill("Keyboard save");
  await row.locator("#register4-inline-table-remarks").press("Enter");
  await expect(row).toHaveCount(0);
  await expect(page.locator(".card-table__table")).toContainText("Keyboard save");
  await page.getByRole("button",{name:"Add row"}).click();
  await page.getByTestId("register4-inline-row").locator("#register4-inline-table-tin").press("Escape");
  await expect(page.getByTestId("register4-inline-row")).toHaveCount(0);
});
test("Register-4 mobile inline draft uses per-field controls and 44px save/discard targets",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/register-stock/register-4");
  await page.getByRole("button",{name:"Add row"}).click();
  const card=page.getByRole("region",{name:"New row"});
  await expect(card).toBeVisible();
  await card.locator("#register4-inline-mobile-tin").fill("TIN-10003");
  await expect(card.locator("#register4-inline-mobile-tin")).toHaveValue("TIN-10003");
  await expect(card).toContainText("Matin Corp.");
  await expect(card).toContainText("180/182/183(7)");
  const buttons=card.getByRole("button",{name:/Save row|Discard row/});
  await expect(buttons).toHaveCount(2);
  const heights=await buttons.evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  await card.getByRole("button",{name:"Discard row"}).click();
  await expect(card).toHaveCount(0);
});

test("Register-4 inline TIN suggestions match modal controlled fixture and do not save on Enter",async({page})=>{
  await page.goto("/register-stock/register-4");
  await page.getByRole("button",{name:"Add row"}).click();
  const draft=page.getByTestId("register4-inline-row");
  const choices=page.getByRole("group",{name:"TIN suggestions"});
  await expect(choices).toHaveCount(0);
  await draft.locator("#register4-inline-table-tin").focus();
  await expect(choices.getByRole("button")).toHaveCount(4);
  await expect(choices.getByRole("button",{name:"TIN-10000"})).toContainText("Fresh entry");
  await expect(choices.getByRole("button",{name:"TIN-10003"})).toContainText("180/182/183(7)");
  await draft.locator("#register4-inline-table-tin").fill("TIN-100");
  await expect(choices.getByRole("button")).toHaveCount(4);
  await choices.getByRole("button",{name:"TIN-10003"}).click();
  await expect(draft).toContainText("Matin Corp.");
  await expect(draft.locator("#register4-inline-table-disposal_code")).toContainText("180/182/183(7)");
  await expect(choices).toHaveCount(0);
  await draft.locator("#register4-inline-table-tin").press("Enter");
  await expect(draft).toBeVisible();
  await expect(page.locator(".table-card__count")).toHaveText("8 records");
  await draft.locator("#register4-inline-table-assessed_income").fill("100");
  await draft.locator("#register4-inline-table-assessed_income").press("Enter");
  await expect(draft).toBeVisible();
  await draft.getByRole("button",{name:"Save row"}).click();
  await expect(draft).toHaveCount(0);
  await expect(page.locator(".table-card__count")).toHaveText("9 records");
});
test("Register-4 mobile inline TIN suggestions and Folio No parity with New Entry",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/register-stock/register-4");
  await page.getByRole("button",{name:"Add row"}).click();
  const card=page.getByRole("region",{name:"New row"});
  const folio=card.locator("#register4-inline-mobile-folio_no");
  await expect(folio).toBeVisible();
  await expect(folio).toHaveAttribute("readonly");
  await expect(folio).toHaveValue("");
  const options=page.getByRole("group",{name:"TIN suggestions"});
  await expect(options).toHaveCount(0);
  await card.locator("#register4-inline-mobile-tin").focus();
  await expect(options.getByRole("button",{name:"TIN-10002"})).toContainText("180/180(2)");
  await options.getByRole("button",{name:"TIN-10002"}).click();
  await expect(card.locator("#register4-inline-mobile-tin")).toHaveValue("TIN-10002");
  await expect(card.locator("#register4-inline-mobile-circle")).toHaveValue("Circle-1");
  await expect(card.locator("#register4-inline-mobile-disposal_code")).toContainText("180/180(2)");
  await expect(folio).toHaveValue("");
  await card.getByRole("button",{name:"Discard row"}).click();
  await expect(card).toHaveCount(0);
});

test("Register-4 inline row stays compact with TIN lookup as floating popper",async({page})=>{
  await page.setViewportSize({width:1736,height:900});
  await page.goto("/register-stock/register-4");
  await page.getByRole("button",{name:"Add row"}).click();
  const draft=page.getByTestId("register4-inline-row");
  const initial=await draft.boundingBox();
  expect(initial).not.toBeNull();
  expect(initial!.height).toBeLessThan(145);
  const tin=draft.locator("#register4-inline-table-tin");
  await tin.focus();
  const suggestions=page.getByRole("group",{name:"TIN suggestions"});
  await expect(suggestions).toBeVisible();
  const withPopup=await draft.boundingBox();
  expect(Math.abs(withPopup!.height-initial!.height)).toBeLessThanOrEqual(2);
  const popup=await suggestions.boundingBox();
  expect(popup).not.toBeNull();
  expect(popup!.width).toBeLessThan(360);
  await suggestions.getByRole("button",{name:"TIN-10003"}).click();
  await expect(draft.locator("#register4-inline-table-tin")).toHaveValue("TIN-10003");
  await expect(suggestions).toHaveCount(0);
  // Measure actual outlined field edges, not the Select's inner text baseline
  // (which MUI intentionally places ~8px below the outline's top edge).
  const outline=draft.locator(".register4-inline__cell--section .register4-section-field__select .MuiOutlinedInput-root");
  const add=draft.getByRole("button",{name:"Add a section"});
  const [sectionRect,addRect]=await Promise.all([outline.boundingBox(),add.boundingBox()]);
  expect(Math.abs(sectionRect!.y-addRect!.y)).toBeLessThan(2);
  expect(Math.abs(sectionRect!.height-addRect!.height)).toBeLessThan(2);
  await page.screenshot({path:"test-results/register4-inline-compact-desktop.png",animations:"disabled"});
  await draft.getByRole("button",{name:"Discard row"}).click();
});
test("Register-4 inline compact design remains usable and unclipped on mobile",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/register-stock/register-4");
  await page.getByRole("button",{name:"Add row"}).click();
  const card=page.getByRole("region",{name:"New row"});
  await card.locator("#register4-inline-mobile-tin").focus();
  const suggestions=page.getByRole("group",{name:"TIN suggestions"});
  await expect(suggestions).toBeVisible();
  const rect=await suggestions.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x+rect!.width).toBeLessThanOrEqual(391);
  await suggestions.getByRole("button",{name:"TIN-10002"}).click();
  await expect(card.locator("#register4-inline-mobile-folio_no")).toHaveAttribute("readonly");
  await expect(card.getByRole("button",{name:"Add a section"})).toBeVisible();
  await page.screenshot({path:"test-results/register4-inline-compact-mobile.png",animations:"disabled"});
  await card.getByRole("button",{name:"Discard row"}).click();
});
