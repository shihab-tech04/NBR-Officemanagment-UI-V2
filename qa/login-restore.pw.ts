import { test, expect } from '@playwright/test';

test('Office dashboard opens directly without an authentication form', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await expect(page).toHaveURL(/\/dashboard\/dashboard-main$/);
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('#login-officer-email')).toHaveCount(0);
  await expect(page.locator('#login-password')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Welcome back'})).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
});

test('protected TaxPay officer connection is absent from the open Office UI', async ({page}) => {
  const protectedRequests:string[]=[];
  page.on('request',request=>{
    if(request.url().includes('eyqhoavnitkrajvyqvxn.supabase.co'))protectedRequests.push(request.url());
  });
  await page.goto('/payments/transactions');
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Officer review inbox'})).toHaveCount(0);
  expect(protectedRequests).toEqual([]);
});

test('Office mobile navigation works without login state', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/register-stock/register-4');
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('#login-officer-email')).toHaveCount(0);
  await page.getByRole('button',{name:/navigation/i}).first().click();
  await expect(page.locator('.app-sidebar')).toBeVisible();
});

test('profile menu does not offer an obsolete Sign Out action', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/dashboard/dashboard-main');
  await page.locator('.topbar__profile-button').click();
  await expect(page.locator('.account-dropdown')).toBeVisible();
  await expect(page.locator('.account-dropdown__signout-button')).toHaveCount(0);
});
