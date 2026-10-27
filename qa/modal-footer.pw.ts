import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.setItem('office_ui_entered','admin');
  localStorage.setItem('gov_ui_settings',JSON.stringify({assessmentYear:'2024-25',themeId:'indigo-blue',fontId:'inter',fontSizeId:'standard',languageId:'en'}));
 });
});
async function checkDesktopFooter(page:import('@playwright/test').Page, min=1){
 const footer=page.locator('.app-modal-footer:visible');
 await expect(footer).toBeVisible();
 const buttons=footer.locator(':scope > .app-btn:visible');
 await expect(buttons).toHaveCount(min);
 const b=await buttons.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();const f=n.parentElement!.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,footerRight:f.right};}));
 for(const v of b){
  expect(v.width,'footer button must not fill modal').toBeLessThan(240);
  expect(v.x+v.width,'button fits footer').toBeLessThanOrEqual(v.footerRight+2);
 }
 if(b.length===2){
  expect(Math.abs(b[0].y-b[1].y),'actions remain on same row').toBeLessThan(5);
  expect(b[0].x+b[0].width).toBeLessThanOrEqual(b[1].x);
 }
}
test('Payment add-offline-event modal matches Audit Candidates compact desktop footer',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/payments/offline-events');
 await page.getByRole('button',{name:'Add New'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await checkDesktopFooter(page,2);
 await expect(page.getByRole('button',{name:'Cancel'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Review draft'})).toBeVisible();
 await page.screenshot({path:'test-results/footer-payment-desktop.png',animations:'disabled'});
});
test('Audit Select Audit Candidates retains compact footer reference',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/audit/audit-candidates');
 await page.getByRole('button',{name:/Initiate Audit/i}).click();
 await expect(page.getByRole('dialog',{name:/Select Audit Candidates/i})).toBeVisible();
 await checkDesktopFooter(page,1);
 await page.screenshot({path:'test-results/footer-audit-reference.png',animations:'disabled'});
});
test('User Management Add User uses the same modal footer contract',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/administration/user-management');
 await page.getByRole('button',{name:/Add User/i}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await checkDesktopFooter(page,2);
 await page.screenshot({path:'test-results/footer-user-management.png',animations:'disabled'});
});
test('Payment modal bottom sheet keeps accessible 44px side-by-side actions on phone',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/payments/offline-events');
 await page.getByRole('button',{name:'Add New'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 const btns=page.locator('.app-modal-footer > .app-btn');
 await expect(btns).toHaveCount(2);
 await page.locator('.app-modal-panel').evaluate(async el=>{await Promise.all(el.getAnimations().map(animation=>animation.finished));});
 const bs=await btns.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};}));
 for(const p of bs){expect(p.h).toBeGreaterThanOrEqual(44);expect(p.x).toBeGreaterThanOrEqual(0);expect(p.x+p.w).toBeLessThanOrEqual(391);}
 expect(Math.abs(bs[0].y-bs[1].y),'mobile actions side by side').toBeLessThan(5);
 await page.screenshot({path:'test-results/footer-payment-mobile.png',animations:'disabled'});
});
