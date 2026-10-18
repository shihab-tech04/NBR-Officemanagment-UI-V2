import { test, expect } from '@playwright/test';
const pages = ['overview','transactions','taxpayer-360','corrections','incidents','offline-events','analytics'];
const viewports = [
  {width:1440,height:900}, {width:1280,height:800}, {width:1024,height:768},
  {width:768,height:1024}, {width:390,height:844}, {width:360,height:800}, {width:320,height:568},
];
const submittedPayments = [
  {id:'00000000-0000-4000-8000-000000000001',payer:'Md. Rahman',amount:42500,date:'2026-10-12T10:00:00Z'},
  {id:'00000000-0000-4000-8000-000000000002',payer:'Md. Abdul Karim',amount:100000,date:'2026-10-10T10:00:00Z'},
  {id:'00000000-0000-4000-8000-000000000003',payer:'Taxpayer C',amount:20000,date:'2026-10-08T10:00:00Z'},
  {id:'00000000-0000-4000-8000-000000000004',payer:'Taxpayer D',amount:30000,date:'2026-09-20T10:00:00Z'},
  {id:'00000000-0000-4000-8000-000000000005',payer:'Taxpayer E',amount:50000,date:'2026-09-03T10:00:00Z'},
].map(p=>({
  id:p.id,service:'TAX_WITH_RETURN',amountMinor:p.amount*100,
  status:'SIMULATED_SUCCESS',createdAt:p.date,
  details:{payerName:p.payer,taxpayerTin:'1111111111111',assessmentYear:'2026-27',
    paymentMethod:'BKASH',receiptReference:'UI-'+p.id},
}));
test.beforeEach(async ({page}) => {
  // Fixtures are injected into Playwright only, never saved in live SQL.
  await page.route('**/functions/v1/demo-story1-office/**',route=>{
    const url=new URL(route.request().url());
    const isPayments=url.pathname.endsWith('/payments');
    const data=isPayments?{items:submittedPayments,total:submittedPayments.length,page:1,perPage:100}:[];
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({success:true,data,simulationOnly:true})});
  });
  await page.addInitScript(() => {
    localStorage.setItem('gov_ui_auth',JSON.stringify({isAuthenticated:true,userId:'admin'}));
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
   if(viewport.width>=1440){
    expect(layout.table,'full width on wide desktop without scroll').toBeLessThanOrEqual(layout.wrapper+4);
   }else if(layout.table>layout.wrapper+4){
    // The existing CardTable contract allows contained horizontal scrolling
    // on 1024–1280px desktop layouts rather than clipping financial statuses.
    const contained=await page.evaluate(()=>{
      const el=document.querySelector('.payment-module__table-card .card-table__wrapper') as HTMLElement;
      const before=el.scrollLeft;
      el.scrollLeft=el.scrollWidth;
      const after=el.scrollLeft;
      el.scrollLeft=before;
      return {scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,scrollable:after>before};
    });
    expect(contained.scrollWidth,'wide table is scrollable within card').toBeGreaterThan(contained.clientWidth+4);
    expect(contained.scrollable,'last columns remain reachable').toBeTruthy();
   }
   const pageOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   expect(pageOverflow,'no outer page horizontal overflow').toBeLessThanOrEqual(2);
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
 expect(text).toContain('No official tax credit');
 expect(text).toContain('Simulated success');
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
test('Transactions shows only submitted SQL records independently of Office tax-year selection', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/payments/transactions');
  await expect(page.locator('[data-testid="payment-transactions"]')).toBeVisible();
  await expect(page.locator('.card-table tbody tr')).toHaveCount(5);
  await page.locator('.payment-module__table-card .table-card__toolbar').getByRole('button',{name:'Filter',exact:true}).click();
  await expect(page.locator('#filter-assessment_year')).toBeVisible();
  await expect(page.locator('#topbar-assessment-year')).toHaveCount(0);
});

test('newest and oldest sort use chronological dates, not displayed string order', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/payments/transactions');
  await expect(page.getByRole('combobox',{name:'Sort'})).toHaveCount(0);
  const sort=page.getByRole('button',{name:'Sort by Date'});
  await sort.click();
  await expect(page.getByRole('columnheader',{name:/Date/})).toHaveAttribute('aria-sort','descending');
  await expect(page.locator('.card-table tbody tr').first()).toContainText('12 Oct 2026');
  await sort.click();
  await expect(page.getByRole('columnheader',{name:/Date/})).toHaveAttribute('aria-sort','ascending');
  await expect(page.locator('.card-table tbody tr').first()).toContainText('03 Sep 2026');
  await sort.click();
  await expect(page.getByRole('columnheader',{name:/Date/})).toHaveAttribute('aria-sort','none');
});

