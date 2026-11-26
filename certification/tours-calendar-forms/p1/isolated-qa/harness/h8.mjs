import { open, TOUR, OUT } from "./lib.mjs";
const { browser, page } = await open({ auth: false });
await page.goto(TOUR, { waitUntil: "networkidle", timeout: 90000 });
await page.getByTestId("public-tour-times").getByRole("button").first().click();
await page.getByRole("button", { name: /Continue/ }).first().click(); await page.waitForTimeout(3500);
const out = {};
for (const f of ["Parent / guardian first name", "Parent / guardian last name", "Email", "Phone", "Child first name", "Child last name"]) {
  const b = await page.getByText(new RegExp(`^${f.replace("/", "\\/")}\\s*\\*?$`)).first().boundingBox().catch(() => null);
  out[f] = b && [Math.round(b.x), Math.round(b.y)];
}
console.log(JSON.stringify(out));
await page.screenshot({ path: `${OUT}h8-runtime.png`, fullPage: true });
await browser.close();
