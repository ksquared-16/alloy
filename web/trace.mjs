import { chromium } from "playwright";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1800, height: 1100 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(9000);
if (page.url().includes("login")) { console.log("SIGNED_OUT"); await browser.close(); process.exit(1); }
await page.getByText("Waitlist", { exact: true }).first().click();
await page.waitForTimeout(13000);

const d = await page.evaluate(() => {
  const proj = window.__ALLOY_PROCESS_COMMAND_PROJECTION ?? [];
  const diag = window.__ALLOY_QUEUE_ROW_SURFACE_DIAG__ ?? null;
  return {
    subject: diag?.firstRow?.context?.drawer_open_active_subject ?? null,
    commandKeys: proj[0]?.commandKeys ?? [],
    planTemplates: proj[0]?.planTemplates ?? null,
    drift: window.__ALLOY_PROCESS_COMMAND_DRIFT ?? [],
  };
});
console.log("SUBJECT:", JSON.stringify(d.subject));
console.log("commandKeys:", JSON.stringify(d.commandKeys));
console.log("planTemplates:", JSON.stringify(d.planTemplates));
console.log("drift:", JSON.stringify(d.drift));
await browser.close();
