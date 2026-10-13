import { test, expect } from '@playwright/test';

test('single User ID login shows no password, email link or OTP', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/payments/transactions');
  await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'User ID'})).toBeVisible();
  await expect(page.locator('#login-password')).toHaveCount(0);
  await expect(page.getByText('Remember me')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Forgot password?'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await expect(page.getByText('Admin: admin · Taxpayer demo: user1–user10')).toBeVisible();
  await page.screenshot({path:'test-results/office-simple-id-login-desktop.png',fullPage:true,animations:'disabled'});
});

test('admin opens Office Management directly without Supabase authentication', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/payments/transactions');
  await page.getByRole('textbox',{name:'User ID'}).fill('admin');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard\/dashboard-main$/);
  await expect(page.locator('.app-shell')).toBeVisible({timeout:15000});
  await expect(page.getByRole('heading',{name:'Welcome back'})).toHaveCount(0);
  const id = await page.evaluate(()=>JSON.parse(localStorage.getItem('gov_ui_auth')||'{}').userId);
  expect(id).toBe('admin');
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible({timeout:15000});
  await expect(page.getByRole('heading',{name:'Welcome back'})).toHaveCount(0);
});

test('user1 and user10 open their own taxpayer demonstrations without passwords', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  for (const userId of ['user1','user10']) {
    await page.goto('/payments/transactions');
    await page.getByRole('textbox',{name:'User ID'}).fill(userId);
    await expect(page.locator('#login-password')).toHaveCount(0);
    await page.route('https://shihab-tech04.github.io/nbr-taxpay/**',route=>
      route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Demo destination</title>'}));
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await expect(page).toHaveURL(new RegExp('/nbr-taxpay/\\?action=taxpayer_home&demoUser='+userId+'$'));
  }
});

test('invalid ID and forged Office session cannot enter admin demo',async ({page})=>{
  await page.goto('/payments/transactions');
  await page.getByRole('textbox',{name:'User ID'}).fill('user11');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Enter admin or user1–user10.');
  await expect(page.locator('.app-shell')).toHaveCount(0);
  await page.addInitScript(()=>{
    localStorage.setItem('gov_ui_auth',JSON.stringify({isAuthenticated:true,userId:'forged-admin'}));
  });
  await page.reload();
  await expect(page.getByRole('textbox',{name:'User ID'})).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveCount(0);
});

test('admin demo excludes protected connected officer review',async ({page})=>{
  await page.goto('/payments/transactions');
  await page.getByRole('textbox',{name:'User ID'}).fill('admin');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.goto('/payments/transactions');
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Officer review inbox'})).toHaveCount(0);
});
