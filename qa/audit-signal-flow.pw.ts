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
    await expect(summary).not.toContainText('These are figures from this profile.');
    await expect(summary).not.toContainText('Screening indicators — not audit findings');
    await expect(summary.locator('.audit-summary-drawer__figures .drawer-field').last()).toHaveCSS('grid-column-start', '1');
    await expect(summary.locator('.audit-summary-drawer__figures .drawer-field').last()).toHaveCSS('grid-column-end', '-1');
    await expect(summary.locator('.detail-section').first()).toHaveCSS('border-top-width', '1px');
    await page.screenshot({path:`test-results/audit-summary-flat-${width}.png`,animations:'disabled'});
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
    await expect(flow.locator('.audit-story__figures .audit-story__fact')).toHaveCount(3);
    await expect(flow.locator('.audit-story__verification')).toContainText('Source evidence not verified in this view');
    // The signal review uses the exact same canonical section border, surface and
    // header fill as the other Office drawer cards. The only inset grid is facts.
    const sections = await detail.evaluate(root => {
      const first = root.querySelector<HTMLElement>('.detail-section:not(.audit-story__reference)')!;
      const flow = root.querySelector<HTMLElement>('.audit-signal-flow')!;
      const header = root.querySelector<HTMLElement>('.detail-section__head')!;
      const flowHeader = root.querySelector<HTMLElement>('.audit-signal-flow__header')!;
      const sample = (el: HTMLElement) => {
        const cs = getComputedStyle(el);
        return { surface: cs.backgroundColor, border: cs.borderTopColor, width: cs.borderTopWidth,
          radius: cs.borderTopLeftRadius, shadow: cs.boxShadow };
      };
      return { golden: sample(first), review: sample(flow),
        goldenHeader: getComputedStyle(header).backgroundColor,
        reviewHeader: getComputedStyle(flowHeader).backgroundColor };
    });
    expect(sections.review).toEqual(sections.golden);
    expect(sections.reviewHeader).toEqual(sections.goldenHeader);
    await expect(flow).not.toContainText('These are figures shown in the profile.');
    await expect(flow.locator('.audit-story__fact').first()).toHaveCSS('border-top-width', '0px');
    await expect(flow.locator('.audit-story__next')).toBeVisible();
    await expect(flow.locator('.audit-story__decision')).not.toHaveAttribute('open');
    await expect(detail.locator('.audit-story__reference')).not.toHaveAttribute('open');
    await detail.locator('.audit-story__reference summary').click();
    await expect(detail.locator('.audit-story__definition-group').first()).toBeVisible();
    const definitionCells = detail.locator('.audit-story__reference .drawer-field');
    await expect(definitionCells.first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await detail.locator('.audit-story__reference summary').click();
    await expect(flow.locator('.audit-story__figures > :last-child')).toHaveCSS('grid-column-start','1');
    await expect(flow).toContainText('source-of-funds comparison is separate');
    await expect(flow).toContainText('not an audit finding');
    await expect(detail).toContainText('What it means');
    await expect(detail).toContainText('Why it matters');
    await expect(detail).toContainText('Signal definitions');
    await expect(detail).toContainText('Next action');
    await expect(flow).not.toContainText('D ≥');
    await expect(flow).not.toContainText('₹');
    await page.screenshot({path:`test-results/audit-story-first-${width}.png`,animations:'disabled'});
    await flow.locator('.audit-story__decision summary').click();
    await expect(flow.locator('.audit-decision-map__start')).toBeVisible();
    await flow.locator('.audit-decision-map__start').scrollIntoViewIfNeeded();
    await page.screenshot({path:`test-results/audit-visual-flowchart-${width}.png`,animations:'disabled'});
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
  await expect(flow).toContainText('যাচাইয়ের সারসংক্ষেপ');
  await expect(flow).toContainText('পরবর্তী কাজ');
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
  await expect(flow).toContainText('Verification across the selected returns');
  await expect(flow.locator('.audit-story__progress-grid > div')).toHaveCount(3);
  await expect(flow.locator('.audit-decision-map__diamond')).toHaveCount(0);
  await expect(flow).toContainText('Not reported');
  await expect(flow.locator('.audit-signal-flow__preview')).toHaveCount(0);
  await expect(flow).toContainText('36');
  await expect(flow).toContainText('Each return needs its own records and decision');
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


/* Cross-theme contract: compare the rendered Audit surfaces with the shared
   Office dark palette, not just the presence of a dark-mode class. */
for (const width of [1366, 390]) {
  test(`Dark Mode taxpayer signal uses Office palette at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(() => {
      localStorage.setItem('gov_ui_settings', JSON.stringify({
        assessmentYear: '2024-25', themeId: 'dark-mode',
        fontId: 'poppins', fontSizeId: 'standard', languageId: 'en',
      }));
    });
    await page.goto(first);
    await page.getByRole('button', { name: 'Quick summary' }).click();
    await page.getByRole('dialog', { name: 'Quick summary' })
      .getByRole('button', { name: /R-C1: .*fund/i }).click();
    const detail = page.getByRole('dialog', { name: /R-C1/i });
    const flow = detail.locator('.audit-signal-flow');
    await expect(detail).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark-mode');
    await expect(page.locator('html')).toHaveClass(/theme-dark/);
    await expect(page.locator('body')).toHaveCSS('color', 'rgb(232, 234, 237)');
    await expect(detail).toHaveCSS('background-color', 'rgb(43, 44, 47)');
    await expect(flow).toHaveCSS('background-color', 'rgb(43, 44, 47)');
    await expect(flow).toHaveCSS('color', 'rgb(232, 234, 237)');
    await expect(flow.locator('.audit-story__fact').first()).toHaveCSS('background-color', 'rgb(43, 44, 47)');
    await expect(flow.locator('.audit-story__fact').first()).toHaveCSS('color', 'rgb(232, 234, 237)');
    await expect(flow.locator('.audit-story__fact-label').first()).toHaveCSS('color', 'rgb(189, 193, 198)');
    await expect(flow.locator('.audit-story__decision')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(flow.locator('.audit-story__decision summary')).toHaveCSS('color', 'rgb(138, 180, 248)');
    const overflow = await detail.evaluate(el => el.scrollWidth - el.clientWidth);
    expect(overflow, 'dark mode drawer stays within its width').toBeLessThanOrEqual(2);
    await page.screenshot({ path: `test-results/audit-dark-R-C1-${width}.png`, animations: 'disabled' });
    await flow.locator('.audit-story__decision summary').click();
    await expect(flow.locator('.audit-decision-map__diamond')).toHaveCount(3);
    await expect(flow.locator('.audit-decision-map__diamond strong').first()).toHaveCSS('color', 'rgb(232, 234, 237)');
  });
}

test('Dark Mode Audit Overview keeps population panels and labels on Office tokens', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 865 });
  await page.addInitScript(() => {
    localStorage.setItem('gov_ui_settings', JSON.stringify({
      assessmentYear: '2024-25', themeId: 'dark-mode',
      fontId: 'poppins', fontSizeId: 'standard', languageId: 'en',
    }));
  });
  await page.goto('/audit/audit-overview');
  await page.locator('.audit-overview-v5__parameters')
    .getByRole('button', { name: 'Risk signal', exact: true }).click();
  await page.locator('.audit-overview-v5__chart-detail').first().click();
  const flow = page.getByRole('dialog').locator('.audit-signal-flow');
  await expect(flow).toBeVisible();
  await expect(flow.locator('.audit-story__population')).toHaveCSS('color', 'rgb(232, 234, 237)');
  await expect(flow.locator('.audit-story__population')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(flow.locator('.audit-story__population-progress')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(flow.locator('.audit-story__progress-grid > div').first()).toHaveCSS('background-color', 'rgb(48, 49, 52)');
  await page.screenshot({ path: 'test-results/audit-dark-overview.png', animations: 'disabled' });
});
