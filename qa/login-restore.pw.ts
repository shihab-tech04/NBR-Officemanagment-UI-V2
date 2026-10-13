import { test, expect } from '@playwright/test';

test('Office login retains original User ID, Password, Remember me and Forgot password layout', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/payments/transactions');
  await expect(page.getByRole('heading',{name:'Welcome back'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'User ID'})).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByText('Remember me')).toBeVisible();
  await expect(page.getByRole('button',{name:'Forgot password?'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  await expect(page.getByText('Sign in by secure email link.',{exact:false})).toHaveCount(0);
  await expect(page.getByText('Authorized officer email',{exact:true})).toHaveCount(0);
  await page.screenshot({path:'test-results/office-restored-login-desktop.png',fullPage:true,animations:'disabled'});
});

test('user1–user10 stay password-free demonstrations, never Office sessions', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/payments/transactions');
  const id = page.getByRole('textbox',{name:'User ID'});
  await id.fill('user1');
  await expect(page.getByLabel('Password')).toHaveCount(0);
  await expect(page.getByText('Remember me')).toHaveCount(0);
  await expect(page.getByText('Demo account · no password needed.')).toBeVisible();
  await page.route('https://shihab-tech04.github.io/nbr-taxpay/**',route=>
    route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Demo destination</title>'}));
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(/\/nbr-taxpay\/\?action=taxpayer_home&demoUser=user1/);
});

test('unapproved demo ID does not receive password-free access',async ({page})=>{
  await page.goto('/payments/transactions');
  await page.getByRole('textbox',{name:'User ID'}).fill('user11');
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByText('Demo account · no password needed.')).toHaveCount(0);
});
