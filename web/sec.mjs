import { chromium } from "playwright";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
async function look() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1800, height: 1100 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(9000);
    if (page.url().includes("login")) return { s: "SIGNED_OUT" };
    await page.getByText("Waitlist", { exact: true }).first().click();
    await page.waitForTimeout(13000);
    const items = await page.evaluate(() =>
      [...document.querySelectorAll("[data-work-secondary-item]")].map((e) => ({
        key: e.getAttribute("data-work-secondary-item"),
        text: (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
      })));
    return { s: items.length ? "SECONDARY_RENDERED" : "not-yet", items };
  } finally { await browser.close(); }
}
for (let i = 0; i < 16; i++) {
  const r = await look();
  console.log(`[${i}] ${r.s} ${JSON.stringify(r.items ?? [])}`);
  if (r.s !== "not-yet") break;
}
