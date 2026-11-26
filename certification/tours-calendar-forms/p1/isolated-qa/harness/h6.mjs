import { open, OUT, openForm } from "./lib.mjs";
const { browser, page, errors } = await open();
await openForm(page);
const canvas = page.getByTestId("processing-form-canvas");
for (const f of ["Parent / guardian first name", "Parent / guardian last name", "Child first name", "Child last name"]) {
  await canvas.getByText(f, { exact: false }).first().click(); await page.waitForTimeout(800);
  await page.getByTestId("form-builder-layout-width").getByText(/^Half$/).click(); await page.waitForTimeout(600);
}
await page.getByTestId("form-builder-save-draft").click(); await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}h6-edit-paired.png` });
const resp = page.waitForResponse(r => r.request().method() !== "GET" && /publish/i.test(r.url()), { timeout: 30000 }).catch(() => null);
await page.getByTestId("form-builder-publish").click(); await page.waitForTimeout(1500);
const confirm = page.getByRole("button", { name: /^(Publish|Confirm|Publish form|Publish now)$/ }).last();
if (await confirm.isVisible().catch(() => false)) await confirm.click();
const r = await resp; console.log("publish", r ? r.status() : "none");
await page.waitForTimeout(3000);
console.log("toolbar:", (await page.getByTestId("surface-publish-toolbar").innerText()).replace(/\n+/g, " | "));
await page.getByTestId("form-builder-distribution-section").click(); await page.waitForTimeout(2000);
console.log("DIST:", (await page.getByTestId("form-builder-distribution-section").innerText()).replace(/\n+/g, " | ").slice(0, 1500));
console.log(JSON.stringify(await page.locator("[data-testid^=location-]").evaluateAll(e => e.map(x => x.dataset.testid))));
await page.screenshot({ path: `${OUT}h6-distribution.png` });
console.log("errors", JSON.stringify(errors.slice(0, 5)));
await browser.close();
