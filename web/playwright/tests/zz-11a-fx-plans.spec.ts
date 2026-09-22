/**
 * The offerings, variants and rates as the resolver narrows them — so the fixture's program and
 * schedule facts are CHOSEN from the catalog rather than guessed at.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("plans", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const out = await page.evaluate(async () => {
        const j = async (u: string) => {
            const r = await fetch(u, { credentials: "include" });
            return { status: r.status, body: await r.json().catch(() => null) };
        };
        const plans = await j("/api/admin/financials/tuition-plans");
        const offerings = await j("/api/admin/programs/offerings");
        return {
            plansStatus: plans.status,
            plansKeys: plans.body && typeof plans.body === "object" ? Object.keys(plans.body as object) : null,
            plans: plans.body,
            offeringsStatus: offerings.status,
            offeringsKeys: offerings.body && typeof offerings.body === "object" ? Object.keys(offerings.body as object) : null,
            offerings: offerings.body,
        };
    });
    writeFileSync(`${OUT}/plans.json`, JSON.stringify(out, null, 2));
    log(`plans status=${out.plansStatus} keys=${JSON.stringify(out.plansKeys)}`);
    log(`offerings status=${out.offeringsStatus} keys=${JSON.stringify(out.offeringsKeys)}`);
    log(JSON.stringify(out.offerings, null, 1).slice(0, 2500));
});
