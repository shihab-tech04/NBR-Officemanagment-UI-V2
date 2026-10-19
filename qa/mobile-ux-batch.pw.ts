import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('notifications form an accessible bottom sheet and actions remain usable', async ({ page }) => {
  await page.goto('/dashboard/psr-dashboard');
  await page.locator('.mobile-topbar__notification-button').click();
  const sheet = page.getByRole('dialog', { name: 'Notifications' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Security', exact: true })).toBeVisible();
  const title = await sheet.getByRole('heading', { name: 'Notifications' }).boundingBox();
  const close = await sheet.getByRole('button', { name: 'Close notifications' }).boundingBox();
  expect(title).not.toBeNull(); expect(close).not.toBeNull();
  expect(title!.x + title!.width).toBeLessThanOrEqual(close!.x + 1);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await sheet.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.notification-dropdown__unread-badge')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Unread' }).click();
  await expect(sheet.locator('.notification-dropdown__empty')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
});

test('circle-wise status heading receives its own readable mobile row', async ({ page }) => {
  await page.goto('/dashboard/combined-dashboard?zone=Taxes%20Zone%2C%20Barishal');
  const group = page.locator('.combined-dashboard-page .table-card__title-group');
  const back = await group.getByRole('button', { name: 'Back to Zones' }).boundingBox();
  const heading = await group.getByRole('heading', { name: 'Circle-wise Double Entry Status' }).boundingBox();
  expect(back).not.toBeNull(); expect(heading).not.toBeNull();
  expect(heading!.width).toBeGreaterThan(230);
  expect(heading!.y).toBeGreaterThanOrEqual(back!.y + back!.height - 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('activity-report roles are readable and searchable without a full-height menu', async ({ page }) => {
  await page.goto('/report/user-activity-report');
  const role = page.locator('#user-activity-user-type');
  await expect(role).toHaveAttribute('role', 'combobox');
  await role.fill('circle');
  await expect(page.getByRole('option', { name: 'Circle Inspector' })).toBeVisible();
  await page.getByRole('option', { name: 'Circle Inspector' }).click();
  await expect(role).toHaveValue('Circle Inspector');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
