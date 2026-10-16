import { test, expect } from '@playwright/test';
import { NAVIGATION } from '../src/app/data/navigation';

/** All advertised leaf destinations, not hand-picked happy-path pages. */
const destinations = NAVIGATION.map(group => ({
  group: group.id,
  paths: group.children.flatMap(child => child.children?.length
    ? child.children.map(grandchild => `/${group.id}/${child.id}/${grandchild.id}`)
    : [`/${group.id}/${child.id}`]),
}));

test('header search accepts input and navigates to the matching Office module', async ({ page }) => {
  await page.goto('/dashboard/dashboard-main');
  await page.getByRole('textbox', { name: 'User ID' }).fill('admin');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.locator('.topbar__search-container input').fill('Taxpayer Ledger');
  await expect(page.locator('.topbar__search-results')).toBeVisible();
  await page.locator('.topbar__search-results button').filter({ hasText: 'Taxpayer Ledger' }).click();
  await expect(page).toHaveURL(/\/case-financial\/demand-payment\/taxpayer-ledger$/);
  await expect(page.locator('#main-content').getByRole('heading', { name: 'Taxpayer Ledger', exact: true })).toBeVisible();
});

test.describe('Office navigation route completeness', () => {
  for (const { group, paths } of destinations) {
    test(`${group}: every advertised page renders without an uncaught error`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto('/dashboard/dashboard-main');
      await page.getByRole('textbox', { name: 'User ID' }).fill('admin');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page.locator('.app-shell')).toBeVisible();

      for (const path of paths) {
        const uncaught: string[] = [];
        const onPageError = (error: Error) => uncaught.push(error.message);
        page.on('pageerror', onPageError);
        try {
          await page.goto(path);
          await expect(page.locator('.app-shell'), path).toBeVisible();
          await expect(page.locator('#main-content .page-loader'), path).toHaveCount(0);
          await expect(page.locator('#main-content'), path).toContainText(/\S/);
          expect(uncaught, `${path} uncaught JavaScript errors`).toEqual([]);
        } finally {
          page.off('pageerror', onPageError);
        }
      }
    });
  }
});
