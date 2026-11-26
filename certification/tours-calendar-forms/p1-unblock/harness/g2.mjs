import { open, TOUR, ORIGIN, openCase } from "./lib.mjs";
const OUT = new URL("./out4/", import.meta.url).pathname;
const BOOKING = process.argv[2];
const r = {};
{ // (a) staff confirms the pending-approval booking through the canonical route
  const { browser, page } = await open();
  await page.goto(`${ORIGIN}/workspace`, { waitUntil: "networkidle", timeout: 90000 });
  r.confirm = await page.evaluate(async (id) => { const x = await fetch(`/api/admin/tours/bookings/${id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); return { status: x.status, body: await x.json() }; }, BOOKING);
  r.confirmAgain = await page.evaluate(async (id) => { const x = await fetch(`/api/admin/tours/bookings/${id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); return { status: x.status, body: await x.json() }; }, BOOKING);
  await browser.close();
}
{ // (b) auto-confirm schedule: Monday Nov 2, 10:00 AM (location "Monday window", auto-confirm)
  const { browser, page } = await open({ auth: false });
  await page.goto(TOUR, { waitUntil: "networkidle", timeout: 90000 });
  await page.getByRole("button", { name: /›|Next month/ }).first().click().catch(() => {}); await page.waitForTimeout(800);
  await page.getByRole("button", { name: /November 2\b/ }).click(); await page.waitForTimeout(800);
  r.mondayTimes = await page.getByTestId("public-tour-times").getByRole("button").allInnerTexts();
  await page.getByTestId("public-tour-times").getByRole("button", { name: "10:00 AM" }).click();
  await page.getByRole("button", { name: /Continue/ }).first().click(); await page.waitForTimeout(3500);
  await page.getByLabel(/^Parent \/ guardian first name/).fill("Avery");
  await page.getByLabel(/^Parent \/ guardian last name/).fill("Autoconfirmqa");
  await page.getByLabel(/^Email\s*\*$/).fill("qa+g2auto@example.invalid");
  await page.getByLabel(/^Child first name/).fill("Remy");
  await page.getByLabel(/^Child last name/).fill("Autoconfirmqa");
  await page.getByRole("button", { name: /^Submit$/ }).click(); await page.waitForTimeout(6000);
  r.autoReceived = /tour request was received/.test(await page.locator("body").innerText());
  await browser.close();
}
{
  const { browser, page } = await open();
  let approveJson = null;
  page.on("response", async (x) => { if (/\/approve$/.test(x.url()) && x.request().method() === "POST") { try { const j = await x.json(); approveJson = { status: x.status(), tourRequest: j.data?.tourRequest, marketingConsent: j.data?.marketingConsent, lead: j.data?.operationalResult?.records?.lead, person: j.data?.operationalResult?.records?.person }; } catch {} } });
  const dlg = await openCase(page, /qa\+g2auto@/);
  await page.waitForTimeout(2000);
  await page.getByTestId("processing-approve").click(); await page.waitForTimeout(12000);
  r.autoApprove = approveJson;
  await dlg.screenshot({ path: `${OUT}g2-auto-after-approve.png` });
  await browser.close();
}
console.log(JSON.stringify(r, null, 1));
