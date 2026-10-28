import { open, openCase } from "./lib.mjs";
const OUT = new URL("./out3/", import.meta.url).pathname;
const label = process.argv[2] || "before";
const { browser, page, errors } = await open();
const recs = [];
page.on("response", async (r) => { if (/\/recommendation$/.test(r.url())) { try { const j = await r.json(); recs.push({ leadPlan: j.data?.leadPlan, leadPlacement: j.data?.leadPlacement }); } catch {} } });
const dlg = await openCase(page, /qa\+enrtour2@/);
await page.waitForTimeout(2500);
const notice = page.getByTestId("processing-lead-placement-blocked");
const approve = page.getByTestId("processing-approve");
const r = {
  recommendation: recs.at(-1),
  notice: (await notice.count()) ? (await notice.first().innerText()).replace(/\n+/g, " | ") : null,
  approveText: await approve.innerText().catch(() => null),
  approveDisabled: await approve.isDisabled().catch(() => null),
  approveTitle: await approve.getAttribute("title").catch(() => null),
  errors: errors.slice(0, 3),
};
await dlg.screenshot({ path: `${OUT}d2-case-${label}.png` });
console.log(JSON.stringify(r, null, 1));
await browser.close();
