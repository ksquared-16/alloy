import { chromium } from "playwright";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE });
const page = await ctx.newPage();
const calls = [];
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("command") || u.includes("capabilit")) {
    try { calls.push({ u: u.replace(BASE, ""), status: r.status(), body: JSON.stringify(await r.json()).slice(0, 1500) }); } catch {}
  }
});
await page.goto(`${BASE}/organization/processes`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(5000);
await page.getByText("Commands", { exact: true }).first().click();
await page.waitForTimeout(7000);
for (const c of calls) console.log(c.u, c.status, "\n", c.body, "\n---");
await browser.close();
