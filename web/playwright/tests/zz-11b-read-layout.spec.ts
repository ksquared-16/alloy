import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("read the published focus panel summary layout", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    expect(page.url()).not.toContain("/login");
    const o = await page.evaluate(async () => {
        const r = await fetch("/api/admin/entity-layouts/focus-panel-summary", { credentials: "include" });
        const b = await r.json().catch(() => null);
        return { status: r.status, body: b };
    });
    log(JSON.stringify(o).slice(0, 3000));
    writeFileSync("../certification/financials/11b-audit/published-layout-before.json", JSON.stringify(o, null, 2));
});
