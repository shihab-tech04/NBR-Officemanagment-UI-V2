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
 const height=await btn.evaluate(el=>el.getBoundingClientRect().height);
 expect(height).toBeGreaterThanOrEqual(44);
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