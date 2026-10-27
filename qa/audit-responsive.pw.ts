import { test, expect, type Page } from '@playwright/test';

// This is a read-only UI test. No taxpayer records or audit selections are saved.
const sizes = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 865 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('office_ui_entered','admin');
    localStorage.setItem('gov_ui_settings', JSON.stringify({
      assessmentYear: '2024-25', themeId: 'indigo-blue',
      fontId: 'poppins', fontSizeId: 'standard', languageId: 'en',
    }));
  });
});

async function checkDashboardGeometry(page: Page) {
  const measurements = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.audit-overview-v5');
    if (!root) throw new Error('Audit overview did not render');
    const flow = root.querySelector<HTMLElement>('.audit-overview-v5__flow');
    const analysis = root.querySelector<HTMLElement>('.audit-overview-v5__analysis');
    const grid = root.querySelector<HTMLElement>('.dashboard-section-grid');
    const rect = (el: Element) => el.getBoundingClientRect();
    const overlappingNumbers: string[] = [];
    root.querySelectorAll<HTMLElement>('.audit-overview-v5__chart-detail').forEach((row, i) => {
      const count = row.querySelector(':scope > strong');
      const percent = row.querySelector(':scope > small');
      const bar = row.querySelector('.audit-overview-v5__bar-track');
      if (count && percent && rect(count).right > rect(percent).left - 1)
        overlappingNumbers.push('analysis row ' + i + ' count touches percent');
      if (bar && rect(bar).right > rect(row).right + 2)
        overlappingNumbers.push('analysis row ' + i + ' bar extends outside its row');
    });
    root.querySelectorAll<HTMLElement>('.audit-overview-v6__workload-row').forEach((row, i) => {
      const count = row.querySelector('em');
      if (count && (rect(count).right > rect(row).right + 1 || rect(count).left < rect(row).left))
        overlappingNumbers.push('circle row ' + i + ' numeric value clipped');
    });
    return {
      viewport: innerWidth,
      rootWidth: root.clientWidth,
      rootOverflow: root.scrollWidth - root.clientWidth,
      pageOverflow: document.documentElement.scrollWidth - innerWidth,
      flowColumns: flow ? getComputedStyle(flow).gridTemplateColumns.split(' ').length : 0,
      analysisColumns: analysis ? getComputedStyle(analysis).gridTemplateColumns.split(' ').length : 0,
      operationsColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0,
      overlappingNumbers,
    };
  });
  expect(measurements.rootOverflow, 'Audit root cannot clip its panels').toBeLessThanOrEqual(2);
  expect(measurements.pageOverflow, 'No horizontal page overflow').toBeLessThanOrEqual(2);
  expect(measurements.overlappingNumbers, 'Chart number and percent geometry').toEqual([]);
  if (measurements.rootWidth <= 1120) {
    expect(measurements.analysisColumns, 'Single analysis column for constrained content').toBe(1);
    expect(measurements.operationsColumns, 'Stack selection and Circle workload panels').toBe(1);
    expect(measurements.flowColumns, 'No four-up workflow in narrow content').toBeLessThanOrEqual(2);
  }
  if (measurements.rootWidth <= 660) {
    expect(measurements.flowColumns, 'Single workflow column at narrow content').toBe(1);
  }
}

for (const viewport of sizes) {
  test(`Audit dashboard ${viewport.width}px avoids clipping and numeric collisions`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/audit/audit-overview');
    await expect(page.locator('.audit-overview-v5')).toBeVisible({ timeout: 18000 });
    await page.locator('.audit-overview-v5__analysis').scrollIntoViewIfNeeded();
    await checkDashboardGeometry(page);
    await page.screenshot({ path: `test-results/audit-analysis-${viewport.width}.png`, animations: 'disabled' });
    await page.locator('.audit-overview-v6__workload-chart').scrollIntoViewIfNeeded();
    await checkDashboardGeometry(page);
    await page.screenshot({ path: `test-results/audit-circles-${viewport.width}.png`, animations: 'disabled' });
  });
}

test('1366px risk, signal, tier, quality and Circle filters preserve readable chart geometry', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 865 });
  await page.goto('/audit/audit-overview');
  await expect(page.locator('.audit-overview-v5__analysis')).toBeVisible({ timeout: 18000 });
  const parameters = page.locator('.audit-overview-v5__parameters');
  for (const metric of ['Risk level', 'Risk signal', 'Coverage tier', 'Data quality', 'Circle']) {
    await parameters.getByRole('button', { name: metric, exact: true }).click();
    await checkDashboardGeometry(page);
    await page.screenshot({
      path: `test-results/audit-${metric.toLowerCase().replace(/\s+/g, '-')}-1366.png`,
      animations: 'disabled',
    });
  }
});
