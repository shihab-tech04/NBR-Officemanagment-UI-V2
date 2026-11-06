import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const site = process.env.SITE_URL;
if (!site || !site.startsWith('https://shihab-tech04.github.io/NBR-Officemanagment-UI-V2/')) {
  throw new Error('CMS production verification requires the actual NBR Office Pages URL');
}
const base = site.endsWith('/') ? site : site + '/';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [device, viewport, mobile] of [
    ['desktop', { width: 1440, height: 900 }, false],
    ['mobile', { width: 390, height: 844 }, true],
  ]) {
    const page = await browser.newPage({ viewport, isMobile: mobile, hasTouch: mobile });
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.getByRole('textbox', { name: 'User ID' }).fill('admin');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'User ID' })).toHaveCount(0, { timeout: 30_000 });
    await page.goto(base + 'administration/content-management', { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await expect(page.getByRole('heading', { name: 'Content Management', exact: true })).toBeVisible({ timeout: 30_000 });
    const bannerList = page.getByRole('region', { name: 'Banner list' });
    await expect(bannerList).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => bannerList.getByRole('button').count(), { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByRole('tab', { name: 'Banner' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Site Logo' })).toBeVisible();
    await expect(page.getByText(/Sign out of Office and use your approved administrator credentials/i)).toHaveCount(0);
    // Preview editing is available in the regular Office workspace. SQL
    // publishing stays disabled until an administrator is verified.
    await expect(page.getByRole('button', { name: 'Edit banner' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add banner' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit banner' }).click();
    await expect(page.getByRole('button', { name: 'Publish to TaxPay' })).toBeEnabled();
    await expect(page.getByText(/unpublished preview/i)).toBeVisible();
    await page.screenshot({ path: 'test-results/live-cms-' + device + '.png', fullPage: false });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('tab', { name: 'Site Logo' }).click();
    await expect(page.getByRole('region', { name: 'Site Logo' })).toBeVisible();
    await expect(page.getByAltText('Korbritto TaxPay logo preview')).toBeVisible();
    await expect(page.getByText(/Current Korbritto brand/)).toBeVisible();
    const source = await page.getByAltText('Korbritto TaxPay logo preview').getAttribute('src');
    if (!source || source.includes('amar-kor')) throw new Error('Live Office rendered an obsolete logo');
    await expect(page.getByRole('button', { name: 'Edit logo' })).toBeVisible();
    await page.getByRole('button', { name: 'Edit logo' }).click();
    await expect(page.getByRole('button', { name: 'Publish to TaxPay' })).toBeDisabled();
    // The original bug only occurred AFTER cropping: the primary Publish
    // remained disabled in the actual live Office session. Exercise that
    // exact journey without performing any unauthorized production SQL write.
    // Generate a valid PNG with Chromium itself. The previous embedded sample
    // decoded inconsistently and left Apply crop disabled; that tested an invalid
    // fixture rather than the real CMS publish journey.
    const pngBase64 = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Unable to create PNG crop fixture');
      ctx.fillStyle = '#2C5EAD';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(30, 30, 580, 180);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const fixture = Buffer.from(pngBase64, 'base64');
    await page.getByLabel('Upload / replace logo').setInputFiles({
      name: 'public-preview-check.png', mimeType: 'image/png', buffer: fixture,
    });
    await expect(page.getByRole('button', { name: 'Apply crop' })).toBeEnabled({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Apply crop' }).click();
    await expect(page.getByRole('heading', { name: 'New logo preview (not yet published)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish to TaxPay' })).toBeEnabled();
    await page.getByRole('button', { name: 'Publish to TaxPay' }).click();
    await expect(page.getByRole('textbox', { name: 'User ID' })).toBeVisible({ timeout: 20_000 });
    // Do not supply administrator credentials or write production content in
    // a smoke test. Authorized Office users complete the same flow privately.
    await page.close();
  }
  console.log('PASS: live CMS preview crop enables primary Publish; preview-only click opens existing Office sign-in without SQL writes');
} finally {
  await browser.close();
}
