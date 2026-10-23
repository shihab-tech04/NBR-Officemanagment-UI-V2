import { test, expect } from '@playwright/test';

const first = '/audit/audit-candidates?batch=AUD-2026-RISK-01&candidate=AC-2026-RISK-01-01';
const other = '/audit/audit-candidates?batch=AUD-2026-RISK-01&candidate=AC-2026-RISK-01-02';
const cases = [
  {width:1366,height:865},
  {width:768,height:1024},
  {width:390,height:844},
  {width:360,height:800},
];

test.beforeEach(async ({page}, testInfo) => {
  const lang = testInfo.title.startsWith('Bengali') ? 'bn' : 'en';
  await page.addInitScript(language => {
    localStorage.setItem('gov_ui_auth', JSON.stringify({isAuthenticated:true,userId:'admin'}));
    localStorage.setItem('gov_ui_settings', JSON.stringify({
      assessmentYear:'2024-25',themeId:'indigo-blue',
      fontId:'poppins',fontSizeId:'standard',languageId:language,
    }));
    localStorage.setItem('i18nextLng',language);
  },lang);
});

for (const viewport of cases) {
  test(`Quick summary opens a detail drawer without shifting the profile at ${viewport.width}px`, async ({page}) => {
    await page.setViewportSize(viewport);
    await page.goto(first);
    const row = page.locator('.audit-detail-back-row');
    const back = row.getByRole('button', {name:/Back to selected candidates/i});
    const quick = row.getByRole('button', {name:'Quick summary'});
    const profile = page.locator('.audit-candidate-detail__header');
    await expect(back).toBeVisible({timeout:18000});
    await expect(quick).toBeVisible();
    const originalY = (await profile.boundingBox())?.y;
    await expect(page.getByRole('dialog', {name:'Quick summary'})).toHaveCount(0);

    await quick.click();
    const drawer = page.getByRole('dialog', {name:'Quick summary'});
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Rahman Enterprise')).toBeVisible();
    await expect(drawer.getByText('Very High')).toBeVisible();
    await expect(drawer.getByRole('heading', {name:/Why this taxpayer is selected for audit/i})).toBeVisible();
    await expect(drawer.getByRole('button', {name:/R-C1: .*fund/i})).toBeVisible();
    await expect(drawer.getByRole('button', {name:/R-E2: .*asset/i})).toBeVisible();
    await expect(drawer.getByText(/Verify fund-flow reconciliation/i)).toBeVisible();
    for (const paragraph of await drawer.locator('.audit-summary-drawer__copy').all()) {
      const geometry = await paragraph.evaluate(el => ({
        fits: el.scrollWidth <= el.clientWidth + 2,
        padding: parseFloat(getComputedStyle(el).paddingLeft),
        wraps: getComputedStyle(el).whiteSpace !== 'nowrap',
      }));
      expect(geometry.fits, 'summary text must fit inside its card').toBe(true);
      expect(geometry.padding, 'summary body needs readable horizontal padding').toBeGreaterThanOrEqual(8);
      expect(geometry.wraps, 'long explanations must be allowed to wrap').toBe(true);
    }
    expect((await profile.boundingBox())?.y).toBe(originalY);
    expect(await page.evaluate(() => document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
    await page.screenshot({path:`test-results/audit-summary-drawer-${viewport.width}.png`,animations:'disabled'});

    await drawer.locator('.responsive-overlay__close').click();
    await expect(drawer).toHaveCount(0);
    await expect(back).toBeVisible();
  });
}

test('risk code opens its definition in a detail drawer', async ({page}) => {
  await page.goto(first);
  await page.getByRole('button', {name:'Quick summary'}).click();
  const drawer = page.getByRole('dialog', {name:'Quick summary'});
  await drawer.getByRole('button', {name:/R-C1: .*fund/i}).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('R-C1');
});


test('Back belongs on risk details; Quick summary has Close only', async ({page}) => {
  await page.setViewportSize({width:1366,height:865});
  await page.goto(first);
  await page.getByRole('button',{name:'Quick summary'}).click();
  const summary=page.getByRole('dialog',{name:'Quick summary'});
  await expect(summary.locator('.responsive-overlay__header').getByRole('button',{name:'Back',exact:true})).toHaveCount(0);
  await expect(summary.locator('.responsive-overlay__close')).toBeVisible();
  await summary.getByRole('button',{name:/R-C1: .*fund/i}).click();
  const detail=page.getByRole('dialog',{name:/R-C1/i});
  await expect(detail).toBeVisible();
  const detailBack=detail.locator('.responsive-overlay__header').getByRole('button',{name:'Back',exact:true});
  await expect(detailBack).toBeVisible();
  const positions=await detail.evaluate(root=>{
    const back=root.querySelector<HTMLElement>('.responsive-overlay__back')!.getBoundingClientRect();
    const title=root.querySelector<HTMLElement>('.responsive-overlay__title')!.getBoundingClientRect();
    const close=root.querySelector<HTMLElement>('.responsive-overlay__close')!.getBoundingClientRect();
    return {backX:back.x,titleX:title.x,closeX:close.x,backRight:back.right,titleRight:title.right};
  });
  expect(positions.backX).toBeLessThan(positions.titleX);
  expect(positions.titleX).toBeLessThan(positions.closeX);
  expect(positions.backRight).toBeLessThanOrEqual(positions.titleX+2);
  await detailBack.click();
  await expect(detail).toHaveCount(0);
  await expect(summary).toBeVisible();
  await expect(summary.locator('.responsive-overlay__header').getByRole('button',{name:'Back',exact:true})).toHaveCount(0);
  await summary.locator('.responsive-overlay__close').click();
  await expect(summary).toHaveCount(0);
  await expect(page.locator('.audit-candidate-detail__header')).toBeVisible();
});

test('header Back on a directly opened signal returns to candidate profile, not summary',async({page})=>{
  await page.goto(first);
  await page.locator('.audit-evidence-chip--button').filter({hasText:'R-C1'}).first().click();
  const detail=page.getByRole('dialog',{name:/R-C1/i});
  await expect(detail).toBeVisible();
  await detail.locator('.responsive-overlay__header').getByRole('button',{name:'Back',exact:true}).click();
  await expect(detail).toHaveCount(0);
  await expect(page.getByRole('dialog',{name:'Quick summary'})).toHaveCount(0);
  await expect(page.locator('.audit-candidate-detail__header')).toBeVisible();
});

test('Bengali first-level bottom sheet has Close only and does not clip the title',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await page.addInitScript(()=>{
    localStorage.setItem('i18nextLng','bn');
    localStorage.setItem('gov_ui_settings',JSON.stringify({
      assessmentYear:'2024-25',themeId:'indigo-blue',
      fontId:'poppins',fontSizeId:'standard',languageId:'bn',
    }));
  });
  await page.goto(first);
  await page.locator('.audit-detail-back-row').getByRole('button',{name:'সংক্ষিপ্ত সারাংশ'}).click();
  const dialog=page.getByRole('dialog',{name:'সংক্ষিপ্ত সারাংশ'});
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.responsive-overlay__header').getByRole('button',{name:'পেছনে যান'})).toHaveCount(0);
  await expect(dialog.locator('.responsive-overlay__close')).toBeVisible();
  const overflow=await dialog.locator('.responsive-overlay__header').evaluate(el=>el.scrollWidth-el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await dialog.locator('.responsive-overlay__close').click();
  await expect(dialog).toHaveCount(0);
});

test('switching candidates clears the prior drawer and its content', async ({page}) => {
  await page.goto(first);
  await page.getByRole('button', {name:'Quick summary'}).click();
  await expect(page.getByRole('dialog', {name:'Quick summary'})).toContainText('Rahman Enterprise');
  await page.goto(other);
  await expect(page.getByRole('dialog', {name:'Quick summary'})).toHaveCount(0);
  await page.getByRole('button', {name:'Quick summary'}).click();
  await expect(page.getByRole('dialog', {name:'Quick summary'})).not.toContainText('Rahman Enterprise');
});

test('Bengali drawer has localized structure and explanatory risk codes', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto(first);
  await page.locator('.audit-detail-back-row').getByRole('button',{name:'সংক্ষিপ্ত সারাংশ'}).click();
  const drawer = page.getByRole('dialog', {name:'সংক্ষিপ্ত সারাংশ'});
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('R-C1')).toBeVisible();
  await expect(drawer.getByText('R-E2')).toBeVisible();
  await expect(drawer.locator('.audit-summary-drawer__signal').first()).toContainText(/[\u0980-\u09FF]/);
  await expect(drawer.getByText(/উদাহরণমূলক/)).toHaveCount(0);
});

test('requested reference paragraphs are absent on candidate screens', async ({page}) => {
  for (const target of ['/audit/audit-overview','/audit/audit-candidates',first]) {
    await page.goto(target);
    await expect(page.locator('.dashboard-page,.table-page').first()).toBeVisible();
    const visible = await page.locator('.dashboard-page,.table-page').first().innerText();
    expect(visible).not.toContain('Illustrative AY 2025');
    expect(visible).not.toContain('72,341 selections');
    expect(visible).not.toContain('Historical financial series in this profile');
  }
});
