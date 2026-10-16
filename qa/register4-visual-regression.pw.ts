import {expect, test, type Page} from '@playwright/test';

/**
 * Matched-state pixel comparisons against owner-approved images captured at
 * c168edb28d4627b970e130309ba074bf192530be (14 images, SHA-256 locked in
 * qa/ui-regression-contract.json). Never update snapshots as part of an ordinary
 * product UI change: proposed changes require fresh, explicit owner approval.
 */
const desktop = {width: 1440, height: 900};
const mobile = {width: 390, height: 844};

async function openRegister(page: Page, locale: 'en' | 'bn', viewport = desktop) {
  await page.setViewportSize(viewport);
  await page.addInitScript(language => {
    localStorage.setItem('gov_ui_auth', JSON.stringify({isAuthenticated: true, userId: 'admin'}));
    localStorage.setItem('gov_ui_settings', JSON.stringify({
      assessmentYear: '2024-25', themeId: 'indigo-blue', fontId: 'inter',
      fontSizeId: 'standard', languageId: language,
    }));
    localStorage.setItem('i18nextLng', language);
  }, locale);
  await page.goto('/register-stock/register-4');
  await expect(page.locator('.app-shell')).toBeVisible();
}

async function compare(page: Page, state: string) {
  const screenshot = await page.screenshot({animations: 'disabled', caret: 'hide'});
  // This is a real image snapshot comparison, not a capture-only assertion.
  await expect(screenshot).toMatchSnapshot(`${state}.png`, {maxDiffPixels: 0});
}

async function openModal(page: Page, locale: 'en' | 'bn') {
  await page.getByRole('button', {name: locale === 'bn' ? /নতুন এন্ট্রি/ : /New Entry/i}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function populateLookup(page: Page, locale: 'en' | 'bn') {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('searchbox', {name: locale === 'bn' ? 'টিআইএন অনুসন্ধান' : 'Search TIN'}).fill('TIN-10000');
  await dialog.getByRole('button', {name: locale === 'bn' ? 'অনুসন্ধান' : 'Search', exact: true}).click();
  await expect(dialog.locator('.entry-form__grid')).toBeVisible();
  return dialog;
}

for (const locale of ['en', 'bn'] as const) {
  test(`approved table.${locale}.closed`, async ({page}) => {
    await openRegister(page, locale);
    await expect(page.locator('.card-table__table tbody tr')).toHaveCount(8);
    await compare(page, `table.${locale}.closed`);
  });

  test(`approved modal.${locale}.lookup`, async ({page}) => {
    await openRegister(page, locale);
    const dialog = await openModal(page, locale);
    await expect(dialog.locator('.entry-form__grid')).toHaveCount(0);
    await compare(page, `modal.${locale}.lookup`);
  });

  test(`approved modal.${locale}.filled`, async ({page}) => {
    await openRegister(page, locale);
    await openModal(page, locale);
    await populateLookup(page, locale);
    await compare(page, `modal.${locale}.filled`);
  });

  test(`approved modal.${locale}.section-open`, async ({page}) => {
    await openRegister(page, locale);
    await openModal(page, locale);
    const dialog = await populateLookup(page, locale);
    await dialog.locator('#disposal_code').click();
    await expect(page.getByRole('option').first()).toBeVisible();
    await compare(page, `modal.${locale}.section-open`);
  });

  test(`approved inline.${locale}.open`, async ({page}) => {
    await openRegister(page, locale);
    await page.getByRole('button', {name: locale === 'bn' ? /সারি যোগ করুন/ : /Add row/i}).click();
    await expect(page.getByTestId('register4-inline-row')).toBeVisible();
    await compare(page, `inline.${locale}.open`);
  });

  test(`approved modal.mobile.${locale}`, async ({page}) => {
    await openRegister(page, locale, mobile);
    await openModal(page, locale);
    await populateLookup(page, locale);
    await compare(page, `modal.mobile.${locale}`);
  });

  test(`approved inline.mobile.${locale}`, async ({page}) => {
    await openRegister(page, locale, mobile);
    await page.getByRole('button', {name: locale === 'bn' ? /সারি যোগ করুন/ : /Add row/i}).click();
    const editor = page.locator('.register4-inline__mobile');
    await expect(editor).toBeVisible();
    await editor.scrollIntoViewIfNeeded();
    await compare(page, `inline.mobile.${locale}`);
  });
}
