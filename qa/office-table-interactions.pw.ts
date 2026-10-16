import { test, expect, type Page } from '@playwright/test';

async function openOfficePage(page: Page, path: string) {
  await page.addInitScript(() => {
    localStorage.setItem('gov_ui_auth', JSON.stringify({ isAuthenticated: true, userId: 'admin' }));
    localStorage.setItem('i18nextLng', 'en');
  });
  await page.goto(path);
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('.table-card__toolbar')).toBeVisible();
}

async function chooseFilter(page: Page, key: string, value: string) {
  await page.locator(`#filter-${key}`).click();
  await page.getByRole('option', { name: value, exact: true }).click();
}

test('Online Return: date/year filters, reset, search and record details actually work', async ({ page }) => {
  await openOfficePage(page, '/return-register/online-return-register');
  await expect(page.locator('.table-card__count')).toContainText('38');
  await page.locator('.table-card__toolbar-btn').filter({ hasText: /Filter/i }).click();
  // The fixtures have no zone data. An unsupported zone selector must not pretend to work.
  await expect(page.locator('#filter-zone')).toHaveCount(0);
  await chooseFilter(page, 'ay', '2024-25');
  await page.locator('#filter-from').fill('2026-01-01');
  await page.locator('#filter-to').fill('2026-01-31');
  await page.getByRole('button', { name: /Apply Filters/i }).click();
  await expect(page.locator('.table-card__count')).toContainText('2');
  await expect(page.locator('.card-table__row')).toHaveCount(2);

  await page.locator('.applied-chips__clear').click();
  await expect(page.locator('.table-card__count')).toContainText('38');
  await page.locator('.table-card__search-wrapper input').fill('TIN-10000');
  await expect(page.locator('.table-card__count')).toContainText('1');
  await page.locator('.card-table__row').first().click();
  await expect(page.locator('.dynamic-drawer')).toBeVisible();
  await expect(page.locator('.dynamic-drawer')).toContainText('TIN-10000');
});

test('Tax Registry: status filter reads active_status, not an absent generic status', async ({ page }) => {
  await openOfficePage(page, '/register-stock/tax-registry');
  await page.locator('.table-card__toolbar-btn').filter({ hasText: /Filter/i }).click();
  await chooseFilter(page, 'status', 'Active');
  await page.getByRole('button', { name: /Apply Filters/i }).click();
  await expect(page.locator('.table-card__count')).toContainText('20');
  await expect(page.locator('.card-table__row')).toHaveCount(10);
  await expect(page.locator('.card-table__row').first()).toContainText('Active');
});

test('Audit Selection: method and status filters target their actual record columns', async ({ page }) => {
  await openOfficePage(page, '/administration/audit-selection');
  await page.locator('.table-card__toolbar-btn').filter({ hasText: /Filter/i }).click();
  await chooseFilter(page, 'method', 'Random');
  await chooseFilter(page, 'status', 'In Progress');
  await page.getByRole('button', { name: /Apply Filters/i }).click();
  await expect(page.locator('.table-card__count')).toContainText('2');
  await expect(page.locator('.card-table__row')).toHaveCount(2);
  await expect(page.locator('.card-table__row').first()).toContainText('Random');
  await expect(page.locator('.card-table__row').first()).toContainText('In Progress');
});
