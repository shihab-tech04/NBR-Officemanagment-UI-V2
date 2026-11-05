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
    // Ordinary Office preview login must never grant SQL publishing privileges.
    await expect(page.getByRole('button', { name: 'Edit banner' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add banner' })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/live-cms-' + device + '.png', fullPage: false });
    await page.getByRole('tab', { name: 'Site Logo' }).click();
    await expect(page.getByRole('region', { name: 'Site Logo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit logo' })).toHaveCount(0);
    await page.close();
  }
  console.log('PASS: live CMS shows published SQL banners and logo without secondary login; preview cannot publish');
} finally {
  await browser.close();
}
