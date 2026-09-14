/** What id form does the Waitlist work view actually use for row selection? */
import { test, expect } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012" });

test("list waitlist work view rows", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/workspace/work-unit/waitlist?work_view_id=new_work_view_4");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(20_000);
    const rows = page.locator("[data-entity-id]");
    const n = await rows.count();
    /* eslint-disable no-console */
    console.log(`##### entity rows = ${n}`);
    for (let i = 0; i < Math.min(n, 8); i++) {
        const r = rows.nth(i);
        console.log(`   [${i}] data-entity-id=${await r.getAttribute("data-entity-id")} :: ${(await r.innerText()).replace(/\s+/g, " ").slice(0, 70)}`);
    }
    const body = await page.locator("body").innerText();
    console.log("##### names Kurzman: " + body.includes("Kurzman"));
    console.log("##### BODY:\n" + body.slice(0, 900));
    /* eslint-enable no-console */
    expect(n).toBeGreaterThanOrEqual(0);
});
