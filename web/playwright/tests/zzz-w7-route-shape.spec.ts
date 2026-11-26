/** §3 trace: does the DEPLOYED responsibility-positions route emit responsiblePartyId? */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/responsibility";
const CUST = "7796a568-3b5f-4606-80f9-fee2dae2a419";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the deployed route's household shares", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(25_000);
    const r = await page.evaluate(async (cust) => {
        const res = await fetch(`/api/admin/financials/responsibility-positions?customer_id=${cust}`, { credentials: "include" });
        const j = (await res.json()) as Record<string, unknown>;
        const hh = j.household as { shares?: Array<Record<string, unknown>> } | null;
        return {
            status: res.status,
            topKeys: Object.keys(j),
            householdPresent: hh != null,
            shareCount: hh?.shares?.length ?? 0,
            firstShareKeys: hh?.shares?.[0] ? Object.keys(hh.shares[0]) : null,
            firstShare: hh?.shares?.[0] ? JSON.stringify(hh.shares[0]) : null,
        };
    }, CUST);
    log(`ROUTE: ${JSON.stringify(r, null, 1)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/deployed-route-shape.json`, JSON.stringify(r, null, 2));
    expect(r.status).toBe(200);
});
