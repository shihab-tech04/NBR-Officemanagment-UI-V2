import { expect, test } from '@playwright/test';
import { NAVIGATION, type MainNavDef } from '../src/app/data/navigation';

type NavChild = MainNavDef['children'][number];
function collect(prefix: string, items: NavChild[]): string[] {
  return items.flatMap(item => {
    const path = prefix + '/' + item.id;
    return item.children?.length ? collect(path, item.children) : [path];
  });
}
const routes = NAVIGATION.flatMap(main => collect('/' + main.id, main.children));
const widths = [
  {width: 375, height: 812},
  {width: 768, height: 1024},
  {width: 1280, height: 900},
  {width: 1920, height: 1080},
];

for(const size of widths) {
  for(const languageId of ['en','bn'] as const) {
    for(const route of routes) {
      test(size.width + 'px ' + languageId + ' ' + route + ': Office leaf renders and stays contained', async ({page}) => {
        await page.setViewportSize(size);
        await page.addInitScript((lang) => {
          sessionStorage.removeItem('office_ui_signed_out');
          localStorage.setItem('gov_ui_settings',JSON.stringify({
            assessmentYear:'2026-27',themeId:'indigo-blue',fontId:'inter',
            fontSizeId:'standard',languageId:lang,
          }));
        },languageId);
        const errors:string[]=[];
        page.on('pageerror',(e) => errors.push(e.message));
        await page.goto(route);
        await expect(page.locator('.app-shell')).toBeVisible();
        const content=page.locator('#main-content');
        await expect(content).toBeVisible();
        await expect.poll(async()=> (await content.innerText()).trim().length,{timeout:15000})
          .toBeGreaterThan(20);
        expect(await page.evaluate(() => window.location.pathname)).toBe(route);
        const overflow=await page.evaluate(()=>({
          document:document.documentElement.scrollWidth-document.documentElement.clientWidth,
          body:document.body.scrollWidth-document.documentElement.clientWidth,
        }));
        expect(overflow.document, 'root horizontal overflow').toBeLessThanOrEqual(2);
        expect(overflow.body,'body horizontal overflow').toBeLessThanOrEqual(2);
        expect(errors,'browser runtime exceptions').toEqual([]);
      });
    }
  }
}

test('Office navigation leaf coverage is not empty, duplicated or truncated', () => {
  expect(routes.length).toBeGreaterThan(65);
  expect(new Set(routes).size).toBe(routes.length);
  expect(routes).toContain('/administration/rules-calculation/tax-years');
  expect(routes).toContain('/administration/role-management');
  expect(routes).toContain('/payments/transactions');
  expect(routes).toContain('/audit/audit-overview');
});
