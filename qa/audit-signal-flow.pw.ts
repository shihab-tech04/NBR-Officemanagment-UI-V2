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
    await expect(summary.locator('.audit-summary-drawer__figures .drawer-field')).toHaveCount(3);
    await expect(summary).toContainText('Figures to check');
    await summary.getByRole('button',{name:/R-C1: .*fund/i}).click();
    const detail=page.getByRole('dialog',{name:/R-C1/i});
    await expect(detail).toBeVisible();
    const flow=detail.locator('.audit-signal-flow[data-signal-id="R-C1"]');
    await expect(flow).toBeVisible();
    await expect(flow.locator('.audit-decision-map__diamond')).toHaveCount(3);
    await expect(flow.locator('.audit-decision-map__options')).toHaveCount(3);
    await expect(flow.locator('.audit-decision-map__answer')).toHaveCount(6);
    await expect(flow).toContainText('Are the required records available?');
    await expect(flow).toContainText('Is the signal condition met?');
    await expect(flow).toContainText('Does the evidence confirm the concern?');
    await expect(flow).toContainText('Compare the filed figures');
    await expect(flow).toContainText('line 10 minus line 7');
    await expect(flow).toContainText('approved rule');
    await expect(flow).toContainText('approved limit');
    await expect(flow).toContainText('This taxpayer');
    await expect(flow).toContainText('Figures in this taxpayer profile');
    await expect(flow.locator('.audit-signal-flow__preview .drawer-field')).toHaveCount(3);
    await expect(flow).toContainText('source-of-funds comparison is separate');
    await expect(flow).toContainText('not an audit finding');
    await expect(detail).toContainText('What it means');
    await expect(detail).toContainText('What it affects');
    await expect(detail).toContainText('Signal definitions');
    await expect(detail).toContainText('Next step');
    await expect(flow).not.toContainText('D ≥');
    await expect(flow).not.toContainText('₹');
    await flow.locator('.audit-signal-flow__formula summary').click();
    await expect(flow).toContainText('IT-10B sources');
    await expect(flow).toContainText('line 10 − line 7');
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
  await expect(flow.locator('.audit-decision-map__diamond')).toHaveCount(3);
    await expect(flow.locator('.audit-decision-map__options')).toHaveCount(3);
    await expect(flow.locator('.audit-decision-map__answer')).toHaveCount(6);
  await expect(flow).toContainText('lawful access');
  await expect(flow).toContainText('ownership share');
  await expect(flow).toContainText('matching external record is not shown here');
  await expect(flow).toContainText('not an audit finding');
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
  await expect(flow).toContainText('এই সংকেত কীভাবে যাচাই হয়');
  await expect(flow).toContainText('প্রয়োজনীয় নথি কি আছে?');
  await expect(flow).toContainText('সংকেতের শর্ত কি মিলে?');
  await expect(flow).toContainText('প্রমাণে অমিল কি নিশ্চিত?');
  await expect(flow).toContainText('অনুমোদিত');
  await expect(flow).toContainText('অনুমোদিত সীমা');
  await expect(flow.locator('.audit-decision-map__diamond')).toHaveCount(3);
    await expect(flow.locator('.audit-decision-map__options')).toHaveCount(3);
    await expect(flow.locator('.audit-decision-map__answer')).toHaveCount(6);
  expect(await flow.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(2);
});

test('dashboard signal explanation uses filtered population, not one taxpayer coverage tier',async({page})=>{
  await page.setViewportSize({width:1366,height:865});
  await page.goto('/audit/audit-overview');
  await page.locator('.audit-overview-v5__parameters').getByRole('button',{name:'Risk signal',exact:true}).click();
  const firstRow=page.locator('.audit-overview-v5__chart-detail').first();
  await expect(firstRow).toBeVisible();
  const code=(await firstRow.locator('.audit-overview-v5__bar-label').textContent())?.trim();
  expect(code).toMatch(/^R-[A-E]\d$/);
  await firstRow.click();
  const dialog=page.getByRole('dialog',{name:new RegExp(code!)});
  const flow=dialog.locator('.audit-signal-flow');
  await expect(flow).toContainText('Selected returns');
  await expect(flow.locator('.audit-signal-flow__preview')).toHaveCount(0);
  await expect(flow).toContainText('36');
  await expect(flow).toContainText('Each return has its own data availability');
  await expect(flow).not.toContainText('Assessment year:');
  await expect(flow).not.toContainText('Data quality: Complete');
  await expect(flow).not.toContainText('Reference only');
});

test('record detail shows its actual coverage and source context, without inventing an approved threshold',async({page})=>{
  await page.goto(first);
  await page.getByRole('button',{name:'Quick summary'}).click();
  await page.getByRole('dialog',{name:'Quick summary'}).getByRole('button',{name:/R-C1: .*fund/i}).click();
  const detail=page.getByRole('dialog',{name:/R-C1/i});
  const flow=detail.locator('.audit-signal-flow');
  await expect(flow).toContainText('This taxpayer');
  await expect(flow).toContainText('Return: RET-2026-10482');
  await expect(flow).toContainText('Available-data level:');
  await expect(flow).toContainText('Assessment year: 2025-26');
  await expect(flow).not.toContainText('200,000');
  await expect(flow).not.toContainText('10%');
  await expect(flow).not.toContainText('Reference only');
});
