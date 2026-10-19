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

test('Add User access summary wraps its role and permission action inside the mobile sheet', async ({ page }) => {
  await page.goto('/administration/user-management');
  await page.getByRole('button', { name: 'Add User' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add User' });
  await expect(dialog).toBeVisible();
  const summary = dialog.locator('.role-summary');
  await summary.scrollIntoViewIfNeeded();
  await expect(summary.getByRole('button', { name: 'View permissions' })).toBeVisible();
  const geometry = await summary.evaluate(element => {
    const role = element.querySelector('.role-summary__name')!;
    const action = element.querySelector('.role-summary__meta > button')!;
    const outer = element.getBoundingClientRect();
    const roleBox = role.getBoundingClientRect();
    const buttonBox = action.getBoundingClientRect();
    return { outerRight: outer.right, roleRight: roleBox.right, buttonRight: buttonBox.right,
      roleWrapped: getComputedStyle(role).whiteSpace !== 'nowrap' };
  });
  expect(geometry.roleWrapped).toBe(true);
  expect(geometry.roleRight).toBeLessThanOrEqual(geometry.outerRight + 1);
  expect(geometry.buttonRight).toBeLessThanOrEqual(geometry.outerRight + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('user details put readable name and designation before scrollable actions', async ({ page }) => {
  await page.goto('/administration/user-management');
  await page.locator('.mobile-table-card-list [role="listitem"]').first().click();
  const sheet = page.locator('.responsive-overlay.user-detail-drawer');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.user-detail-drawer__name')).toBeVisible();
  await expect(sheet.locator('.user-detail-drawer__designation')).toBeVisible();
  const details = await sheet.evaluate(element => {
    const body = element.querySelector('.responsive-overlay__body')!;
    const footer = element.querySelector('.responsive-overlay__footer')!;
    return { scrolls: getComputedStyle(element).overflowY,
      bodyScrollable: getComputedStyle(body).overflowY,
      contentBottom: body.getBoundingClientRect().bottom,
      actionsTop: footer.getBoundingClientRect().top };
  });
  expect(details.scrolls).toBe('auto');
  expect(details.bodyScrollable).toBe('visible');
  expect(details.actionsTop).toBeGreaterThanOrEqual(details.contentBottom - 1);
  await sheet.locator('.responsive-overlay__footer').scrollIntoViewIfNeeded();
  await expect(sheet.getByRole('button', { name: /Delete User/i })).toBeVisible();
});

test('Create Role permission controls wrap within the mobile dialog', async ({ page }) => {
  await page.goto('/administration/role-management');
  await page.getByRole('button', { name: 'Create New Role' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#role-name').fill('Mobile layout QA draft');
  await dialog.getByRole('button', { name: 'Next' }).click();
  const controls = dialog.locator('.permissions-panel__controls');
  await expect(controls).toBeVisible();
  const geometry = await controls.evaluate(element => {
    const box = element.getBoundingClientRect();
    const reset = element.querySelector('.permissions-panel__reset-btn')!.getBoundingClientRect();
    return { right: box.right, resetRight: reset.right, wrap: getComputedStyle(element).flexWrap };
  });
  expect(geometry.wrap).toBe('wrap');
  expect(geometry.resetRight).toBeLessThanOrEqual(geometry.right + 1);
});
