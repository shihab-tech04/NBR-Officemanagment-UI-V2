import { test, expect } from "@playwright/test";

const profile="/audit/audit-candidates?batch=AUD-2026-RISK-01&candidate=AC-2026-RISK-01-01";
test.beforeEach(async({page},info)=>{
  const lang=info.title.includes("Bengali")?"bn":"en";
  await page.addInitScript((language)=>{
    localStorage.setItem("gov_ui_auth",JSON.stringify({isAuthenticated:true,userId:"admin"}));
    localStorage.setItem("gov_ui_settings",JSON.stringify({
      assessmentYear:"2024-25",themeId:"indigo-blue",
      fontId:"poppins",fontSizeId:"standard",languageId:language,
    }));
    localStorage.setItem("i18nextLng",language);
  },lang);
});

for(const viewport of [{width:1366,height:865},{width:1024,height:768},{width:390,height:844},{width:360,height:800}]){
  test(`candidate compact UX and truthful money at ${viewport.width}px`,async({page})=>{
    await page.setViewportSize(viewport);
    await page.goto(profile);
    await expect(page.locator(".audit-candidate-detail__header")).toBeVisible({timeout:18000});
    await expect(page.locator(".audit-candidate-ay-tag")).toContainText("2025-26");
    await expect(page.locator(".audit-note-strip__item")).toHaveCount(2);
    await expect(page.locator(".audit-selection-decision__reason")).toHaveCount(0);
    await expect(page.locator(".audit-evidence-chip")).toContainText(["R-C1","R-E2"]);
    await expect(page.getByRole("heading",{name:"Three-year financial comparison"})).toBeVisible();
    const details=page.locator(".audit-financial-reconciliation");
    await expect(details).toBeVisible();
    await details.locator("summary").click();
    await expect(details).toHaveAttribute("open","");
    await expect(details).toContainText("3,074,468");
    await expect(details).toContainText("3,812,340");
    await expect(details).toContainText("737,872");
    const indicatorText=(await page.locator(".audit-key-indicator__changes").allTextContents()).join(" ");
    expect(indicatorText).not.toContain("−146.4%");
    expect(indicatorText).toContain("2,326,610");
    await expect(page.locator(".audit-trend-summary")).not.toContainText("−146.4%");
    await expect(page.locator(".audit-trend-summary")).toContainText("2,326,610");
    const selectors=page.locator(".audit-custom-comparison__selectors");
    const selectorCols=await selectors.evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(selectorCols).toBe(viewport.width<=767 ? 1 : 3);
    const firstSelector=selectors.locator(".audit-custom-comparison__selector-cell").first();
    expect(await firstSelector.getAttribute("title")).toBe("Source of fund");
    expect((await firstSelector.boundingBox())!.width).toBeGreaterThan(110);
    await expect(page.locator(".audit-custom-comparison__selector-context").first()).toBeHidden();
    const horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    expect(horizontalOverflow).toBeLessThanOrEqual(2);
    await page.screenshot({path:`test-results/audit-compact-ux-${viewport.width}.png`,animations:"disabled",fullPage:true});
  });
}
test("year mismatch and illustrative evidence explained by accessible info control",async({page})=>{
  await page.goto(profile);
  const year=page.locator(".audit-candidate-ay-tag");
  await year.hover();
  await expect(page.getByRole("tooltip").filter({hasText:"top-bar AY selector"})).toBeVisible();
  const head=page.locator(".audit-comparison-card__title-row .audit-inline-help");
  await head.focus();
  await expect(page.getByRole("tooltip").filter({hasText:"not actual verified taxpayer eReturns"})).toBeVisible();
});
test("Bengali candidate labels, source explanations and reconciliation stay visible",async({page})=>{
  await page.goto(profile);
  await expect(page.locator(".audit-note-strip__item")).toHaveCount(2);
  await expect(page.locator(".audit-candidate-ay-tag")).toContainText("2025-26");
  const title=page.locator("#return-comparison-title");
  await expect(title).toContainText("আর্থিক");
  const details=page.locator(".audit-financial-reconciliation");
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open","");
  await expect(details).toContainText("৳");
});
