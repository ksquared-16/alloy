import { open, TOUR, ORIGIN } from "./lib.mjs";
const CASE = process.argv[2], PERSON = process.argv[3];
const r = {};
{
  const { browser, page } = await open();
  await page.goto(`${ORIGIN}/workspace`, { waitUntil: "networkidle", timeout: 90000 });
  r.replay = await page.evaluate(async (id) => { const x = await fetch(`/api/admin/processing/cases/${id}/approve`, { method: "POST" }); const j = await x.json(); return { status: x.status, keys: Object.keys(j.data ?? {}), tourRequest: j.data?.tourRequest, marketingConsent: j.data?.marketingConsent, opReplays: (j.data?.attempt?.operations ?? []).map((o) => o.idempotentReplay) }; }, CASE);
  r.prefs = await page.evaluate(async (id) => { const x = await fetch(`/api/admin/persons/${id}/communication-preferences`); return { status: x.status, body: await x.json() }; }, PERSON);
  await browser.close();
}
{
  const { browser, page } = await open({ auth: false });
  await page.goto(TOUR, { waitUntil: "networkidle", timeout: 90000 });
  await page.getByRole("button", { name: /October 30/ }).click(); await page.waitForTimeout(800);
  r.fridayAfter = await page.getByTestId("public-tour-times").getByRole("button").allInnerTexts();
  await browser.close();
}
console.log(JSON.stringify(r, null, 1));
