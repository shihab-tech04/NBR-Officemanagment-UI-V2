import { test, expect } from "@playwright/test";

/** End-to-end approval-free Office Audit prototype journey, with real browser storage. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("gov_ui_settings", JSON.stringify({
      assessmentYear:"2025-26",themeId:"indigo-blue",fontId:"poppins",
      fontSizeId:"standard",languageId:"en",
    }));
    localStorage.setItem("i18nextLng","en");
  });
});
test("local case evidence, signal verification, Finding, sign-off and trail persist across reload", async ({ page }) => {
  await page.goto("/audit/audit-candidates?batch=AUD-2026-RISK-01&candidate=AC-2026-RISK-01-01");
  await expect(page.locator(".audit-candidate-detail__header")).toContainText("Rahman Enterprise",{timeout:18000});
  for (const nextStatus of ["Assigned","Verifying"]) {
    await page.getByRole("button",{name:"Update audit progress"}).click();
    await page.getByRole("combobox",{name:/Next status/}).click();
    await page.getByRole("option",{name:nextStatus,exact:true}).click();
    await page.getByRole("textbox",{name:/Reason or review note/})
      .fill("Reviewed and advanced this case to " + nextStatus + " for document checks");
    await page.getByRole("button",{name:"Save status"}).click();
    await expect(page.getByText("Audit status saved on this device.").last()).toBeVisible();
  }
  await page.goto("/audit/risk-cases");
  await expect(page.locator(".table-card")).toContainText("CASE-2026-001");
  await page.getByRole("row",{name:/CASE-2026-001/}).click();

  for(const entry of [
    { signal:"R-C1", reference:"BANK-DOC-1001", note:"Examined reconciled funds-flow return figures" },
    { signal:"R-E2", reference:"REGISTRY-DOC-1002", note:"Examined property-registry source values" },
  ]) {
    await page.getByRole("button",{name:"Record evidence"}).click();
    const dialog=page.getByRole("dialog",{name:"Record evidence"});
    await expect(dialog).toBeVisible();
    if(entry.signal !== "R-C1") {
      await dialog.getByRole("combobox",{name:"Risk signal"}).click();
      await page.getByRole("option",{name:entry.signal}).click();
    }
    await dialog.getByRole("textbox",{name:"Document or certificate reference"}).fill(entry.reference);
    await dialog.getByRole("textbox",{name:"Specific verification or review note"}).fill(entry.note);
    await dialog.getByRole("button",{name:"Save",exact:true}).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button",{name:"Verify evidence"}).click();
    const verify=page.getByRole("dialog",{name:"Verify evidence"});
    await verify.getByRole("textbox",{name:"Specific verification or review note"})
      .fill("Verified the named source document against the taxpayer return figures");
    await verify.getByRole("button",{name:"Save",exact:true}).click();
    await expect(verify).toHaveCount(0);
  }
  await page.getByRole("button",{name:"Submit Finding"}).click();
  const finding=page.getByRole("dialog",{name:"Submit Finding"});
  await finding.getByRole("textbox",{name:"Evidence-based Finding"})
    .fill("The return funds-flow and registry asset signals match the reviewed document evidence");
  await finding.getByRole("button",{name:"Save",exact:true}).click();
  await expect(finding).toHaveCount(0);

  await page.goto("/audit/second-review");
  await expect(page.locator(".table-card")).toContainText("CASE-2026-001");
  await page.locator(".card-table__tbody tr").filter({hasText:"CASE-2026-001"}).click();
  await page.getByRole("button",{name:"Sign off"}).click();
  const review=page.getByRole("dialog",{name:"Sign off"});
  await review.getByRole("textbox",{name:"Specific verification or review note"})
    .fill("Reviewed both R-C1 and R-E2 evidence references and the submitted Finding");
  await review.getByRole("button",{name:"Save",exact:true}).click();
  await expect(review).toHaveCount(0);

  await page.reload();
  await page.goto("/audit/risk-cases");
  await expect(page.locator(".card-table__tbody tr").filter({hasText:"CASE-2026-001"})).toContainText("Closed");
  await page.goto("/audit/audit-trail");
  await expect(page.locator(".table-card")).toContainText("Second review signed off");
});
test("control flag review writes one linked taxpayer decision and Audit Trail entry", async ({ page }) => {
  await page.goto("/audit/control-data-quality");
  await expect(page.getByRole("table",{name:"Control & Data Quality"}).getByRole("row").nth(1)).toBeVisible({timeout:18000});
  const first=page.locator(".card-table__tbody tr").first();
  const returnId=(await first.getByRole("cell").first().innerText()).trim();
  await first.click();
  await page.getByRole("button",{name:"Review control"}).click();
  const dialog=page.getByRole("dialog",{name:"Review control"});
  await dialog.getByRole("textbox",{name:"Review reason"})
    .fill("Review started against the source return and supporting statement");
  await dialog.getByRole("button",{name:"Save review"}).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".table-card")).toContainText("In Progress");
  await page.goto("/audit/audit-trail");
  await expect(page.locator(".table-card")).toContainText("Control ");
  await expect(page.locator(".table-card")).toContainText(returnId);
});
