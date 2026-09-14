import { chromium } from "playwright";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const OPP = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";
const OFFER_WORK = "767e56ef-d947-434a-b504-02ccfa86719e";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1800, height: 1100 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(9000);
await page.getByText("Waitlist", { exact: true }).first().click();
await page.waitForTimeout(13000);
const lennon = page.getByText("Lennon Kurzman", { exact: true }).first();
if (await lennon.count()) { await lennon.click({ force: true }); await page.waitForTimeout(7000); }

// The app's own focus event — the supported path other surfaces use to drill into Current Work
// and focus a specific work item.
await page.evaluate(([opp, workId]) => {
  window.dispatchEvent(new CustomEvent("adminv2:opportunity-focus-current-work", {
    detail: { opportunity_id: opp, task_id: workId },
  }));
}, [OPP, OFFER_WORK]);
await page.waitForTimeout(9000);

console.log("also-in-progress:", await page.evaluate(() => {
  const el = document.querySelector('[data-work-section="also-in-progress"]');
  return el ? (el.textContent||"").replace(/\s+/g," ").trim().slice(0,300) : null;
}));
console.log("secondary items:", await page.evaluate(() =>
  JSON.stringify([...document.querySelectorAll("[data-work-secondary-item]")].map((e) => e.getAttribute("data-work-secondary-item")))));
console.log("workspace present:", await page.evaluate(() => Boolean(document.querySelector('[data-current-work-workspace]'))));
console.log("--- body ---");
console.log((await page.evaluate(() => document.body.innerText.split("BOS")[0])).slice(0, 900));
await browser.close();
