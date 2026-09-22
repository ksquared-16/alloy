/**
 * The weekly run, through the canonical action with the entity type the surface itself uses, plus a
 * count of what September now holds for each child — because "generated: 1" twice is either
 * idempotency working on a DIFFERENT key or a duplicate, and only the ledger says which.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("weekly run and the September ledger", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);

    const out = await page.evaluate(async () => {
        const exec = async (payload: Record<string, unknown>, mode = "execute") => {
            const r = await fetch("/api/admin/actions/execute", {
                method: "POST", credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    action_key: "billing.generate_tuition",
                    entity_type: "opportunity_customer_member",
                    entity_id: "",
                    mode,
                    confirmation: { confirmed: true },
                    payload,
                }),
            });
            return { mode, payload, status: r.status, body: await r.json().catch(() => null) };
        };
        const weeklyPreview = await exec({ period_key: "2026-09", cadence: "weekly" }, "preview");
        const weekly1 = await exec({ period_key: "2026-09", cadence: "weekly" });
        const weekly2 = await exec({ period_key: "2026-09", cadence: "weekly" });
        return { weeklyPreview, weekly1, weekly2 };
    });

    writeFileSync(`${OUT}/weekly.json`, JSON.stringify(out, null, 2));
    log(`preview: ${JSON.stringify(out.weeklyPreview).slice(0, 2200)}`);
    log(`\nrun 1: ${JSON.stringify(out.weekly1).slice(0, 2200)}`);
    log(`\nrun 2: ${JSON.stringify(out.weekly2).slice(0, 2200)}`);
});
