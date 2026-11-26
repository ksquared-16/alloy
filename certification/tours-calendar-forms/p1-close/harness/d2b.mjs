import { open, openCase } from "./lib.mjs";
const { browser, page } = await open();
let caseId = null;
page.on("request", (q) => { const m = /cases\/([0-9a-f-]{36})\/recommendation$/.exec(q.url()); if (m) caseId = m[1]; });
await openCase(page, /qa\+enrtour2@/);
await page.waitForTimeout(2000);
const res = await page.evaluate(async (id) => { const r = await fetch(`/api/admin/processing/cases/${id}/approve`, { method: "POST", credentials: "include" }); return { status: r.status, body: (await r.text()).slice(0, 300) }; }, caseId);
console.log(JSON.stringify({ caseIdFound: Boolean(caseId), ...res }));
await browser.close();
