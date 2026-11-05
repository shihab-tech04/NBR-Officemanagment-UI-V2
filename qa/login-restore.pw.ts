import { test, expect } from '@playwright/test';

test('Office opens directly without presentation-only credentials and survives reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard\/dashboard-main$/);
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('#login-user-id')).toHaveCount(0);
  await expect(page.locator('#login-password')).toHaveCount(0);
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
