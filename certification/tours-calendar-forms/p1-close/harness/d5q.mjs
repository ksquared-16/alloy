import { open, TOUR } from "./lib.mjs";
const OUT = new URL("./out2/", import.meta.url).pathname;
const { browser, page, errors } = await open({ auth: false });
const posts = [];
page.on("request", (q) => { if (q.method() === "POST" && /\/submit$/.test(q.url())) { try { const b = q.postDataJSON(); posts.push({ marketing_consent: b.marketing_consent, valueKeys: Object.keys(b.payload?.values ?? {}) }); } catch {} } });
page.on("response", (r) => { if (r.request().method() === "POST" && /\/submit$/.test(r.url())) posts.push({ status: r.status() }); });
await page.goto(TOUR, { waitUntil: "networkidle", timeout: 90000 });
await page.getByTestId("public-tour-times").getByRole("button").first().click();
await page.getByRole("button", { name: /Continue/ }).first().click(); await page.waitForTimeout(4000);
const body = await page.locator("body").innerText();
const r = {
  optInFieldLabels: ["Email opt-in", "SMS opt-in"].filter((l) => body.split("\n").some((x) => x.trim().replace(/\s*\*$/, "") === l)),
  consentBlock: await page.getByTestId("public-marketing-consent").count(),
  checkboxes: await page.locator('input[type="checkbox"]').count(),
};
// D8 — controls reachable by their labels
r.byLabel = {};
for (const l of ["Parent / guardian first name", "Parent / guardian last name", "Email", "Phone", "Child first name", "Child last name"]) {
  r.byLabel[l] = await page.getByLabel(new RegExp(`^${l.replace("/", "\\/")}\\s*\\*?$`)).count();
}
await page.getByLabel(/^Parent \/ guardian first name/).fill("Morgan");
await page.getByLabel(/^Parent \/ guardian last name/).fill("Consentqa");
await page.getByLabel(/^Email\s*\*$/).fill("qa+enrconsent1@example.invalid");
await page.getByLabel(/^Phone$/).fill("5415550199");
await page.getByLabel(/^Child first name/).fill("Rowan");
await page.getByLabel(/^Child last name/).fill("Consentqa");
await page.getByTestId("public-marketing-consent-email").check();
await page.screenshot({ path: `${OUT}d5-step2-single-consent.png`, fullPage: true });
await page.getByRole("button", { name: /^Submit$/ }).click(); await page.waitForTimeout(6000);
r.received = /tour request was received/.test(await page.locator("body").innerText());
r.submit = posts;
await page.screenshot({ path: `${OUT}d5-received.png`, fullPage: true });
r.errors = errors.filter((e) => !/409/.test(e)).slice(0, 4);
console.log(JSON.stringify(r, null, 1));
await browser.close();
