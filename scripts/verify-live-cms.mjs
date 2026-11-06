import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const site = process.env.SITE_URL;
if (!site || !site.startsWith('https://shihab-tech04.github.io/NBR-Officemanagment-UI-V2/')) {
  throw new Error('CMS verification must target the deployed Office Pages URL');
}
const base = site.endsWith('/') ? site : site + '/';
const publisherPassword = process.env.CMS_PUBLISHER_TEST_PASSWORD || '';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [device, viewport, mobile] of [
    ['desktop', { width: 1440, height: 900 }, false],
    ['mobile', { width: 390, height: 844 }, true],
  ]) {
    const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
    // Existing Office prototype entry and solved journeys remain unchanged.
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const login = page.getByRole('textbox', { name: 'User ID' });
    await expect(login).toBeVisible({ timeout: 30_000 });
    await login.fill('admin');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(login).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('office_ui_entered'))).toBe('admin');

    // TaxPay CMS is the only route that requires the verified publisher.
    // Preview-only Office entry must not be confused with SQL write access.
    await page.goto(base + 'administration/content-management', {
      waitUntil: 'domcontentloaded', timeout: 45_000,
    });
    await expect(login).toBeVisible({ timeout: 30_000 });
    await login.fill('admin');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Enter your authorized Office password', { timeout: 30_000 },
    );
    await expect(login).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Content Management' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Confirm TaxPay publishing' })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('office_ui_entered'))).toBe('admin');

    if (publisherPassword) {
      // A real publisher credential is supplied only by an authorized Actions
      // secret. Never hardcode it, log it or export it with screenshots.
      await page.getByLabel('Password').fill(publisherPassword);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(login).toHaveCount(0, { timeout: 30_000 });
      await page.goto(base + 'administration/content-management', {
        waitUntil: 'domcontentloaded', timeout: 45_000,
      });
      await expect(page.getByRole('heading', { name: 'Content Management' })).toBeVisible();
      const banners = page.getByRole('region', { name: 'Banner list' });
      await expect(banners).toBeVisible();
      await expect.poll(() => banners.getByRole('button').count()).toBeGreaterThan(0);
      await expect(page.getByRole('tab', { name: 'Site Logo' })).toBeVisible();
      await expect(page.getByText(/You can edit and preview content here/i)).toHaveCount(0);

      // This hosted smoke is read-only: synthetic graphics must never replace
      // approved LIVE banner/logo assets just to turn a CI check green.
      await page.getByRole('tab', { name: 'Site Logo' }).click();
      await expect(page.getByAltText('Korbritto TaxPay logo preview')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit logo' })).toBeVisible();
      console.log('PASS: real publisher credentials established once at Office sign-in on', device);
    } else {
      console.log('UNVERIFIED: no publisher test credential configured; ' +
        'real banner/logo upload and public TaxPay read-back were NOT executed on ' + device);
    }

    await page.screenshot({ path: 'test-results/live-cms-' + device + '.png', fullPage: false });
    await page.close();
  }
  console.log('PASS: Office preview remains available, TaxPay CMS requires verified publisher without another Publish modal');
} finally {
  await browser.close();
}
