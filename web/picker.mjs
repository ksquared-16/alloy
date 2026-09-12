import { chromium } from "playwright";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1800, height: 1100 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(9000);
await page.getByText("Waitlist", { exact: true }).first().click();
await page.waitForTimeout(13000);

const before = await page.evaluate(() => ({
  drawer: Boolean(document.querySelector('[data-current-work-workspace], .alloy-os-currentwork__primary-action')),
  recordBtn: Boolean(document.querySelector('[data-process-action="record_outcome"]')),
}));
console.log("before:", JSON.stringify(before));

await page.locator('[data-process-action="record_outcome"]').first().click();
await page.waitForTimeout(9000);

const after = await page.evaluate(() => ({
  workspace: Boolean(document.querySelector('[data-current-work-workspace]')),
  completionPhase: document.querySelector('[data-work-completion]')?.getAttribute("data-work-completion") ?? null,
  outcomeNodes: [...document.querySelectorAll('[data-work-outcome], [data-outcome-key], [data-work-completion] button')]
    .map((e) => ({ k: e.getAttribute("data-outcome-key") ?? e.getAttribute("data-work-outcome"), t: (e.textContent||"").replace(/\s+/g," ").trim().slice(0,40) }))
    .slice(0, 12),
}));
console.log("after:", JSON.stringify(after, null, 1));
await browser.close();
