import { test, expect } from '@playwright/test';

/**
 * Golden Audit module contract — all 11 route states in both Office themes
 * and both languages, at a mobile and a desktop viewport.
 * Never supplies or mutates real taxpayer, assessment or payment data.
 */
const routes = [
  'audit-overview',
  'initiate-audit',
  'audit-candidates',
  'all-taxpayers',
  'risk-cases',
  'control-data-quality',
  'second-review',
  'rules-governance',
  'reconciliation',
  'audit-trail',
  'audit-manual',
] as const;

const appearances = [
  { name: 'Light English desktop', theme: 'indigo-blue', language: 'en', width: 1366, height: 865, text: 'rgb(32, 35, 56)', surface: 'rgb(255, 255, 255)' },
  { name: 'Dark Bengali desktop', theme: 'dark-mode', language: 'bn', width: 1366, height: 865, text: 'rgb(232, 234, 237)', surface: 'rgb(43, 44, 47)' },
  { name: 'Dark English mobile', theme: 'dark-mode', language: 'en', width: 390, height: 844, text: 'rgb(232, 234, 237)', surface: 'rgb(43, 44, 47)' },
  { name: 'Light Bengali mobile', theme: 'indigo-blue', language: 'bn', width: 390, height: 844, text: 'rgb(32, 35, 56)', surface: 'rgb(255, 255, 255)' },
] as const;

for (const route of routes) {
  for (const mode of appearances) {
    test('Audit ' + route + ' — ' + mode.name + ' uses Golden Office tokens', async ({ page }) => {
      await page.setViewportSize({ width: mode.width, height: mode.height });
      await page.addInitScript(({ theme, language }) => {
        localStorage.setItem('gov_ui_auth', JSON.stringify({ isAuthenticated: true, userId: 'admin' }));
        localStorage.setItem('gov_ui_settings', JSON.stringify({
          assessmentYear: '2024-25', themeId: theme,
          fontId: 'poppins', fontSizeId: 'standard', languageId: language,
        }));
        localStorage.setItem('i18nextLng', language);
      }, { theme: mode.theme, language: mode.language });
      const uncaught: string[] = [];
      page.on('pageerror', error => uncaught.push(error.message));
      await page.goto('/audit/' + route);
      await expect(page.locator('#root')).toBeVisible({ timeout: 20000 });
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode.theme);
      await expect(page.locator('body')).toHaveCSS('color', mode.text);
      const state = await page.evaluate(() => {
        const root = document.documentElement;
        const tokens = getComputedStyle(root);
        const styles = getComputedStyle(document.body);
        const auditElements = document.querySelectorAll(
          '.audit-candidates-page, .audit-overview-v5, .table-page, .audit-manual-page, .responsive-overlay, [class*="audit-"]'
        ).length;
        return {
          pageOverflow: Math.max(0, root.scrollWidth - innerWidth),
          auditElements,
          textToken: tokens.getPropertyValue('--color-text-primary').trim(),
          surfaceToken: tokens.getPropertyValue('--color-surface').trim(),
          body: styles.color,
        };
      });
      expect(state.auditElements, 'Audit route must render actual Audit elements').toBeGreaterThan(0);
      expect(state.textToken.toLowerCase()).toBe(mode.theme === 'dark-mode' ? '#e8eaed' : '#202338');
      expect(state.surfaceToken.toLowerCase()).toBe(mode.theme === 'dark-mode' ? '#2b2c2f' : '#ffffff');
      expect(state.pageOverflow, 'No whole-page horizontal overflow').toBeLessThanOrEqual(2);
      expect(uncaught, 'No uncaught rendering errors').toEqual([]);
      await page.screenshot({
        path: 'test-results/audit-full-' + route + '-' + mode.theme + '-' + mode.language + '-' + mode.width + '.png',
        animations: 'disabled',
        fullPage: false,
      });
    });
  }
}

test('Audit Manual entry controls and content remain available in Bengali', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('gov_ui_auth', JSON.stringify({ isAuthenticated: true, userId: 'admin' }));
    localStorage.setItem('gov_ui_settings', JSON.stringify({
      assessmentYear: '2024-25', themeId: 'dark-mode',
      fontId: 'poppins', fontSizeId: 'standard', languageId: 'bn',
    }));
    localStorage.setItem('i18nextLng', 'bn');
  });
  await page.goto('/audit/audit-manual');
  await expect(page.locator('#root')).toContainText('অডিট ম্যানুয়াল');
  await expect(page.locator('#root')).toContainText('নিরীক্ষা নির্দেশনা');
  await expect(page.locator('#root')).not.toContainText('Reference row details');
});
