import { test, expect } from "@playwright/test";

/** UX/UI v8.4: independent task-usability requirements from the rejected
 * Register-4 screenshot, NOT assertions copied from current implementation.
 * An unreadable/offscreen active editor is a release failure even if save works.
 */
for (const locale of ["en", "bn"] as const) {
  for (const width of [1280, 1440] as const) {
    test(`Register-4 active Add row keeps identity and commit actions together — ${locale}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(language => {
        localStorage.setItem("gov_ui_auth", JSON.stringify({ isAuthenticated: true, userId: "admin" }));
        localStorage.setItem("gov_ui_settings", JSON.stringify({
          assessmentYear: "2024-25", themeId: "indigo-blue", fontId: "inter",
          fontSizeId: "standard", languageId: language,
        }));
        localStorage.setItem("i18nextLng", language);
      }, locale);
      await page.goto("/register-stock/register-4");
      await page.getByRole("button", { name: locale === "bn" ? /সারি যোগ করুন/ : /Add row/i }).click();
      const row = page.getByTestId("register4-inline-row");
      await expect(row).toBeVisible();
      const tin = row.locator("input[id$='-tin']");
      const section = row.locator("#register4-inline-table-disposal_code");
      const save = row.getByRole("button", { name: locale === "bn" ? /সারি সংরক্ষণ/ : /Save row/ });
      const discard = row.getByRole("button", { name: locale === "bn" ? /সারি বাতিল/ : /Discard row/ });
      await expect(tin).toBeVisible();
      await expect(section).toBeVisible();
      await expect(save).toHaveCount(1);
      await expect(discard).toHaveCount(1);
      const m = await page.evaluate(() => {
        const table = document.querySelector<HTMLTableElement>(".card-table__table");
        const row = document.querySelector<HTMLTableRowElement>("[data-testid=register4-inline-row]");
        const tin = row?.querySelector<HTMLElement>("input[id$='-tin']");
        const section = row?.querySelector<HTMLElement>("#register4-inline-table-disposal_code");
        const sectionAdd = row?.querySelector<HTMLElement>(".register4-section-field__add");
        const save = row?.querySelector<HTMLElement>(".register4-inline__actions button:first-child");
        const cancel = row?.querySelector<HTMLElement>(".register4-inline__actions button:last-child");
        const wrapper = table?.closest(".card-table__wrapper");
        if (!table || !row || !tin || !section || !sectionAdd || !save || !cancel || !wrapper) return null;
        const rect=(x:Element)=>{const r=x.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width}};
        const addRect=sectionAdd.getBoundingClientRect();
        const atAddCenter=document.elementFromPoint(addRect.left+addRect.width/2,addRect.top+addRect.height/2);
        return {windowWidth:innerWidth, viewportLeft:Math.max(0,wrapper.getBoundingClientRect().left),
          viewportRight:Math.min(innerWidth,wrapper.getBoundingClientRect().right),
          scrollLeft:wrapper.scrollLeft, scrollExtent:wrapper.scrollWidth-wrapper.clientWidth,
          tin:rect(tin),section:rect(section),sectionAdd:rect(sectionAdd),
          sectionAddReachable:atAddCenter===sectionAdd||sectionAdd.contains(atAddCenter),
          save:rect(save),cancel:rect(cancel),row:rect(row)};
      });
      await page.screenshot({path:`test-results/register4-usability-${locale}-${width}.png`,animations:"disabled"});
      expect(m, "all approved task controls must exist in active UI").not.toBeNull();
      if (!m) return;
      // Single working viewport: no horizontal scrolling required between identity and commit.
      expect(m.tin.left, "TIN must be readable in current table viewport").toBeGreaterThanOrEqual(m.viewportLeft - 2);
      expect(m.section.left, "section editor must be within current viewport").toBeGreaterThanOrEqual(m.viewportLeft - 2);
      expect(m.section.right, "section editor must be usable without horizontal scroll").toBeLessThanOrEqual(m.viewportRight + 2);
      expect(m.sectionAdd.right, "existing Add a section action must be in view").toBeLessThanOrEqual(m.viewportRight + 2);
      expect(m.sectionAddReachable, "Add a section must not be covered by pinned actions").toBe(true);
      expect(m.save.right, "Save cannot be hidden at opposite end of horizontally scrolled table").toBeLessThanOrEqual(m.viewportRight + 2);
      expect(m.cancel.right, "Cancel must remain available alongside Save").toBeLessThanOrEqual(m.viewportRight + 2);
    });
  }
}
