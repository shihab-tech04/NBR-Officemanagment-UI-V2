import { test, expect } from '@playwright/test';

test('Office opens directly without presentation-only credentials and survives reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard\/dashboard-main$/);
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('#login-user-id')).toHaveCount(0);
  await expect(page.locator('#login-password')).toHaveCount(0);
  await expect(page.locator('.topbar__profile-name')).toHaveText('Office Workspace');
  await expect(page.locator('.topbar__profile-role')).toHaveText('Open workspace');
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('#login-user-id')).toHaveCount(0);
});

test('Audit and Payments open directly without an officer password prompt', async ({ page }) => {
  await page.goto('/audit/audit-candidates');
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('#login-user-id')).toHaveCount(0);
  await page.goto('/payments/transactions');
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('#login-password')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Officer review inbox' })).toHaveCount(0);
});

test('Content Management retains its single publishing entry without gating public Audit', async ({ page }) => {
  await page.goto('/audit/audit-overview');
  await expect(page.locator('#login-user-id')).toHaveCount(0);
  await page.goto('/administration/content-management');
  await expect(page.locator('#login-user-id')).toBeVisible();
  await expect(page.locator('#login-password')).toBeVisible();
  await page.locator('#login-user-id').fill('admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.goto('/administration/content-management');
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('#login-user-id')).toHaveCount(0);
});

test('Office mobile navigation works without any presentation-only sign-in', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/register-stock/register-4');
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('#login-user-id')).toHaveCount(0);
  await page.getByRole('button', { name: /navigation/i }).first().click();
  await expect(page.locator('.app-sidebar-shell--mobile.app-sidebar-shell--open')).toBeVisible();
});

test('profile Sign Out still allows CMS session cleanup without locking the public Office UI', async ({ page }) => {
  await page.goto('/dashboard/dashboard-main');
  await page.locator('.topbar__profile-button').click();
  await expect(page.locator('.account-dropdown__name')).toHaveText('Office Workspace');
  await expect(page.locator('.account-dropdown__email')).toHaveCount(0);
  await expect(page.locator('.account-dropdown__summary')).toHaveCount(0);
  await expect(page.locator('.account-dropdown__signout-button')).toContainText('Disconnect publishing session');
  await page.locator('.account-dropdown__signout-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.app-shell')).toBeVisible();

  await page.locator('.topbar__profile-button').click();
  await page.locator('.account-dropdown__signout-button').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign Out' }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('#login-user-id')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
});

test('mobile profile retains session disconnect control for protected CMS operations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard/dashboard-main');
  await page.locator('.mobile-topbar__profile-button').click();
  await expect(page.locator('.account-dropdown__signout-button')).toBeVisible();
});
