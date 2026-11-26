import { open, TOUR, openCase } from "./lib.mjs";
const OUT = new URL("./out4/", import.meta.url).pathname;
const r = {};
const slotsFor = async (page, day) => { await page.goto(TOUR, { waitUntil: "networkidle", timeout: 90000 }); const d = page.getByRole("button", { name: new RegExp(day) }); if (await d.isDisabled()) return []; await d.click(); await page.waitForTimeout(800); return page.getByTestId("public-tour-times").getByRole("button").allInnerTexts(); };
// A — family request, email consent only
{
  const { browser, page, errors } = await open({ auth: false });
  r.fridayBefore = await slotsFor(page, "October 30");
  await page.getByTestId("public-tour-times").getByRole("button", { name: "1:00 PM" }).click();
  await page.getByRole("button", { name: /Continue/ }).first().click(); await page.waitForTimeout(3500);
  r.consentControls = await page.getByTestId("public-marketing-consent").count();
  await page.getByLabel(/^Parent \/ guardian first name/).fill("Jamie");
  await page.getByLabel(/^Parent \/ guardian last name/).fill("Approvalqa");
  await page.getByLabel(/^Email\s*\*$/).fill("qa+g1approve@example.invalid");
  await page.getByLabel(/^Phone$/).fill("5415550142");
  await page.getByLabel(/^Child first name/).fill("Quinn");
  await page.getByLabel(/^Child last name/).fill("Approvalqa");
  await page.getByTestId("public-marketing-consent-email").check();
  await page.getByRole("button", { name: /^Submit$/ }).click(); await page.waitForTimeout(6000);
  r.received = /tour request was received/.test(await page.locator("body").innerText());
  await page.screenshot({ path: `${OUT}g1-received.png`, fullPage: true });
  r.familyErrors = errors.slice(0, 3);
  await browser.close();
}
// B..D — operator
{
  const { browser, page, errors } = await open();
  let caseId = null; const recs = []; let approveJson = null;
  page.on("request", (q) => { const m = /cases\/([0-9a-f-]{36})\/recommendation$/.exec(q.url()); if (m) caseId = m[1]; });
  page.on("response", async (x) => { if (/\/recommendation$/.test(x.url())) { try { recs.push((await x.json()).data); } catch {} } if (/\/approve$/.test(x.url()) && x.request().method() === "POST") { try { approveJson = { status: x.status(), body: await x.json() }; } catch {} } });
  const dlg = await openCase(page, /qa\+g1approve@/);
  await page.waitForTimeout(2500);
  const pre = (await dlg.innerText()).replace(/\n+/g, " | ");
  r.beforeApprove = { requestedTour: (pre.match(/REQUESTED TOUR \| [^|]*\| [^|]*\| [^|]*/) || [null])[0], nothingSent: /Nothing is booked and nothing has been sent/.test(pre), leadPlacement: recs.at(-1)?.leadPlacement, approveText: await page.getByTestId("processing-approve").innerText() };
  await dlg.screenshot({ path: `${OUT}g1-case-before-approve.png` });
  await page.getByTestId("processing-approve").click(); await page.waitForTimeout(12000);
  r.approve = approveJson;
  const post = (await dlg.innerText()).replace(/\n+/g, " | ");
  r.afterApproveText = post.slice(post.lastIndexOf("Jamie Approvalqa"), post.lastIndexOf("Jamie Approvalqa") + 900);
  await dlg.screenshot({ path: `${OUT}g1-case-after-approve.png` });
  // E — replay approval: exactly once
  r.replay = await page.evaluate(async (id) => { const x = await fetch(`/api/admin/processing/cases/${id}/approve`, { method: "POST" }); return { status: x.status, body: await x.json() }; }, caseId);
  r.caseId = caseId;
  r.opErrors = errors.filter((e) => !/404/.test(e)).slice(0, 3);
  await browser.close();
}
// F — capacity consumed: the booked time is no longer offered
{ const { browser, page } = await open({ auth: false }); r.fridayAfter = await slotsFor(page, "October 30"); await browser.close(); }
console.log(JSON.stringify(r, null, 1));
