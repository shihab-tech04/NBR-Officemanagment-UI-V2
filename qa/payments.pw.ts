import { test, expect } from '@playwright/test';
const pages = ['overview','transactions','taxpayer-360','corrections','incidents','offline-events','analytics'];
const viewports = [
  {width:1440,height:900}, {width:1280,height:800}, {width:1024,height:768},
  {width:768,height:1024}, {width:390,height:844}, {width:360,height:800}, {width:320,height:568},
];
test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('gov_ui_auth',JSON.stringify({isAuthenticated:true,userId:'mock-officer'}));
    localStorage.setItem('gov_ui_settings',JSON.stringify({assessmentYear:'2027-28',themeId:'indigo-blue',fontId:'inter',fontSizeId:'standard',languageId:'en'}));
  });
});
for (const viewport of viewports) {
 for (const route of pages) {
  test(`${viewport.width}px ${route} responsive screenshot and navigation`, async({page})=>{
    await page.setViewportSize(viewport);
    await page.goto(`/payments/${route}`);
    await expect(page.locator(`[data-testid="payment-${route}"]`)).toBeVisible({timeout:18000});
    await expect(page.locator('.payment-module .table-page__title')).toBeVisible();
    await page.screenshot({path:`test-results/payments-${route}-${viewport.width}.png`,fullPage:true,animations:'disabled'});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth - innerWidth);
    expect(overflow,'no app-wide horizontal overflow').toBeLessThanOrEqual(2);
    if(viewport.width<=390 && route==='taxpayer-360'){
      const strip=page.locator('.payment-module__tab-scroll .tab-bar');
      await expect(strip).toBeVisible();
      const layout=await strip.evaluate(el=>getComputedStyle(el).flexWrap);
      expect(layout).toBe('nowrap');
    }
  });
 }
}
// Regression from the 13 Oct desktop screenshot: content-width tables left
// the majority of the Payment card empty. Compare actual rendered geometry.
for(const viewport of [{width:1713,height:859},{width:1440,height:900},{width:1280,height:800},{width:1024,height:768}]){
 for(const route of ['transactions','corrections','offline-events','incidents']){
  test(`${viewport.width}px ${route} desktop table occupies its card`,async({page})=>{
   await page.setViewportSize(viewport);
   await page.goto(`/payments/${route}`);
   const root=page.locator('.payment-module__table-card');
   await expect(root).toBeVisible();
   const layout=await page.evaluate(()=>{
     const card=document.querySelector('.payment-module__table-card')!;
     const wrapper=card.querySelector('.card-table__wrapper')!;
     const table=card.querySelector('.card-table__table')!;
     return {card:card.getBoundingClientRect().width,wrapper:wrapper.getBoundingClientRect().width,table:table.getBoundingClientRect().width};
   });
   expect(layout.wrapper,'wrapper fills card').toBeGreaterThan(layout.card*.95);
   expect(layout.table,'table fills card').toBeGreaterThan(layout.wrapper*.95);
   expect(layout.table,'no excessive overflow').toBeLessThanOrEqual(layout.wrapper+4);
   if(viewport.width===1713&&route==='transactions'){
    await page.screenshot({path:'test-results/payment-table-fullwidth-1713.png',fullPage:true,animations:'disabled'});
   }
  });
 }
}

test('mobile transaction card distinguishes receipt and tax-credit status',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/payments/transactions');
 await expect(page.locator('.mobile-table-card').first()).toBeVisible({timeout:18000});
 const text=await page.locator('.mobile-table-card-list').innerText();
 expect(text).toContain('Not yet credited');
 expect(text).toContain('Failed');
});
test('small-screen correction modal has tappable actions',async({page})=>{
 await page.setViewportSize({width:360,height:800});
 await page.goto('/payments/corrections');
 await expect(page.locator('.payment-module')).toBeVisible();
 await page.getByRole('button',{name:'Add New'}).click();
 const modal=page.locator('#payment-draft-form');
 await expect(modal).toBeVisible();
 const btn=page.locator('.app-modal-footer .app-btn--primary');
 await expect(btn).toBeVisible();
 await expect.poll(()=>btn.evaluate(el=>el.getBoundingClientRect().height),{timeout:3000}).toBeGreaterThanOrEqual(44);
});
for (const config of [
 {languageId:'bn',themeId:'dark-mode',fontSizeId:'large',viewport:{width:390,height:844}},
 {languageId:'en',themeId:'indigo-blue',fontSizeId:'compact',viewport:{width:1440,height:900}},
]) {
 for(const route of pages) {
  test(`${route} ${config.languageId}/${config.themeId}/${config.fontSizeId}`,async({page})=>{
   await page.addInitScript(cfg => {
     localStorage.setItem('gov_ui_settings',JSON.stringify({...cfg,assessmentYear:'2027-28',fontId:'inter'}));
     localStorage.setItem('i18nextLng',cfg.languageId);
   },config);
   await page.setViewportSize(config.viewport);
   await page.goto(`/payments/${route}`);
   await expect(page.locator(`[data-testid="payment-${route}"]`)).toBeVisible();
   await page.screenshot({path:`test-results/${route}-${config.languageId}-${config.themeId}-${config.fontSizeId}.png`,fullPage:true,animations:'disabled'});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth - innerWidth);
   expect(overflow).toBeLessThanOrEqual(2);
  });
 }
}

// Regression evidence for the post-release source audit. These assertions are in addition
// to the original 65 responsive checks, not substitutes for them.
test('first visit shows mock payment records independently of Office Management tax-year selection', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/payments/transactions');
  await expect(page.locator('[data-testid="payment-transactions"]')).toBeVisible();
  await expect(page.locator('.card-table tbody tr')).toHaveCount(5);
  await expect(page.getByLabel('Sample AY')).toBeVisible();
  await expect(page.locator('#topbar-assessment-year')).toHaveCount(0);
});

test('newest and oldest sort use chronological dates, not displayed string order', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/payments/transactions');
  const sort=page.getByRole('combobox',{name:'Sort'});
  await sort.selectOption('-date');
  await expect(page.locator('.card-table tbody tr').first()).toContainText('12 Oct 2026');
  await sort.selectOption('date');
  await expect(page.locator('.card-table tbody tr').first()).toContainText('03 Sep 2026');
});

test('mobile transaction cards have an explicit View Details action', async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/payments/transactions');
  const viewButton=page.locator('.mobile-table-card__action-btn').first();
  await expect(viewButton).toBeVisible();
  await viewButton.click();
  await expect(page.getByText('PT-2026-000922').last()).toBeVisible();
});

test('Taxpayer 360 summary and credit preview are distinct functional tabs', async({page})=>{
  await page.setViewportSize({width:1280,height:850});
  await page.goto('/payments/taxpayer-360');
  await page.getByRole('tab',{name:'Tax position'}).click();
  await expect(page.getByText('Payment receipt and credit summary from the selected sample records. Tax liability is not modeled.')).toBeVisible();
  await page.getByRole('tab',{name:'Ledger'}).click();
  await expect(page.getByText('Sample payment credit states only')).toBeVisible();
  await page.getByRole('tab',{name:'Returns'}).click();
  await expect(page.getByText('No return entries exist in the supplied sample records.')).toBeVisible();
});