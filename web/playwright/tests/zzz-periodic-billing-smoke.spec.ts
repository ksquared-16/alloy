/** Periodic Billing ACTIVE-state smoke — one authenticated GET. Nothing is reopened. */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/accounts-reachability";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1280, height: 800 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("periodic billing status", async ({ page }) => {
    await page.goto("/adminV2", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    const body = await page.evaluate(async () => {
        const r = await fetch("/api/admin/financials/periodic-billing-status", { credentials: "include" });
        return { status: r.status, json: await r.json().catch(() => null) };
    });
    log(`PERIODIC BILLING ${JSON.stringify(body)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/periodic-billing-status.json`, JSON.stringify(body, null, 2));
    expect(body.status, "the canonical status route answers").toBe(200);
});
