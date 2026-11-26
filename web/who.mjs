import { chromium } from "playwright";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const OPP = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE });
const page = await ctx.newPage();
await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(6000);
const out = await page.evaluate(async ([base, opp]) => {
  const tries = [
    `${base}/api/admin/opportunities/${opp}/children`,
    `${base}/api/admin/records/children?opportunity_id=${opp}`,
    `${base}/api/admin/enrollment/children?opportunity_id=${opp}`,
  ];
  for (const u of tries) {
    try {
      const r = await fetch(u, { credentials: "include" });
      if (r.ok) { const j = await r.json(); return { url: u, body: JSON.stringify(j).slice(0, 1500) }; }
    } catch {}
  }
  return { url: null, body: "no endpoint matched" };
}, [BASE, OPP]);
console.log(out.url);
console.log(out.body);
await browser.close();