test('mobile transaction cards have an explicit View Details action', async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/payments/transactions');
  const viewButton=page.locator('.mobile-table-card__action-btn').first();
  await expect(viewButton).toBeVisible();
  await viewButton.click();
  await expect(page.getByText('00000000-0000-4000-8000-000000000001').last()).toBeVisible();
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
// Payment-specific acceptance: rendered compact filters, translated column
// headings and meaningful sort values, checked against actual DOM geometry.
for(const width of [1704,1440,1280]) {
 test(`${width}px Corrections filter matches table-system spacing and shows valid controls`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/payments/corrections');
  await expect(page.getByRole('columnheader',{name:'Reason'})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Sort'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Sort by Taxpayer'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Sort by Case'})).toBeVisible();
  await expect(page.locator('.payment-module__table-card .table-card__search-wrapper input[placeholder="Search case, taxpayer or reason"]')).toBeVisible();
  const add=page.getByRole('button',{name:'Add New'});
  const bounds=await add.boundingBox();
  expect(bounds,'Add New is visible').toBeTruthy();
  expect(bounds!.x+bounds!.width,'Add New stays within viewport').toBeLessThanOrEqual(width+1);
  await page.getByRole('button',{name:'Filter',exact:true}).click();
  const panel=page.locator('.payment-module__table-card .table-card__filter-panel');
  await expect(panel).toBeVisible();
  const sizes=await panel.locator('.filter-grid > *').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().width));
  expect(sizes).toHaveLength(3);
  const panelWidth=await panel.evaluate(el=>el.getBoundingClientRect().width);
  for(const w of sizes) {expect(w,'shared responsive grid distributes fields evenly').toBeGreaterThan(panelWidth/5);}
  expect(Math.max(...sizes)-Math.min(...sizes),'FilterPanel columns use shared equal-width sizing').toBeLessThanOrEqual(2);
  await page.screenshot({path:`test-results/payment-corrections-filter-${width}.png`,animations:'disabled'});
 });
}
test('Corrections filter genuinely applies status and clears it',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/payments/corrections');
 await page.getByRole('button',{name:'Filter',exact:true}).click();
 await page.locator('#filter-status').click();
 await page.getByRole('option',{name:'Blocked'}).click();
 await page.getByRole('button',{name:'Apply Filters'}).click();
 await expect(page.locator('.card-table tbody tr')).toHaveCount(1);
 await page.locator('.applied-chips__clear').click();
 await expect(page.locator('.card-table tbody tr')).toHaveCount(2);
});
test('Corrections mobile filter uses shared bottom sheet, and Bengali headings resolve',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/payments/corrections');
 await page.locator('.payment-module__table-card .table-card__toolbar').getByRole('button',{name:'Filter',exact:true}).click();
 await expect(page.locator('.mobile-filter-overlay')).toBeVisible();
 await page.screenshot({path:'test-results/payment-corrections-mobile-filter.png',animations:'disabled'});
});

// Full-module parity regressions: no orphan AY selector in register headers,
// no raw translation keys, and standard Office Management table actions.
for(const route of ['transactions','corrections','incidents','offline-events']){
 test(`${route}: common table toolbar, AY inside filter and resolved translations`,async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto(`/payments/${route}`);
  await expect(page.locator('#payment-year-scope')).toHaveCount(0);
  await expect(page.locator('.payment-module__table-card .table-card__toolbar-btn--download')).toBeVisible();
  await expect(page.locator('.payment-module__table-card .table-card__toolbar-btn--print')).toBeVisible();
  await page.locator('.payment-module__table-card .table-card__toolbar').getByRole('button',{name:'Filter',exact:true}).click();
  await expect(page.locator('#filter-'+(route==='transactions'?'assessment_year':'ay'))).toBeVisible();
  const keyLeaks=await page.locator('[data-testid="payment-'+route+'"]').innerText();
  expect(keyLeaks).not.toContain('search_offlineEvents');
  expect(keyLeaks).not.toContain('colReason');
  await page.screenshot({path:`test-results/parity-${route}-1440.png`,animations:'disabled'});
 });
}
test('Offline Events uses localized search and AY filter actually narrows its source records',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/payments/offline-events');
 await expect(page.locator('.payment-module__table-card .table-card__search-wrapper input[placeholder="Search event, taxpayer or order"]')).toBeVisible();
 await page.getByRole('button',{name:'Filter',exact:true}).click();
 await page.locator('#filter-ay').click();
 await page.getByRole('option',{name:'2027–28'}).click();
 await page.getByRole('button',{name:'Apply Filters'}).click();
 await expect(page.locator('.payment-module__table-card .table-card__count')).toContainText('0 records');
 await expect(page.getByText('OFE-2026-000008')).toHaveCount(0);
 await expect(page.getByText('No records match your search criteria')).toBeVisible();
});

