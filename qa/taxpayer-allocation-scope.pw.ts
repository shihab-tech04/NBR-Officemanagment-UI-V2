import { expect, test } from '@playwright/test';

const payment = {
  id: '00000000-0000-4000-8000-000000000091', service: 'OTHER_TAX_PAYMENT', amountMinor: 5000,
  status: 'SIMULATED_SUCCESS', createdAt: '2026-10-28T12:00:00Z',
  details: { payerId: 'user1', lines: [
    { beneficiary: 'user2', category: 'TAX_WITH_RETURN', assessmentYear: '2026-27', amountMinor: 3500, authorizationId: 'consent-2' },
    { beneficiary: 'user1', category: 'ADVANCE_TAX', assessmentYear: '2025-26', amountMinor: 1500 },
  ] },
};

for (const width of [320, 1280]) for (const language of ['en', 'bn'] as const) {
  test(`${width}px ${language} Taxpayer 360 shows only that taxpayer's allocation`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/functions/v1/demo-story1-office/**', route => {
      const isPayments = new URL(route.request().url()).pathname.endsWith('/payments');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        success: true, simulationOnly: true, data: isPayments ? { items: [payment], total: 1, page: 1, perPage: 100 } : [],
      }) });
    });
    await page.addInitScript(languageId => {
      sessionStorage.setItem('office_ui_entered', 'admin');
      localStorage.setItem('gov_ui_settings', JSON.stringify({ assessmentYear: '2027-28', themeId: 'indigo-blue', fontId: 'inter', fontSizeId: 'standard', languageId }));
      localStorage.setItem('i18nextLng', languageId);
    }, language);

    for (const [tin, ownAmount, otherAmount, ownYear, otherYear] of [
      ['2222222222222', '35', '15', '2026-27', '2025-26'],
      ['1111111111111', '15', '35', '2025-26', '2026-27'],
    ]) {
      await page.goto(`/payments/taxpayer-360/${tin}`);
      await page.getByRole('tab', { name: language === 'bn' ? 'পরিশোধ' : 'Payments', exact: true }).click();
      const table = page.locator('.payment-module__table-card');
      const digits = (value: string) => language === 'bn' ? value.replace(/\d/g, digit => '০১২৩৪৫৬৭৮৯'[Number(digit)]) : value;
      await expect(table).toContainText(new RegExp(`৳\\s*${digits(ownAmount)}`));
      await expect(table).not.toContainText(new RegExp(`৳\\s*${digits(otherAmount)}`));
      await expect(table).not.toContainText(new RegExp(`৳\\s*${digits('50')}`));
      await expect(table).toContainText(ownYear);
      await expect(table).not.toContainText(otherYear);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(2);
    }
  });
}

test('Taxpayer 360 register includes both TINs from reconciled allocation records', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const allocated = { ...payment, details: { taxpayerTin: '123456789012', assessmentYear: '2026-27',
    lines: [{ headId: 122, headNameEn: 'Advance tax', economicCode: '68A' }],
    allocations: [
      { taxpayerTin: '123456789012', headId: 122, assessmentYear: '2026-27', amountMinor: 1500 },
      { taxpayerTin: '234567890123', headId: 122, assessmentYear: '2025-26', amountMinor: 3500 },
    ] } };
  await page.route('**/functions/v1/demo-story1-office/**', route => {
    const isPayments = new URL(route.request().url()).pathname.endsWith('/payments');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      success: true, simulationOnly: true, data: isPayments ? { items: [allocated], total: 1, page: 1, perPage: 100 } : [],
    }) });
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('office_ui_entered', 'admin');
    localStorage.setItem('i18nextLng', 'en');
  });
  await page.goto('/payments/taxpayer-360');
  const table = page.locator('.payment-module__table-card');
  await expect(table).toContainText('123456789012');
  await expect(table).toContainText('234567890123');
});
