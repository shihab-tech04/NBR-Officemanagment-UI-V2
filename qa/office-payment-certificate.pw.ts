import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { installIsolatedOfficeOfficer } from './isolated-office-officer';

// Isolated source record: never writes to hosted SQL or pretends to be a
// production financial transaction.
const id='3f3a5de8-1f5b-45a4-8a76-87c53e72c001';
const payment={id,service:'PENALTY',amountMinor:5000,status:'SIMULATED_SUCCESS',
 createdAt:'2026-11-12T04:30:00Z',certificateReference:'SK-PC-'+id,
 details:{payerName:'Payer One',payerTin:'111111111111',taxpayerName:'Recipient One',
 taxpayerTin:'222222222222',assessmentYear:'2026-27',payerMode:'OTHER',
 receiptReference:'CH-2026-00051',lines:[{headId:120,headNameEn:'Penalty',
 economicCode:'1-1001-0000-1201',taxAmount:0,penaltyAmount:50,surchargeAmount:0,
 interestAmount:0,totalAmount:50,amountMinor:5000}]}};

for(const language of ['en','bn'] as const) for(const width of [1280,320]){
 test(`certificate ${language} ${width}px: real modal, PDF and print surface`,async({page},testInfo)=>{
  test.setTimeout(60000);
  await page.setViewportSize({width,height:900});
  await installIsolatedOfficeOfficer(page);
  await page.route('**/functions/v1/demo-story1-office/**',route=>{
   const isPayments=new URL(route.request().url()).pathname.endsWith('/payments');
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    success:true,simulationOnly:true,data:isPayments?{items:[payment],total:1,page:1,perPage:100}:[],
   })});
  });
  await page.addInitScript(languageId=>{
   sessionStorage.setItem('office_ui_entered','admin');
   localStorage.setItem('gov_ui_settings',JSON.stringify({assessmentYear:'2027-28',themeId:'indigo-blue',fontId:'inter',fontSizeId:'standard',languageId}));
   localStorage.setItem('i18nextLng',languageId);
   Object.defineProperty(window,'print',{value:()=>document.documentElement.setAttribute('data-qa-printed','yes'),configurable:true});
  },language);
  await page.goto('/payments/transactions/record/'+id);
  const view=page.getByRole('button',{name:language==='bn'?'পেমেন্ট সনদ দেখুন':'View payment certificate',exact:true});
  await expect(view).toBeVisible({timeout:20000});
  await view.click();
  const modal=page.getByRole('dialog');
  await expect(modal).toBeVisible();
  const document=modal.getByTestId('payment-certificate-document');
  await expect(document).toBeVisible();
  await expect(document.getByTestId('payment-certificate-reference')).toContainText('SK-PC-'+id);
  await expect(document.getByTestId('payment-certificate-total')).toContainText(language==='bn'?'৫০':'50');
  await expect(document.getByText('Recipient One').first()).toBeAttached();
  await expect(document.getByTestId('payment-certificate-line-row')).toHaveCount(1);
  if(width===320) await expect(document.getByTestId('payment-certificate-mobile-lines')).toBeVisible();
  else await expect(document.getByTestId('payment-certificate-allocation-table')).toBeVisible();
  expect(await page.evaluate(()=>window.document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
  await modal.screenshot({path:testInfo.outputPath('certificate.png'),animations:'disabled'});
  const pending=page.waitForEvent('download');
  await modal.getByRole('button',{name:language==='bn'?'পিডিএফ ডাউনলোড':'Download PDF',exact:true}).click();
  const download=await pending;
  expect(download.suggestedFilename()).toBe('Payment-certificate-'+id+'.pdf');
  const filename=testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(filename);
  const pdf=await readFile(filename);
  expect(pdf.subarray(0,5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(1000);
  await modal.getByRole('button',{name:language==='bn'?'সনদ প্রিন্ট':'Print certificate',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('data-qa-printed','yes');
  await page.emulateMedia({media:'print'});
  await expect(document.getByTestId('payment-certificate-allocation-table')).toBeVisible();
  await expect(document.getByTestId('payment-certificate-mobile-lines')).toBeHidden();
  await expect(modal.locator('.app-modal-footer')).toBeHidden();
  await page.emulateMedia({media:'screen'});
  await modal.getByRole('button',{name:language==='bn'?'বিস্তারিত তথ্যে ফিরুন':'Back to details',exact:true}).click();
  await expect(view).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
 });
}
