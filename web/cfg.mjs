import { chromium } from "playwright";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE });
const page = await ctx.newPage();
const calls = [];
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("/lifecycle-builder") && r.request().method() === "PATCH") {
    try { calls.push({ action: JSON.parse(r.request().postData()||"{}").action, status: r.status(), err: (await r.json()).error ?? null }); } catch {}
  }
});
await page.goto(`${BASE}/organization/processes`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(5000);
await page.getByText("Stages", { exact: true }).first().click();
await page.waitForTimeout(8000);

const box = page.locator('[data-testid="stage-startable-work-offer_spot"]');
console.log("checked already?", await box.isChecked());
if (!(await box.isChecked())) {
  await box.check();
  await page.waitForTimeout(2000);
  const save = page.locator('[data-testid="stage-editor-v2-save"]');
  console.log("save disabled?", await save.isDisabled());
  await save.click();
  await page.waitForTimeout(12000);
}
console.log("PATCH calls:", JSON.stringify(calls));

const stored = await page.evaluate(async ([base, dept]) => {
  const r = await fetch(`${base}/api/admin/departments/${dept}/lifecycle-builder`, { credentials: "include" });
  const b = await r.json();
  const wl = (b.config?.processes?.[0]?.stages ?? []).find((s) => s.key === "waitlist");
  return wl?.action_catalog_v1 ?? null;
}, [BASE, DEPT]);
console.log("stored action_catalog_v1:", JSON.stringify(stored));
await browser.close();
