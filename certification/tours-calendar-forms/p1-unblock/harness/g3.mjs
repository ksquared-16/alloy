import { open, TOUR, ORIGIN, openCase, riversideTours } from "./lib.mjs";
const OUT = new URL("./out4/", import.meta.url).pathname;
const PERSON = process.argv[2];
const r = {};
const request = async ({ dayRe, time, first, last, email, consent }) => {
  const { browser, page } = await open({ auth: false });
  await page.goto(TOUR, { waitUntil: "networkidle", timeout: 90000 });
  await page.getByRole("button", { name: dayRe }).click(); await page.waitForTimeout(800);
  await page.getByTestId("public-tour-times").getByRole("button", { name: time }).click();
  await page.getByRole("button", { name: /Continue/ }).first().click(); await page.waitForTimeout(3500);
  await page.getByLabel(/^Parent \/ guardian first name/).fill(first);
  await page.getByLabel(/^Parent \/ guardian last name/).fill(last);
  await page.getByLabel(/^Email\s*\*$/).fill(email);
  await page.getByLabel(/^Child first name/).fill("Quinn");
  await page.getByLabel(/^Child last name/).fill(last);
  if (consent) await page.getByTestId("public-marketing-consent-email").check();
  await page.getByRole("button", { name: /^Submit$/ }).click(); await page.waitForTimeout(6000);
  const ok = /tour request was received/.test(await page.locator("body").innerText());
  await browser.close(); return ok;
};
const approveCase = async (emailRe, shot) => {
  const { browser, page } = await open();
  let approveJson = null;
  page.on("response", async (x) => { if (/\/approve$/.test(x.url()) && x.request().method() === "POST") { try { const j = await x.json(); approveJson = { status: x.status(), matchedExisting: j.data?.operationalResult?.matchedExisting, person: j.data?.operationalResult?.records?.person, lead: j.data?.operationalResult?.records?.lead, tourRequest: j.data?.tourRequest, marketingConsent: j.data?.marketingConsent, error: j.error }; } catch {} } });
  const dlg = await openCase(page, emailRe); await page.waitForTimeout(2000);
  if (await page.getByRole("button", { name: /^Resolve matches to approve$/ }).count()) {
    await page.getByRole("button", { name: /^Review matches$/ }).click(); await page.waitForTimeout(2500);
    const rd = page.locator('[role="dialog"]').last();
    await rd.getByRole("button", { name: /^Same child$/ }).click(); await page.waitForTimeout(1500);
    await rd.getByRole("button", { name: /^Done$/ }).click(); await page.waitForTimeout(4000);
  }
  const btn = page.getByTestId("processing-approve");
  const label = await btn.innerText();
  await btn.click(); await page.waitForTimeout(12000);
  await dlg.screenshot({ path: `${OUT}${shot}.png` });
  await browser.close(); return { label, ...approveJson };
};
const prefs = async (personId) => { const { browser, page } = await open(); await page.goto(`${ORIGIN}/workspace`, { waitUntil: "networkidle" }); const p = await page.evaluate(async (id) => { const x = await fetch(`/api/admin/persons/${id}/communication-preferences`); const j = await x.json(); return Object.fromEntries(j.data.preferences.filter((q) => /marketing/.test(q.key)).map((q) => [q.key, { state: q.state, last: q.lastChange?.source ?? null }])); }, personId); await browser.close(); return p; };

// 13 — (opt-out PATCH and the repeat request already ran in the first attempt)
r.prefsAfterOptOut = await prefs(PERSON);
r.repeatApprove = await approveCase(/qa\+g1approve@[\s\S]*Thu, Oct 29|Thu, Oct 29[\s\S]*qa\+g1approve@/, "g3-repeat-optout-approved");
r.prefsAfterRepeat = await prefs(PERSON);

// 14 — the requested time becomes unavailable before approval
r.unavailReceived = await request({ dayRe: /October 30/, time: "1:30 PM", first: "Casey", last: "Reschedqa", email: "qa+g3resched@example.invalid", consent: false });
const setWeekdays = async (on) => {
  const { browser, page } = await open(); await riversideTours(page);
  const card = page.locator("li", { hasText: "QA Weekdays" }).first();
  await card.getByRole("button", { name: /^Edit$/ }).click(); await page.waitForTimeout(1000);
  const cb = page.getByTestId("locations-tour-active").first(); if ((await cb.isChecked()) !== on) await cb.click();
  await page.getByRole("button", { name: /^Save schedule$/ }).click(); await page.waitForTimeout(3000);
  const t = (await card.innerText()).replace(/\n+/g, " ").slice(0, 60); await browser.close(); return t;
};
r.weekdaysOff = await setWeekdays(false);
r.unavailApprove = await approveCase(/qa\+g3resched@/, "g3-unavailable-approved");
r.weekdaysOn = await setWeekdays(true);
console.log(JSON.stringify(r, null, 1));
