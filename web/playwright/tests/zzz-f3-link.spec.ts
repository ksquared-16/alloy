/** F3 — the final link: does workspace.operational_projection exist, and does it carry cards? */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1";
const DRAWER = "/api/admin/view-models/drawer/opportunity/e56e72d5-c7bc-41ff-8d34-f5d34fd4160a";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the operational_projection, exactly", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(40_000);
    const r = await page.evaluate(async (url) => {
        const res = await fetch(url, { credentials: "include" });
        const j = (await res.json()) as Record<string, unknown>;
        const ws = j.workspace as Record<string, unknown> | undefined;
        const op = ws?.operational_projection as Record<string, unknown> | undefined;
        return {
            workspaceKeys: ws ? Object.keys(ws) : null,
            projectionPresent: op !== undefined,
            projectionIsNull: op === null,
            projectionKeys: op ? Object.keys(op) : null,
            hasCardsKey: op ? Object.prototype.hasOwnProperty.call(op, "cards") : null,
            cardsValue: op && "cards" in op ? JSON.stringify((op as Record<string, unknown>).cards)?.slice(0, 200) ?? "undefined" : "KEY ABSENT",
        };
    }, DRAWER);
    log(`OPERATIONAL_PROJECTION: ${JSON.stringify(r, null, 1)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/f3-operational-projection.json`, JSON.stringify(r, null, 2));
    expect(true).toBe(true);
});
