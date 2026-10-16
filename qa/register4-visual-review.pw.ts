import {expect, test, type Page} from "@playwright/test";

/**
 * Capture the fourteen protected Register-4 states for independent review.
 * These files are proposed evidence, never approved goldens or visual diffs.
 * No Save, Submit, Pay, or record-changing control is activated.
 */
const desktop = {width: 1440, height: 900};
const mobile = {width: 390, height: 844};

async function openRegister(page: Page, locale: "en" | "bn", viewport = desktop) {
  await page.setViewportSize(viewport);
  await page.addInitScript(language => {
    localStorage.setItem("gov_ui_auth", JSON.stringify({isAuthenticated: true, userId: "admin"}));
    localStorage.setItem("gov_ui_settings", JSON.stringify({
      assessmentYear: "2024-25", themeId: "indigo-blue", fontId: "inter",
      fontSizeId: "standard", languageId: language,
    }));
    localStorage.setItem("i18nextLng", language);
  }, locale);
  await page.goto("/register-stock/register-4");
  await expect(page.locator(".app-shell")).toBeVisible();
}

async function capture(page: Page, state: string) {
  await page.screenshot({
    path: `test-results/register4-visual-review/${state}.png`,
    animations: "disabled",
    caret: "hide",
  });
}

async function openModal(page: Page, locale: "en" | "bn") {
  await page.getByRole("button", {name: locale === "bn" ? /নতুন এন্ট্রি/ : /New Entry/i}).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function populateLookup(page: Page, locale: "en" | "bn") {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("searchbox", {name: locale === "bn" ? "টিআইএন অনুসন্ধান" : "Search TIN"}).fill("TIN-10000");
  await dialog.getByRole("button", {name: locale === "bn" ? "অনুসন্ধান" : "Search", exact: true}).click();
  await expect(dialog.locator(".entry-form__grid")).toBeVisible();
  return dialog;
}

for (const locale of ["en", "bn"] as const) {
  test(`visual-review table.${locale}.closed (unapproved capture)`, async ({page}) => {
    await openRegister(page, locale);
    await expect(page.locator(".card-table__table tbody tr")).toHaveCount(8);
    await capture(page, `table.${locale}.closed`);
  });

  test(`visual-review modal.${locale}.lookup (unapproved capture)`, async ({page}) => {
    await openRegister(page, locale);
    const dialog = await openModal(page, locale);
    await expect(dialog.locator(".entry-form__grid")).toHaveCount(0);
    await capture(page, `modal.${locale}.lookup`);
  });

  test(`visual-review modal.${locale}.filled (unapproved capture)`, async ({page}) => {
    await openRegister(page, locale);
    await openModal(page, locale);
    await populateLookup(page, locale);
    await capture(page, `modal.${locale}.filled`);
  });

  test(`visual-review modal.${locale}.section-open (unapproved capture)`, async ({page}) => {
    await openRegister(page, locale);
    await openModal(page, locale);
    const dialog = await populateLookup(page, locale);
    await dialog.locator("#disposal_code").click();
    await expect(page.getByRole("option").first()).toBeVisible();
    await capture(page, `modal.${locale}.section-open`);
  });

  test(`visual-review inline.${locale}.open (unapproved capture)`, async ({page}) => {
    await openRegister(page, locale);
    await page.getByRole("button", {name: locale === "bn" ? /সারি যোগ করুন/ : /Add row/i}).click();
    await expect(page.getByTestId("register4-inline-row")).toBeVisible();
    await capture(page, `inline.${locale}.open`);
  });

  test(`visual-review modal.mobile.${locale} (unapproved capture)`, async ({page}) => {
    await openRegister(page, locale, mobile);
    await openModal(page, locale);
    await populateLookup(page, locale);
    await capture(page, `modal.mobile.${locale}`);
  });

  test(`visual-review inline.mobile.${locale} (unapproved capture)`, async ({page}) => {
    await openRegister(page, locale, mobile);
    await page.getByRole("button", {name: locale === "bn" ? /সারি যোগ করুন/ : /Add row/i}).click();
    const editor = page.locator(".register4-inline__mobile");
    await expect(editor).toBeVisible();
    await editor.scrollIntoViewIfNeeded();
    await capture(page, `inline.mobile.${locale}`);
  });
}
