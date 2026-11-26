import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/ledger-perf";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1280, height: 800 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("how many charges does the collectible loop visit", async ({ page }) => {
    await page.goto("/adminV2", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    expect(page.url()).not.toContain("/login");
    const r = await page.evaluate(async () => {
        const res = await fetch("/api/admin/financials/card?customer_id=29944d3e-8267-45b7-8dcb-7405060e2573", { credentials: "include" });
        const st = res.headers.get("server-timing");
        const body = await res.json();
        const vm = body?.vm;
        const rows = vm?.rows ?? [];
        const period = vm?.period?.key;
        const posted = rows.filter((x: Record<string, unknown>) => x.lifecycleStatus === "posted");
        const postedThisPeriod = posted.filter((x: Record<string, unknown>) => x.periodKey === period);
        const byStatus: Record<string, number> = {};
        for (const x of rows) byStatus[String((x as Record<string, unknown>).lifecycleStatus)] = (byStatus[String((x as Record<string, unknown>).lifecycleStatus)] ?? 0) + 1;
        return {
            serverTiming: st,
            periodKey: period,
            totalRows: rows.length,
            byLifecycleStatus: byStatus,
            postedRows: posted.length,
            postedThisPeriod: postedThisPeriod.length,
            bytes: JSON.stringify(body).length,
        };
    });
    log(`COLLECTIBLE SCOPE ${JSON.stringify(r, null, 1)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/collectible-scope.json`, JSON.stringify(r, null, 2));
});
