import { test, expect } from '@playwright/test';

test('Office dashboard opens directly without an authentication form', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await expect(page.locator('#login-user-id')).toBeVisible();
  await page.locator('#login-user-id').fill('admin');
  await page.getByRole('button',{name:'Sign in'}).click();
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
  await page.locator('#login-user-id').fill('admin');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Officer review inbox'})).toHaveCount(0);
  expect(protectedRequests).toEqual([]);
});

test('Office mobile navigation works without login state', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/register-stock/register-4');
  await page.locator('#login-user-id').fill('admin');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('#login-officer-email')).toHaveCount(0);
  await page.getByRole('button',{name:/navigation/i}).first().click();
  await expect(page.locator('.app-sidebar-shell--mobile.app-sidebar-shell--open')).toBeVisible();
});

test('profile Sign Out confirms, clears the UI session, and returns to the Office entry screen', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/dashboard/dashboard-main');
  await page.locator('#login-user-id').fill('admin');
  await page.getByRole('button',{name:'Sign in'}).click();
  await page.locator('.topbar__profile-button').click();
  await expect(page.locator('.account-dropdown')).toBeVisible();
  await page.locator('.account-dropdown__signout-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'Cancel'}).click();
  await expect(page.locator('.app-shell')).toBeVisible();

  await page.locator('.topbar__profile-button').click();
  await page.locator('.account-dropdown__signout-button').click();
  await page.getByRole('dialog').getByRole('button',{name:'Sign Out'}).click();
  await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
  await expect(page.locator('#login-user-id')).toBeVisible();
  await expect(page.locator('#login-officer-email')).toHaveCount(0);
  await expect(page.locator('.app-shell')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('#login-user-id')).toBeVisible();
  await page.locator('#login-user-id').fill('admin');
  await page.getByRole('button',{name:'Sign in'}).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/dashboard-main$/);
});

test('mobile profile keeps Sign Out accessible', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/dashboard/dashboard-main');
  await page.locator('#login-user-id').fill('admin');
  await page.getByRole('button',{name:'Sign in'}).click();
  await page.locator('.mobile-topbar__profile-button').click();
  await expect(page.locator('.account-dropdown__signout-button')).toBeVisible();
  await page.locator('.account-dropdown__signout-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
