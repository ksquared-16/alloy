import { chromium } from "playwright";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE });
const page = await ctx.newPage();
const patches = [];
page.on("response", async (r) => {
  if (r.url().includes("/lifecycle-builder") && r.request().method() === "PATCH") {
    try { patches.push({ action: JSON.parse(r.request().postData() || "{}").action, status: r.status() }); } catch {}
  }
});
await page.goto(`${BASE}/organization/processes`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(5000);
await page.getByText("Stages", { exact: true }).first().click();
await page.waitForTimeout(8000);

const box = page.locator('[data-testid="stage-startable-work-offer_spot"]');
console.log("checkbox before:", await box.isChecked());
await box.check();
await page.waitForTimeout(1500);
console.log("checkbox after:", await box.isChecked());
console.log("section:", (await page.locator('[data-testid="stage-startable-work"]').innerText()).slice(0, 400));

// Save the stage through its own control.
for (const name of ["Save stage", "Save", "Save changes"]) {
  const b = page.getByRole("button", { name, exact: true });
  if (await b.count() && await b.first().isVisible()) {
    await b.first().click();
    console.log("clicked:", name);
    break;
  }
}
await page.waitForTimeout(9000);
console.log("PATCHES:", JSON.stringify(patches));
await browser.close();
