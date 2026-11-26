import { chromium } from "playwright";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE });
const page = await ctx.newPage();
await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(8000);
await page.getByText("Waitlist", { exact: true }).first().click();
await page.waitForTimeout(12000);
await page.locator('[data-process-action="stage_work.start"]').first().click();
await page.waitForTimeout(7000);
const d = await page.evaluate(() => {
  const panel = document.querySelector('[data-work-action-panel-state], [role=dialog]');
  return { panel: panel ? (panel.textContent||"").replace(/\s+/g," ").trim().slice(0,300) : null,
           notice: [...document.querySelectorAll('[role=status],[role=alert]')].map(n=>(n.textContent||"").trim()).filter(Boolean).slice(0,3) };
});
console.log(JSON.stringify(d, null, 1));
await browser.close();
