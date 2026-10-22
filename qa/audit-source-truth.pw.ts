import { test, expect } from '@playwright/test';

/* Source-truth tests: these navigate only. No production taxpayer writes. */
const tabs = [
  'audit-overview', 'audit-candidates', 'all-taxpayers',
  'risk-cases', 'control-data-quality', 'second-review',
  'rules-governance', 'reconciliation', 'audit-trail', 'audit-manual',
] as const;
const viewports = [
  {width:1366,height:865},
  {width:390,height:844},
];

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('gov_ui_auth',JSON.stringify({isAuthenticated:true,userId:'admin'}));
    localStorage.setItem('gov_ui_settings',JSON.stringify({
      assessmentYear:'2024-25',themeId:'indigo-blue',fontId:'poppins',fontSizeId:'standard',languageId:'en',
    }));
  });
});

for (const viewport of viewports) {
  test(`all ten Audit tabs render truthful source context at ${viewport.width}px`, async ({page}) => {
    await page.setViewportSize(viewport);
    for (const tab of tabs) {
      await page.goto('/audit/' + tab);
      await expect(page.locator('.dashboard-page,.table-page').first(), tab).toBeVisible({timeout:18000});
      // Source-truth remains tested through record counts and filters, not
      // through unwanted reference paragraphs inserted into every screen.
      const visiblePage = await page.locator('.dashboard-page,.table-page').first().innerText();
      expect(visiblePage).not.toContain('Illustrative AY 2025');
      expect(visiblePage).not.toContain('72,341 selections');
      if (tab === 'audit-overview') {
        const overview = await page.locator('.audit-overview-v5').innerText();
        expect(overview).not.toContain('333,333');
        expect(overview).not.toContain('444,444');
        expect(overview).not.toContain('1,000,000');
        expect(overview).not.toContain('4M+');
        await expect(page.locator('.audit-overview-v5 .audit-overview-v5__donut')).toContainText('36');
        await expect(page.locator('.audit-overview__scope-badge')).toHaveCount(0);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth-innerWidth);
      expect(overflow, `no page horizontal overflow in ${tab}`).toBeLessThanOrEqual(2);
      if(tab==='audit-overview') await page.screenshot({path:`test-results/audit-source-truth-${viewport.width}.png`,animations:'disabled'});
    }
  });
}

test('risk signal totals come from all 36 loaded records, including overlapping signals', async ({page}) => {
  await page.setViewportSize({width:1366,height:865});
  await page.goto('/audit/audit-overview');
  await expect(page.locator('.audit-overview-v5__parameters')).toBeVisible();
  await page.locator('.audit-overview-v5__parameters').getByRole('button',{name:'Risk signal',exact:true}).click();
  await expect(page.locator('.audit-data-source-note').filter({hasText:'Risk signals'})).toBeVisible();
  const rows=page.locator('.audit-overview-v5__chart-detail');
  expect(await rows.count()).toBeGreaterThan(9);
  const seen=await rows.locator(':scope > strong').allTextContents();
  expect(seen.every(value=>/^\d+$/.test(value.trim()))).toBeTruthy();
  expect(seen.every(value=>Number(value)<=36)).toBeTruthy();
  await page.locator('.audit-overview-v5__parameters').getByRole('button',{name:'Circle',exact:true}).click();
  await expect(page.locator('.audit-overview-v5__chart-detail').first()).toContainText('Circle-');
  await expect(page.locator('.audit-overview-v6__scope')).toContainText('unmapped');
});

test('reconciliation table is computed from matching candidate and case records',async({page})=>{
  await page.goto('/audit/reconciliation');
  await expect(page.locator('.table-page')).toBeVisible();
  const table=page.locator('.table-card');
  await expect(table).toContainText('Loaded selection');
  await expect(table).not.toContainText('Zone summary');
  await expect(table).toContainText('Circle-');
});
