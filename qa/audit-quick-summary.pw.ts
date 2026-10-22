import { test, expect } from '@playwright/test';

const first = '/audit/audit-candidates?batch=AUD-2026-RISK-01&candidate=AC-2026-RISK-01-01';
const other = '/audit/audit-candidates?batch=AUD-2026-RISK-01&candidate=AC-2026-RISK-01-02';
const cases = [
  { width: 1366, height: 865 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('gov_ui_auth', JSON.stringify({ isAuthenticated: true, userId: 'admin' }));
    localStorage.setItem('gov_ui_settings', JSON.stringify({
      assessmentYear: '2024-25', themeId: 'indigo-blue',
      fontId: 'poppins', fontSizeId: 'standard', languageId: 'en',
    }));
  });
});

for (const viewport of cases) {
  test(`Quick summary is usable and readable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(first);
    const row = page.locator('.audit-detail-back-row');
    const back = row.getByRole('button', { name: /Back to selected candidates/i });
    const quick = row.getByRole('button', { name: 'Quick summary' });
    await expect(back).toBeVisible({timeout:18000});
    await expect(quick).toBeVisible();
    await expect(page.locator('#audit-quick-summary')).toHaveCount(0);

    await quick.click();
    const region = page.getByRole('region', { name: 'Quick summary' });
    await expect(region).toBeVisible();
    const text = await region.locator('.audit-quick-summary__text').innerText();
    expect(Array.from(text).length).toBeLessThanOrEqual(350);
    expect(text).toContain('Rahman Enterprise');
    expect(text).toContain('R-C1');
    expect(text).toContain('R-E2');
    expect(text).toContain('not assessed tax');
    expect(text).toContain('no confirmed finding');
    await expect(region.locator('.audit-quick-summary__source')).toContainText('illustrative');
    await page.screenshot({
      path: `test-results/audit-quick-summary-${viewport.width}.png`,
      animations: 'disabled',
    });
    const outerOverflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(outerOverflow, 'no viewport overflow').toBeLessThanOrEqual(2);
    await region.getByRole('button', { name: 'Hide summary' }).click();
    await expect(region).toHaveCount(0);
    await expect(back).toBeVisible();
  });
}

test('switching candidate updates the insight and never leaks prior selection', async({page}) => {
  await page.goto(first);
  await page.getByRole('button', { name: 'Quick summary' }).click();
  await expect(page.locator('.audit-quick-summary__text')).toContainText('Rahman Enterprise');
  await page.goto(other);
  await expect(page.locator('.audit-quick-summary__text')).toHaveCount(0);
  await page.getByRole('button', { name: 'Quick summary' }).click();
  const content = await page.locator('.audit-quick-summary__text').innerText();
  expect(content).not.toContain('Rahman Enterprise');
  expect(Array.from(content).length).toBeLessThanOrEqual(350);
});

test('Bengali Quick summary is localized and remains under 350 characters', async({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('gov_ui_settings', JSON.stringify({
      assessmentYear: '2024-25', themeId: 'indigo-blue',
      fontId: 'poppins', fontSizeId: 'standard', languageId: 'bn',
    }));
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto(first);
  const control = page.locator('.audit-detail-back-row').getByRole('button', { name: 'সংক্ষিপ্ত সারাংশ' });
  await expect(control).toBeVisible();
  await control.click();
  const body = await page.locator('.audit-quick-summary__text').innerText();
  expect(Array.from(body).length).toBeLessThanOrEqual(350);
  expect(body).toContain('R-C1');
  expect(body).toContain('R-E2');
  await expect(page.locator('.audit-quick-summary__source')).toContainText('উদাহরণমূলক');
});
