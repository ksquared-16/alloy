import { open, OUT, openForm } from "./lib.mjs";
const { browser, page, errors } = await open();
await openForm(page);
const fields = ["Parent / guardian first name", "Parent / guardian last name", "Email", "Phone", "Child first name", "Child last name", "Email opt-in", "SMS opt-in"];
const added = [];
for (const f of fields) {
  const lib = page.getByTestId("processing-form-builder-library");
  if (!(await lib.isVisible().catch(() => false))) { await page.getByRole("button", { name: /^\+ (Add question|Question)$/ }).first().click(); await lib.waitFor({ timeout: 10000 }); }
  await page.getByTestId("form-builder-library-search").fill(f);
  await page.waitForTimeout(500);
  const item = lib.getByText(new RegExp(`^${f.replace(/[/]/g, "\\/")}$`)).first();
  await item.click(); await page.waitForTimeout(1200);
  added.push(f);
}
const canvas = await page.getByTestId("processing-form-canvas").innerText();
console.log("CANVAS:", canvas.replace(/\n+/g, " | ").slice(0, 1500));
await page.getByTestId("form-builder-save-draft").click(); await page.waitForTimeout(3000);
console.log("toolbar:", (await page.getByTestId("surface-publish-toolbar").innerText()).replace(/\n+/g, " | "));
await page.screenshot({ path: `${OUT}h5-fields.png` });
console.log("errors", JSON.stringify(errors.slice(0, 5)));
await browser.close();