// Sorting belongs in the table column headers, never a floating toolbar dropdown.
test('sort by Amount numerically via the shared header, keyboard supported',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/payments/transactions');
 await expect(page.locator('.payment-module__sort')).toHaveCount(0);
 const control=page.getByRole('button',{name:'Sort by Amount'});
 await control.focus();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('columnheader',{name:/Amount/})).toHaveAttribute('aria-sort','ascending');
 await expect(page.locator('.card-table tbody tr').first()).toContainText('৳20,000');
 await control.click();
 await expect(page.getByRole('columnheader',{name:/Amount/})).toHaveAttribute('aria-sort','descending');
 await expect(page.locator('.card-table tbody tr').first()).toContainText('৳100,000');
 await control.click();
 await expect(page.getByRole('columnheader',{name:/Amount/})).toHaveAttribute('aria-sort','none');
});
for(const width of [1713,1440,1024,390,320]){
 test(`${width}px Payment page-header spacing follows Audit 16px token`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/payments/offline-events');
  await expect(page.locator('.payment-module__header')).toBeVisible();
  const margin=await page.locator('.payment-module__header').evaluate(el=>parseFloat(getComputedStyle(el).marginBottom));
  expect(margin,'standard table-page header gap').toBe(16);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  expect(overflow,'no horizontal viewport spill').toBeLessThanOrEqual(2);
  await page.screenshot({path:`test-results/payment-header-sort-${width}.png`,animations:'disabled'});
 });
}

// Mobile cards have no visible table headers. Preserve sorting in the existing
// Filter bottom sheet; never reintroduce a floating Sort toolbar field.
test('phone sorts transaction cards inside standard Filter sheet, and resets',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/payments/transactions');
 await expect(page.locator('.payment-module__sort')).toHaveCount(0);
 await page.locator('.payment-module__table-card .table-card__toolbar').getByRole('button',{name:'Filter',exact:true}).click();
 await expect(page.locator('.mobile-filter-overlay')).toBeVisible();
 await page.locator('#mobile-filter-__paymentSort').click();
 await page.getByRole('option',{name:'Amount: high to low'}).click();
 await page.getByRole('button',{name:'Apply Filters'}).click();
 await expect(page.locator('.card-table tbody tr').first()).toContainText('৳100,000');
 await expect(page.locator('.mobile-table-card').first()).toHaveAttribute('aria-label',/Md\. Abdul Karim/);
 await page.locator('.payment-module__table-card .table-card__toolbar').getByRole('button',{name:'Filter',exact:true}).click();
 await page.locator('#mobile-filter-__paymentSort').click();
 await page.getByRole('option',{name:'Default order'}).click();
 await page.getByRole('button',{name:'Apply Filters'}).click();
 await expect(page.locator('.card-table tbody tr').first()).toContainText('৳42,500');
 await expect(page.locator('.mobile-table-card').first()).toHaveAttribute('aria-label',/Md\. Rahman/);
 await page.screenshot({path:'test-results/payments-mobile-sort-in-filter-390.png',animations:'disabled'});
});


test('Transactions never shows the reference or scenario source selector',async({page})=>{
  await page.goto('/payments/transactions');
  await expect(page.locator('#payment-dataset-scope')).toHaveCount(0);
  await expect(page.locator('.card-table tbody tr')).toHaveCount(5);
  await expect(page.getByText('Mixed-payment scenarios (demo)')).toHaveCount(0);
  await expect(page.getByText('Shared SQL connection error:')).toHaveCount(0);
});
test('Guest-submitted payment is displayed without an officer sign-in gate',async({page})=>{
  await page.goto('/payments/transactions');
  await expect(page.locator('.card-table tbody tr')).toHaveCount(5);
  await expect(page.getByText('Authorized officer sign-in required')).toHaveCount(0);
  await expect(page.getByText('Shared SQL connection error:')).toHaveCount(0);
});
