import { test, expect } from '@playwright/test';

const first = '/audit/audit-candidates?batch=AUD-2026-RISK-01&candidate=AC-2026-RISK-01-01';

test.beforeEach(async ({ page }, testInfo) => {
  const language = testInfo.title.startsWith('Bengali') ? 'bn' : 'en';
  await page.addInitScript((lang) => {
    localStorage.setItem('gov_ui_auth', JSON.stringify({isAuthenticated:true,userId:'admin'}));
    localStorage.setItem('gov_ui_settings',JSON.stringify({
      assessmentYear:'2024-25',themeId:'indigo-blue',
      fontId:'poppins',fontSizeId:'standard',languageId:lang
    }));
    localStorage.setItem('i18nextLng',lang);
  },language);
});

for (const width of [1366,768,390,360]) {
  test(`R-C1 decision logic is visible and fits the detail drawer at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.goto(first);
    await page.getByRole('button',{name:'Quick summary'}).click();
    const summary=page.getByRole('dialog',{name:'Quick summary'});
    await expect(summary).toBeVisible();
    await summary.getByRole('button',{name:/R-C1: .*fund/i}).click();
    const detail=page.getByRole('dialog',{name:/R-C1/i});
    await expect(detail).toBeVisible();
    const flow=detail.locator('.audit-signal-flow[data-signal-id="R-C1"]');
    await expect(flow).toBeVisible();
    await expect(flow.locator('.audit-signal-flow__step')).toHaveCount(6);
    await expect(flow).toContainText('Data & coverage gate');
    await expect(flow).toContainText('Independence gate');
    await expect(flow).toContainText('Gap = 10');
    await expect(flow).toContainText('max(Sources');
    await expect(flow).toContainText('shadow-only');
    await expect(flow).toContainText('not executed');
    await expect(flow).toContainText('not establish an audit finding');
    await expect(flow).not.toContainText('D ≥');
    await expect(flow).not.toContainText('₹');
    await flow.getByText('Show exact IT-10B calculation').click();
    await expect(flow).toContainText('8(a–k)');
    await expect(flow).toContainText('ΔNet Wealth');
    const bounds = await flow.evaluate(el=>({
      own:el.scrollWidth-el.clientWidth,
      document:document.documentElement.scrollWidth-innerWidth,
    }));
    expect(bounds.own, 'decision logic fits drawer').toBeLessThanOrEqual(2);
    expect(bounds.document, 'no page horizontal overflow').toBeLessThanOrEqual(2);
    await page.screenshot({path:`test-results/audit-R-C1-flow-${width}.png`,animations:'disabled'});
    await detail.locator('.responsive-overlay__header').getByRole('button',{name:'Back',exact:true}).click();
    await expect(detail).toHaveCount(0);
    await expect(page.getByRole('dialog',{name:'Quick summary'})).toBeVisible();
    await expect(page.getByRole('dialog',{name:'Quick summary'}).locator('.responsive-overlay__back')).toHaveCount(0);
  });
}

test('R-E2 uses its own actual condition, without inventing R-C1 thresholds', async ({page})=>{
  await page.goto(first);
  await page.getByRole('button',{name:'Quick summary'}).click();
  await page.getByRole('dialog',{name:'Quick summary'}).getByRole('button',{name:/R-E2: .*asset/i}).click();
  const detail=page.getByRole('dialog',{name:/R-E2/i});
  const flow=detail.locator('.audit-signal-flow[data-signal-id="R-E2"]');
  await expect(flow).toBeVisible();
  await expect(flow.locator('.audit-signal-flow__step')).toHaveCount(4);
  await expect(flow).toContainText('legally permitted registry');
  await expect(flow).toContainText('ownership');
  await expect(flow).toContainText('not an executed or certified assessment');
  await expect(flow).not.toContainText('10%');
  await expect(flow).not.toContainText('line 10');
});

test('Bengali C1 steps, conditions and evidence outcomes are localized',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.goto(first);
  await page.locator('.audit-detail-back-row').getByRole('button',{name:'সংক্ষিপ্ত সারাংশ'}).click();
  const summary=page.getByRole('dialog',{name:'সংক্ষিপ্ত সারাংশ'});
  await expect(summary).toBeVisible();
  await summary.getByRole('button',{name:/R-C1:/}).click();
  const flow=page.locator('.audit-signal-flow[data-signal-id="R-C1"]');
  await expect(flow).toBeVisible();
  await expect(flow).toContainText('সিদ্ধান্তের যুক্তিপথ');
  await expect(flow).toContainText('তথ্য ও কভারেজ যাচাই');
  await expect(flow).toContainText('অযাচাইকৃত');
  await expect(flow).toContainText('আইনগত সীমা নয়');
  await expect(flow.locator('.audit-signal-flow__step')).toHaveCount(6);
  expect(await flow.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(2);
});
